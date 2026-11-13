// ============================================================
// Failure context
// ------------------------------------------------------------
// Rebuilds the evidence for one failed run from stored rows: the
// broken stage and its log, sibling deploys in the same DAG level,
// per-test flake history, the previous run on the branch and the
// stage's green baseline. Shared by the rediagnose endpoint and
// GitHub Actions ingestion, so a verdict computed at ingestion and
// one recomputed on demand see the same evidence.
// ============================================================

import {
  getDb,
  schema,
  pipelineRuns,
  pipelineStages,
  environments,
  flakyTests,
  and,
  desc,
  eq,
} from '@codelens/db';
import type { FailureContext, FailingTest } from '@codelens/shared';

type Repository = typeof schema.repositories.$inferSelect;
type Run = typeof pipelineRuns.$inferSelect;
type Stage = typeof pipelineStages.$inferSelect;

export interface ContextExtras {
  /** Paths the run's commit touched, when known. */
  filesChanged?: string[];
  /** Configuration keys that differ between the failing target and its peers. */
  configDrift?: { key: string; expected: string; actual: string }[];
  /**
   * Flake history as of the run, keyed by test name. Ingestion passes this
   * so a verdict never uses failures that happened after the run; without
   * it the stored flaky_tests table is used.
   */
  flakeHistory?: Map<string, FailingTest>;
}

export interface BuiltContext {
  context: FailureContext;
  broken: Stage;
  failingTests: FailingTest[];
  siblingRegionResults: { region: string; status: string }[];
  greenBaselineSamples: number;
}

const LOCKFILES =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|Pipfile\.lock|go\.sum|Cargo\.lock|Gemfile\.lock)$/;

/** Ingestion records the diff and config evidence it used in the stage summary. */
function storedEvidence(summary: string): Pick<ContextExtras, 'filesChanged' | 'configDrift'> {
  try {
    const evidence = (JSON.parse(summary) as { evidence?: ContextExtras }).evidence;
    return {
      filesChanged: Array.isArray(evidence?.filesChanged) ? evidence.filesChanged : undefined,
      configDrift: Array.isArray(evidence?.configDrift) ? evidence.configDrift : undefined,
    };
  } catch {
    return {};
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Returns null when the run did not fail or its failed stage is missing. */
export async function buildFailureContext(
  repository: Repository,
  run: Run,
  extras: ContextExtras = {},
): Promise<BuiltContext | null> {
  if (run.status !== 'failed' || !run.failedStage) return null;
  const db = getDb();

  const stageRows = await db.select().from(pipelineStages).where(eq(pipelineStages.runId, run.id));
  const broken = stageRows.find((s) => s.stageKey === run.failedStage);
  if (!broken) return null;
  const stored = storedEvidence(broken.summary);
  const filesChanged = extras.filesChanged ?? stored.filesChanged ?? [];
  const configDrift = extras.configDrift ?? stored.configDrift;

  const envRows = await db.select().from(environments).where(eq(environments.repositoryId, repository.id));
  const brokenEnv = broken.environmentId ? envRows.find((e) => e.id === broken.environmentId) : undefined;

  // Sibling deploys at the same DAG level: the region asymmetry the
  // classifier keys on.
  const siblingRegionResults = stageRows
    .filter((s) => s.kind === 'deploy' && s.sequence === broken.sequence && s.environmentId)
    .map((s) => ({
      region: envRows.find((e) => e.id === s.environmentId)?.region ?? 'unknown',
      status: s.status,
    }));

  // Flake history for tests named in the failing stage's log.
  let failingTests: FailingTest[];
  if (extras.flakeHistory) {
    failingTests = [...extras.flakeHistory.values()].filter((t) => broken.log.includes(t.name));
  } else {
    const flakeRows = await db.select().from(flakyTests).where(eq(flakyTests.repositoryId, repository.id));
    failingTests = flakeRows
      .filter((f) => broken.log.includes(f.testName))
      .map((f) => ({
        name: f.testName,
        file: f.filePath,
        suite: f.suite,
        flakeRate: f.flakeRate,
        distinctBranches: f.distinctBranches,
        runCount: f.runCount,
        firstFailure: false,
      }));
  }

  // Was the previous run on this branch green?
  const previous = (
    await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repositoryId, repository.id), eq(pipelineRuns.branch, run.branch)))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(20)
  ).find((r) => r.startedAt < run.startedAt && (r.status === 'success' || r.status === 'failed'));

  // Median duration of this stage across green runs before this one.
  const baselineRows = await db
    .select({ durationMs: pipelineStages.durationMs, startedAt: pipelineRuns.startedAt })
    .from(pipelineStages)
    .innerJoin(pipelineRuns, eq(pipelineStages.runId, pipelineRuns.id))
    .where(
      and(
        eq(pipelineRuns.repositoryId, repository.id),
        eq(pipelineStages.stageKey, broken.stageKey),
        eq(pipelineStages.status, 'success'),
      ),
    );
  const baseline = baselineRows.filter((r) => r.startedAt <= run.startedAt);

  const context: FailureContext = {
    stage: {
      key: broken.stageKey,
      name: broken.name,
      kind: broken.kind,
      exitCode: broken.exitCode,
      durationMs: broken.durationMs,
      attempts: broken.attempts,
      log: broken.log,
      baselineDurationMs: median(baseline.map((r) => r.durationMs ?? 0).filter((n) => n > 0)),
      region: brokenEnv?.region ?? null,
      environment: brokenEnv?.name ?? null,
    },
    run: {
      branch: run.branch,
      defaultBranch: repository.defaultBranch,
      trigger: run.trigger,
      commitSha: run.commitSha,
      commitMessage: run.commitMessage,
      commitAuthor: run.commitAuthor,
      filesChanged,
    },
    history: {
      failingTests,
      previousRunOnBranchPassed: previous ? previous.status === 'success' : undefined,
      siblingRegionResults: siblingRegionResults.length > 1 ? siblingRegionResults : undefined,
      lockfileChanged: filesChanged.some((path) => LOCKFILES.test(path)) || undefined,
      configDrift: configDrift?.length ? configDrift : undefined,
    },
  };
  return { context, broken, failingTests, siblingRegionResults, greenBaselineSamples: baseline.length };
}
