// ============================================================
// Delivery pipeline API
// ============================================================
// Every route is a GET, including the two that look like commands
// (rediagnose, blast-radius). Both are pure computations over data
// the caller can already read, and keeping them idempotent means
// they inherit the existing repository-ownership middleware in
// index.ts without needing an exception for the public demo.
// ============================================================

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  getDb,
  schema,
  pipelines,
  pipelineRuns,
  pipelineStages,
  pipelineDiagnoses,
  environments,
  environmentDeployments,
  flakyTests,
  diagnosisBenchmarkRuns,
  and,
  asc,
  desc,
  eq,
  inArray,
} from '@codelens/db';
import {
  diagnose,
  computeBlastRadius,
  inferRole,
  CATEGORY_LABELS,
  ACTION_LABELS,
  isChangeExonerated,
  type FailureContext,
  type FailingTest,
  type GraphFile,
  type FileRole,
} from '@codelens/shared';

export const pipelineRoutes = new Hono();
const db = getDb();

function fail(message: string, status: 404 | 400 = 404): never {
  throw new HTTPException(status, { message });
}

function json<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

async function requireRepository(id: string) {
  const row = (await db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).limit(1))[0];
  if (!row) fail('Repository not found');
  return row;
}

/** Shared shape for a run in list views. */
function runSummary(
  run: typeof pipelineRuns.$inferSelect,
  pipelineName: string,
  diagnosis?: typeof pipelineDiagnoses.$inferSelect,
) {
  return {
    id: run.id,
    runNumber: run.runNumber,
    pipeline: pipelineName,
    branch: run.branch,
    targetTier: run.targetTier,
    commitSha: run.commitSha,
    commitShort: run.commitSha.slice(0, 7),
    commitMessage: run.commitMessage,
    commitAuthor: run.commitAuthor,
    trigger: run.trigger,
    pullRequestNumber: run.pullRequestNumber,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    queuedMs: run.queuedMs,
    actor: run.actor,
    failedStage: run.failedStage,
    diagnosis: diagnosis
      ? {
          category: diagnosis.category,
          categoryLabel: CATEGORY_LABELS[diagnosis.category] ?? diagnosis.category,
          title: diagnosis.title,
          confidence: diagnosis.confidence,
          recommendedAction: diagnosis.recommendedAction,
          actionLabel: ACTION_LABELS[diagnosis.recommendedAction] ?? diagnosis.recommendedAction,
          exonerated: isChangeExonerated(diagnosis.category),
        }
      : null,
  };
}

// ============================================================
// GET /repositories/:id/delivery-overview
// ============================================================
// One request, everything the pipeline landing screen needs. Built
// as a single endpoint rather than six because the screen is
// useless partially loaded, and a waterfall of six round trips is
// what made the old dashboard feel slow.

pipelineRoutes.get('/repositories/:id/delivery-overview', async (c) => {
  const repository = await requireRepository(c.req.param('id'));

  const [pipelineRows, envRows, runRows] = await Promise.all([
    db.select().from(pipelines).where(eq(pipelines.repositoryId, repository.id)),
    db.select().from(environments).where(eq(environments.repositoryId, repository.id)),
    db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.repositoryId, repository.id))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(60),
  ]);

  const diagnosisRows = runRows.length
    ? await db
        .select()
        .from(pipelineDiagnoses)
        .where(
          inArray(
            pipelineDiagnoses.runId,
            runRows.map((r) => r.id),
          ),
        )
    : [];
  const diagnosisByRun = new Map(diagnosisRows.map((d) => [d.runId, d]));
  const pipelineById = new Map(pipelineRows.map((p) => [p.id, p]));

  const finished = runRows.filter((r) => r.status === 'success' || r.status === 'failed');
  const failed = finished.filter((r) => r.status === 'failed');
  const durations = finished.map((r) => r.durationMs ?? 0).filter((d) => d > 0);

  // Time-to-diagnosis is the product's actual claim, so it is
  // computed from the stored compute times rather than asserted.
  const diagnosisMs = diagnosisRows.map((d) => d.computeMs).filter((n) => n > 0);

  const categoryCounts: Record<string, number> = {};
  for (const d of diagnosisRows) categoryCounts[d.category] = (categoryCounts[d.category] ?? 0) + 1;

  const exonerated = diagnosisRows.filter((d) => isChangeExonerated(d.category)).length;

  return c.json({
    data: {
      repository: {
        id: repository.id,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        language: repository.language,
        description: repository.description,
        lastAnalyzedAt: repository.lastAnalyzedAt,
      },
      pipelines: pipelineRows.map((p) => ({
        id: p.id,
        name: p.name,
        provider: p.provider,
        filePath: p.filePath,
        successRate: p.successRate,
        p50DurationMs: p.p50DurationMs,
        lastRunAt: p.lastRunAt,
      })),
      environments: envRows
        .map((e) => ({
          id: e.id,
          name: e.name,
          tier: e.tier,
          region: e.region,
          regionLabel: e.regionLabel,
          provider: e.provider,
          cluster: e.cluster,
          url: e.url,
          requiresApproval: e.requiresApproval,
          status: e.status,
          currentVersion: e.currentVersion,
          currentCommitSha: e.currentCommitSha,
          currentCommitShort: e.currentCommitSha?.slice(0, 7) ?? null,
          deployedAt: e.deployedAt,
          trafficPct: e.trafficPct,
          errorRate: e.errorRate,
          latencyP95: e.latencyP95,
          requestsPerMin: e.requestsPerMin,
          replicas: e.replicas,
        }))
        .sort(
          (a, b) =>
            ['development', 'staging', 'production'].indexOf(a.tier) -
              ['development', 'staging', 'production'].indexOf(b.tier) || a.region.localeCompare(b.region),
        ),
      runs: runRows
        .slice(0, 25)
        .map((r) =>
          runSummary(r, pipelineById.get(r.pipelineId)?.name ?? 'Pipeline', diagnosisByRun.get(r.id)),
        ),
      stats: {
        windowRuns: finished.length,
        successRate: finished.length ? 1 - failed.length / finished.length : null,
        failedRuns: failed.length,
        p50DurationMs: median(durations),
        p95DurationMs: percentile(durations, 0.95),
        diagnosedFailures: diagnosisRows.length,
        // Share of failures where the engine cleared the author's change.
        exoneratedFailures: exonerated,
        exoneratedPct: diagnosisRows.length ? exonerated / diagnosisRows.length : null,
        p95DiagnosisMs: percentile(diagnosisMs, 0.95),
        categoryCounts,
        activeRuns: runRows.filter((r) => r.status === 'running' || r.status === 'queued').length,
      },
    },
  });
});

// ============================================================
// GET /repositories/:id/pipeline-runs
// ============================================================

pipelineRoutes.get('/repositories/:id/pipeline-runs', async (c) => {
  const repository = await requireRepository(c.req.param('id'));
  const { branch, status, tier, category, limit } = c.req.query();

  const conditions = [eq(pipelineRuns.repositoryId, repository.id)];
  if (branch) conditions.push(eq(pipelineRuns.branch, branch));
  if (status) conditions.push(eq(pipelineRuns.status, status as never));
  if (tier) conditions.push(eq(pipelineRuns.targetTier, tier));

  const rows = await db
    .select()
    .from(pipelineRuns)
    .where(and(...conditions))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(Math.min(200, Number(limit) || 60));

  const [pipelineRows, diagnosisRows] = await Promise.all([
    db.select().from(pipelines).where(eq(pipelines.repositoryId, repository.id)),
    rows.length
      ? db
          .select()
          .from(pipelineDiagnoses)
          .where(
            inArray(
              pipelineDiagnoses.runId,
              rows.map((r) => r.id),
            ),
          )
      : Promise.resolve([]),
  ]);
  const pipelineById = new Map(pipelineRows.map((p) => [p.id, p]));
  const diagnosisByRun = new Map(diagnosisRows.map((d) => [d.runId, d]));

  let summaries = rows.map((r) =>
    runSummary(r, pipelineById.get(r.pipelineId)?.name ?? 'Pipeline', diagnosisByRun.get(r.id)),
  );
  // Category is filtered after the join rather than in SQL: the
  // diagnosis table is one row per run, so this is cheap, and it keeps
  // the query builder from needing a left join it cannot express.
  if (category) summaries = summaries.filter((s) => s.diagnosis?.category === category);

  // Facets are derived from the unfiltered branch set so the filter
  // bar does not shrink as you use it.
  const allRuns = await db
    .select({ branch: pipelineRuns.branch, status: pipelineRuns.status })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.repositoryId, repository.id));

  const branches = [...new Set(allRuns.map((r) => r.branch))].sort((a, b) =>
    a === repository.defaultBranch ? -1 : b === repository.defaultBranch ? 1 : a.localeCompare(b),
  );

  return c.json({
    data: summaries,
    facets: {
      branches,
      statuses: [...new Set(allRuns.map((r) => r.status))],
      categories: [...new Set(diagnosisRows.map((d) => d.category))].map((id) => ({
        id,
        label: CATEGORY_LABELS[id as never] ?? id,
      })),
    },
    total: summaries.length,
  });
});

// ============================================================
// GET /repositories/:id/pipeline-runs/:runNumber
// ============================================================
// The full flow view: stage DAG, logs, diagnosis with its signals,
// and the deployment records the run produced.

pipelineRoutes.get('/repositories/:id/pipeline-runs/:runNumber', async (c) => {
  const repository = await requireRepository(c.req.param('id'));
  const runNumber = Number(c.req.param('runNumber'));
  if (!Number.isFinite(runNumber)) fail('Invalid run number', 400);

  const run = (
    await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repositoryId, repository.id), eq(pipelineRuns.runNumber, runNumber)))
      .limit(1)
  )[0];
  if (!run) fail('Pipeline run not found');

  const [stageRows, diagnosisRow, envRows, deployRows, pipelineRow] = await Promise.all([
    db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.runId, run.id))
      .orderBy(asc(pipelineStages.sequence)),
    db
      .select()
      .from(pipelineDiagnoses)
      .where(eq(pipelineDiagnoses.runId, run.id))
      .limit(1)
      .then((r) => r[0]),
    db.select().from(environments).where(eq(environments.repositoryId, repository.id)),
    db.select().from(environmentDeployments).where(eq(environmentDeployments.runId, run.id)),
    db
      .select()
      .from(pipelines)
      .where(eq(pipelines.id, run.pipelineId))
      .limit(1)
      .then((r) => r[0]),
  ]);

  const envById = new Map(envRows.map((e) => [e.id, e]));

  const stages = stageRows.map((s) => {
    const env = s.environmentId ? envById.get(s.environmentId) : undefined;
    return {
      id: s.id,
      key: s.stageKey,
      name: s.name,
      kind: s.kind,
      lane: s.lane,
      sequence: s.sequence,
      dependsOn: json<string[]>(s.dependsOn, []),
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationMs: s.durationMs,
      attempts: s.attempts,
      exitCode: s.exitCode,
      runnerLabel: s.runnerLabel,
      summary: json<Record<string, unknown>>(s.summary, {}),
      log: s.log,
      environment: env
        ? {
            id: env.id,
            name: env.name,
            tier: env.tier,
            region: env.region,
            regionLabel: env.regionLabel,
            cluster: env.cluster,
            url: env.url,
          }
        : null,
    };
  });

  return c.json({
    data: {
      run: {
        ...runSummary(run, pipelineRow?.name ?? 'Pipeline', diagnosisRow),
        pipelineFile: pipelineRow?.filePath ?? null,
      },
      stages,
      diagnosis: diagnosisRow
        ? {
            stageKey: diagnosisRow.stageKey,
            category: diagnosisRow.category,
            categoryLabel: CATEGORY_LABELS[diagnosisRow.category] ?? diagnosisRow.category,
            title: diagnosisRow.title,
            summary: diagnosisRow.summary,
            confidence: diagnosisRow.confidence,
            recommendation: diagnosisRow.recommendation,
            recommendedAction: diagnosisRow.recommendedAction,
            actionLabel: ACTION_LABELS[diagnosisRow.recommendedAction] ?? diagnosisRow.recommendedAction,
            exonerated: isChangeExonerated(diagnosisRow.category),
            blame: {
              commitSha: diagnosisRow.blameCommitSha,
              commitShort: diagnosisRow.blameCommitSha?.slice(0, 7) ?? null,
              file: diagnosisRow.blameFile,
              line: diagnosisRow.blameLine,
              author: diagnosisRow.blameAuthor,
            },
            signals: json<unknown[]>(diagnosisRow.signals, []),
            computeMs: diagnosisRow.computeMs,
            createdAt: diagnosisRow.createdAt,
          }
        : null,
      deployments: deployRows.map((d) => ({
        id: d.id,
        environment: envById.get(d.environmentId)
          ? {
              name: envById.get(d.environmentId)!.name,
              region: envById.get(d.environmentId)!.region,
              regionLabel: envById.get(d.environmentId)!.regionLabel,
              tier: envById.get(d.environmentId)!.tier,
            }
          : null,
        version: d.version,
        previousVersion: d.previousVersion,
        commitShort: d.commitSha.slice(0, 7),
        strategy: d.strategy,
        status: d.status,
        trafficPct: d.trafficPct,
        healthCheck: d.healthCheck,
        startedAt: d.startedAt,
        completedAt: d.completedAt,
        rolledBackAt: d.rolledBackAt,
        rollbackReason: d.rollbackReason,
      })),
    },
  });
});

// ============================================================
// GET /repositories/:id/pipeline-runs/:runNumber/rediagnose
// ============================================================
// Re-runs the classifier live against the stored evidence and
// returns the verdict plus the timing. This exists so the product
// can prove the diagnosis is computed rather than written down --
// the UI shows the measured latency next to the result.

pipelineRoutes.get('/repositories/:id/pipeline-runs/:runNumber/rediagnose', async (c) => {
  const repository = await requireRepository(c.req.param('id'));
  const runNumber = Number(c.req.param('runNumber'));

  const run = (
    await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repositoryId, repository.id), eq(pipelineRuns.runNumber, runNumber)))
      .limit(1)
  )[0];
  if (!run) fail('Pipeline run not found');
  if (run.status !== 'failed' || !run.failedStage)
    return c.json({ data: null, reason: 'This run did not fail, so there is nothing to diagnose.' });

  const stageRows = await db.select().from(pipelineStages).where(eq(pipelineStages.runId, run.id));
  const broken = stageRows.find((s) => s.stageKey === run.failedStage);
  if (!broken) fail('Failed stage is missing from the run');

  const envRows = await db.select().from(environments).where(eq(environments.repositoryId, repository.id));
  const brokenEnv = broken.environmentId ? envRows.find((e) => e.id === broken.environmentId) : undefined;

  // ---- Rebuild the evidence from stored rows ----

  // Sibling deploys at the same DAG level: this is the region
  // asymmetry the classifier keys on.
  const siblingRegionResults = stageRows
    .filter((s) => s.kind === 'deploy' && s.sequence === broken.sequence && s.environmentId)
    .map((s) => ({
      region: envRows.find((e) => e.id === s.environmentId)?.region ?? 'unknown',
      status: s.status,
    }));

  // Flake history for tests named in the failing stage's log.
  const flakeRows = await db.select().from(flakyTests).where(eq(flakyTests.repositoryId, repository.id));
  const failingTests: FailingTest[] = flakeRows
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

  // Was the previous run on this branch green?
  const previous = (
    await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repositoryId, repository.id), eq(pipelineRuns.branch, run.branch)))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(10)
  ).find((r) => r.startedAt < run.startedAt);

  // Median duration of this stage across green runs, for the
  // duration-outlier signal.
  const baselineRows = await db
    .select({ durationMs: pipelineStages.durationMs })
    .from(pipelineStages)
    .innerJoin(pipelineRuns, eq(pipelineStages.runId, pipelineRuns.id))
    .where(
      and(
        eq(pipelineRuns.repositoryId, repository.id),
        eq(pipelineStages.stageKey, broken.stageKey),
        eq(pipelineStages.status, 'success'),
      ),
    );

  const context: FailureContext = {
    stage: {
      key: broken.stageKey,
      name: broken.name,
      kind: broken.kind,
      exitCode: broken.exitCode,
      durationMs: broken.durationMs,
      attempts: broken.attempts,
      log: broken.log,
      baselineDurationMs: median(baselineRows.map((r) => r.durationMs ?? 0).filter((n) => n > 0)),
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
      filesChanged: [],
    },
    history: {
      failingTests,
      previousRunOnBranchPassed: previous ? previous.status === 'success' : undefined,
      siblingRegionResults: siblingRegionResults.length > 1 ? siblingRegionResults : undefined,
    },
  };

  const t0 = performance.now();
  const verdict = diagnose(context);
  const elapsedMs = performance.now() - t0;

  return c.json({
    data: {
      ...verdict,
      categoryLabel: CATEGORY_LABELS[verdict.category] ?? verdict.category,
      actionLabel: ACTION_LABELS[verdict.recommendedAction] ?? verdict.recommendedAction,
      exonerated: isChangeExonerated(verdict.category),
      // Reported to three decimals: the honest figure is well under a
      // millisecond and rounding it to 0ms looks like a bug.
      elapsedMs: Math.round(elapsedMs * 1000) / 1000,
      evidenceUsed: {
        logBytes: broken.log.length,
        failingTests: failingTests.length,
        siblingRegions: siblingRegionResults.length,
        greenBaselineSamples: baselineRows.length,
      },
    },
  });
});

// ============================================================
// GET /repositories/:id/graph
// ============================================================
// The indexed dependency graph, shaped for both the graph view and
// the blast-radius endpoint below.

async function loadGraph(repositoryId: string) {
  const [fileRows, edgeRows] = await Promise.all([
    db.select().from(schema.repositoryFiles).where(eq(schema.repositoryFiles.repositoryId, repositoryId)),
    db.select().from(schema.repositoryEdges).where(eq(schema.repositoryEdges.repositoryId, repositoryId)),
  ]);

  const files: GraphFile[] = fileRows.map((f) => {
    // The indexer stashes role/service/endpoints in `summary`; fall
    // back to inferring from the path when it did not.
    const meta = json<{ role?: FileRole; service?: string; endpoints?: string[] }>(f.summary, {});
    return {
      path: f.path,
      role: meta.role ?? inferRole(f.path),
      service: meta.service,
      endpoints: meta.endpoints ?? [],
      complexity: f.complexity,
    };
  });

  const edges = edgeRows.map((e) => ({ source: e.sourcePath, target: e.targetPath, kind: e.kind }));
  return { files, edges };
}

pipelineRoutes.get('/repositories/:id/graph', async (c) => {
  const repository = await requireRepository(c.req.param('id'));
  const { files, edges } = await loadGraph(repository.id);

  // Fan-in is what makes a node a hub, and the graph view sizes
  // nodes by it, so compute it once here instead of in the browser.
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const e of edges) {
    fanIn.set(e.target, (fanIn.get(e.target) ?? 0) + 1);
    fanOut.set(e.source, (fanOut.get(e.source) ?? 0) + 1);
  }

  const services = [...new Set(files.map((f) => f.service).filter(Boolean))] as string[];

  return c.json({
    data: {
      nodes: files.map((f) => ({
        path: f.path,
        role: f.role,
        service: f.service ?? null,
        endpoints: f.endpoints ?? [],
        complexity: f.complexity ?? 1,
        importedBy: fanIn.get(f.path) ?? 0,
        imports: fanOut.get(f.path) ?? 0,
      })),
      edges,
      services,
      stats: {
        nodes: files.length,
        edges: edges.length,
        services: services.length,
        endpoints: [...new Set(files.flatMap((f) => f.endpoints ?? []))].length,
        maxFanIn: Math.max(0, ...fanIn.values()),
      },
    },
  });
});

// ============================================================
// GET /repositories/:id/blast-radius?files=a,b&depth=4
// ============================================================

pipelineRoutes.get('/repositories/:id/blast-radius', async (c) => {
  const repository = await requireRepository(c.req.param('id'));
  const raw = c.req.query('files') ?? '';
  const changed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (changed.length === 0)
    return c.json({ error: { message: 'Provide at least one changed file via ?files=' } }, 400);
  if (changed.length > 200)
    return c.json({ error: { message: 'At most 200 changed files per request.' } }, 400);

  const depth = Math.min(8, Math.max(1, Number(c.req.query('depth')) || 4));
  const { files, edges } = await loadGraph(repository.id);
  const radius = computeBlastRadius({ changed, edges, files, maxDepth: depth });

  // Report anything the caller asked about that the index has never
  // seen, rather than silently dropping it: a reviewer needs to know
  // the answer is incomplete.
  const known = new Set(files.map((f) => f.path));
  const unknown = changed.filter((p) => !known.has(p));

  return c.json({ data: { ...radius, unknown } });
});

// ============================================================
// GET /repositories/:id/flaky-tests
// ============================================================

pipelineRoutes.get('/repositories/:id/flaky-tests', async (c) => {
  const repository = await requireRepository(c.req.param('id'));
  const rows = await db
    .select()
    .from(flakyTests)
    .where(eq(flakyTests.repositoryId, repository.id))
    .orderBy(desc(flakyTests.flakeRate));

  // Rough cost of the noise: every flaky failure is a re-run someone
  // waited for. Priced at the median CI duration so the number means
  // something to whoever has to justify fixing them.
  const pipelineRows = await db.select().from(pipelines).where(eq(pipelines.repositoryId, repository.id));
  const p50 = median(pipelineRows.map((p) => p.p50DurationMs ?? 0).filter((n) => n > 0)) ?? 0;
  const wastedMs = rows.reduce((acc, r) => acc + r.failCount * p50, 0);

  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      testName: r.testName,
      filePath: r.filePath,
      suite: r.suite,
      runCount: r.runCount,
      failCount: r.failCount,
      flakeRate: r.flakeRate,
      distinctBranches: r.distinctBranches,
      quarantined: r.quarantined,
      firstSeenAt: r.firstSeenAt,
      lastFailedAt: r.lastFailedAt,
    })),
    stats: {
      total: rows.length,
      quarantined: rows.filter((r) => r.quarantined).length,
      worstFlakeRate: rows[0]?.flakeRate ?? null,
      estimatedWastedMs: wastedMs,
      medianPipelineMs: p50,
    },
  });
});

// ============================================================
// GET /diagnosis/benchmark
// ============================================================

pipelineRoutes.get('/diagnosis/benchmark', async (c) => {
  const row = (
    await db.select().from(diagnosisBenchmarkRuns).orderBy(desc(diagnosisBenchmarkRuns.ranAt)).limit(1)
  )[0];
  if (!row)
    return c.json({
      data: null,
      reason: 'No benchmark has been scored yet. Run pnpm --filter @codelens/api bench:diagnosis.',
    });

  return c.json({
    data: {
      engineVersion: row.engineVersion,
      totalCases: row.totalCases,
      correctCategory: row.correctCategory,
      correctAction: row.correctAction,
      categoryAccuracy: row.categoryAccuracy,
      actionAccuracy: row.actionAccuracy,
      meanConfidence: row.meanConfidence,
      p50ComputeMs: row.p50ComputeMs,
      p95ComputeMs: row.p95ComputeMs,
      easyAccuracy: row.easyAccuracy,
      hardAccuracy: row.hardAccuracy,
      hardCases: row.hardCases,
      perCategory: json<Record<string, unknown>>(row.perCategory, {}),
      confusion: json<unknown[]>(row.confusion, []),
      ablation: json<unknown[]>(row.ablation, []),
      ranAt: row.ranAt,
      categoryLabels: CATEGORY_LABELS,
    },
  });
});
