// ============================================================
// Pipeline actions
// ------------------------------------------------------------
// The things a maintainer does after a diagnosis: re-run what
// failed, redeploy one environment at a known-good commit, approve
// or reject a production deploy that is waiting at its gate.
//
// CodeLens never acts with its own credentials. Every call below is
// made with the signed-in person's GitHub token, after GitHub has
// confirmed that person can write to the repository, so GitHub's own
// permissions, branch protection, environment reviewers and audit log
// all still apply. Cloud credentials stay in the repository's
// workflows (OpenID Connect); CodeLens only asks those workflows to run.
// ============================================================

import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import {
  getDb,
  schema,
  deliveryActions,
  environmentDeployments,
  environments,
  pipelineRuns,
  pipelines,
  pipelineStages,
  and,
  desc,
  eq,
  inArray,
} from '@codelens/db';
import { connection, fail } from './identity';
import { github, repoPath } from './github-client';

type Repository = typeof schema.repositories.$inferSelect;
type RunRow = typeof pipelineRuns.$inferSelect;
type StageRow = typeof pipelineStages.$inferSelect;
export type ActionKind = (typeof deliveryActions.$inferInsert)['kind'];

// ---- Access ---------------------------------------------------------

export type Permission = 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';

export interface ActionAccess {
  signedIn: boolean;
  github: { login: string } | null;
  permission: Permission;
  /** Write access or more, with a token that carries the `repo` scope. */
  canAct: boolean;
  /** Why the buttons are disabled, in words a visitor can act on. */
  reason: string | null;
}

const ACCESS_TTL_MS = 60_000;
const accessCache = new Map<string, { at: number; value: ActionAccess }>();

/** Exported for tests, which change identities between cases. */
export function clearAccessCache() {
  accessCache.clear();
  actionWindows.clear();
}

function permissionFrom(p: Record<string, boolean> | undefined): Permission {
  if (!p) return 'none';
  if (p.admin) return 'admin';
  if (p.maintain) return 'maintain';
  if (p.push) return 'write';
  if (p.triage) return 'triage';
  if (p.pull) return 'read';
  return 'none';
}

/** What the signed-in person may do to this repository's pipelines, as GitHub sees it. */
export async function accessFor(
  userId: string | null | undefined,
  repository: Repository,
): Promise<ActionAccess> {
  if (!userId)
    return {
      signedIn: false,
      github: null,
      permission: 'none',
      canAct: false,
      reason: 'Sign in with GitHub as a maintainer of this repository to run pipeline actions.',
    };
  const linked = await connection(userId);
  if (!linked)
    return {
      signedIn: true,
      github: null,
      permission: 'none',
      canAct: false,
      reason: 'Connect your GitHub account to run pipeline actions.',
    };
  const key = `${userId}:${repository.fullName}`;
  const cached = accessCache.get(key);
  if (cached && Date.now() - cached.at < ACCESS_TTL_MS) return cached.value;

  const scopes = (linked.scopes ?? '').split(/[\s,]+/).filter(Boolean);
  let permission: Permission = 'none';
  try {
    const repo = await github(repoPath(repository), userId);
    permission = permissionFrom(repo.permissions);
  } catch {
    permission = 'none';
  }
  const writes = permission === 'admin' || permission === 'maintain' || permission === 'write';
  const scoped = scopes.includes('repo');
  const value: ActionAccess = {
    signedIn: true,
    github: { login: linked.login },
    permission,
    canAct: writes && scoped,
    reason: !writes
      ? `@${linked.login} can't write to ${repository.fullName}. Only its maintainers can run actions.`
      : !scoped
        ? 'Reconnect GitHub and grant repository access to run actions.'
        : null,
  };
  accessCache.set(key, { at: Date.now(), value });
  return value;
}

async function requireActor(userId: string, repository: Repository) {
  const access = await accessFor(userId, repository);
  if (!access.canAct) throw fail(access.reason ?? 'You cannot run actions on this repository.', 403);
  return access.github!.login;
}

// ---- Rate limit -----------------------------------------------------

const ACTIONS_PER_MINUTE = 12;
const actionWindows = new Map<string, { count: number; until: number }>();

function throttle(userId: string) {
  const now = Date.now();
  const entry = actionWindows.get(userId);
  const window = entry && entry.until > now ? entry : { count: 0, until: now + 60_000 };
  if (++window.count > ACTIONS_PER_MINUTE) throw fail('Too many actions in a minute. Wait a moment.', 429);
  actionWindows.set(userId, window);
}

// ---- Audit ----------------------------------------------------------

interface Recorded {
  kind: ActionKind;
  target: string;
  runId?: string | null;
  environment?: string | null;
  detail?: Record<string, unknown>;
  url?: string | null;
}

async function record(
  repository: Repository,
  userId: string,
  login: string,
  entry: Recorded,
  outcome: 'requested' | 'failed',
  message: string | null,
) {
  const row = {
    id: randomUUID(),
    repositoryId: repository.id,
    userId,
    githubLogin: login,
    kind: entry.kind,
    target: entry.target,
    runId: entry.runId ?? null,
    environment: entry.environment ?? null,
    detail: JSON.stringify(entry.detail ?? {}),
    outcome,
    message,
    url: entry.url ?? null,
    createdAt: new Date().toISOString(),
  };
  await getDb().insert(deliveryActions).values(row);
  return row;
}

/**
 * Runs one action: checks access and the rate limit, calls GitHub,
 * and records the outcome either way, so a refused request is as
 * visible in the log as a successful one.
 */
async function act<T extends { url?: string | null; message: string }>(
  repository: Repository,
  userId: string,
  entry: Recorded,
  call: () => Promise<T>,
): Promise<T & { action: Awaited<ReturnType<typeof record>> }> {
  const login = await requireActor(userId, repository);
  throttle(userId);
  try {
    const result = await call();
    const action = await record(
      repository,
      userId,
      login,
      { ...entry, url: result.url ?? entry.url },
      'requested',
      result.message,
    );
    return { ...result, action };
  } catch (error) {
    await record(repository, userId, login, entry, 'failed', messageOf(error)).catch(() => undefined);
    throw error;
  }
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const raw = String((error as { message: unknown }).message);
    try {
      return JSON.parse(raw)?.error?.message ?? raw;
    } catch {
      return raw;
    }
  }
  return 'Request failed';
}

export async function recentActions(repositoryId: string, limit = 20) {
  const rows = await getDb()
    .select()
    .from(deliveryActions)
    .where(eq(deliveryActions.repositoryId, repositoryId))
    .orderBy(desc(deliveryActions.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    target: row.target,
    runId: row.runId,
    environment: row.environment,
    detail: JSON.parse(row.detail || '{}') as Record<string, unknown>,
    outcome: row.outcome,
    message: row.message,
    url: row.url,
    githubLogin: row.githubLogin,
    createdAt: row.createdAt,
  }));
}

// ---- Lookups --------------------------------------------------------

export async function runOf(repository: Repository, runNumber: number): Promise<RunRow> {
  if (!Number.isSafeInteger(runNumber) || runNumber <= 0) throw fail('Choose a pipeline run.');
  const run = (
    await getDb()
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repositoryId, repository.id), eq(pipelineRuns.runNumber, runNumber)))
      .limit(1)
  )[0];
  if (!run) throw fail('Pipeline run not found.', 404);
  return run;
}

function jobIdOf(stage: StageRow): number | null {
  try {
    const id = JSON.parse(stage.summary || '{}').githubJobId;
    return Number.isSafeInteger(id) ? id : null;
  } catch {
    return null;
  }
}

// ---- Re-runs --------------------------------------------------------

export type RerunMode = 'failed' | 'all' | 'job';

export async function rerun(
  repository: Repository,
  userId: string,
  input: { runNumber: number; mode: RerunMode; stageKey?: string },
) {
  const run = await runOf(repository, input.runNumber);
  if (['queued', 'running', 'blocked'].includes(run.status))
    throw fail('This run is still in progress. Re-run it once it finishes.', 409);
  const base = `${repoPath(repository)}/actions`;
  const label = `#${run.displayNumber ?? run.runNumber}`;

  if (input.mode === 'job') {
    const stage = (
      await getDb()
        .select()
        .from(pipelineStages)
        .where(and(eq(pipelineStages.runId, run.id), eq(pipelineStages.stageKey, input.stageKey ?? '')))
        .limit(1)
    )[0];
    if (!stage) throw fail('That stage is not part of this run.', 404);
    const jobId = jobIdOf(stage);
    if (!jobId) throw fail('GitHub has no job for this stage to re-run.', 409);
    return act(
      repository,
      userId,
      { kind: 'rerun-job', target: String(run.runNumber), runId: run.id, detail: { stage: stage.name } },
      async () => {
        await github(`${base}/jobs/${jobId}/rerun`, userId, { method: 'POST', body: '{}' });
        return {
          url: run.externalUrl,
          message: `Re-running "${stage.name}" in run ${label}. Jobs that depend on it run again too.`,
        };
      },
    );
  }

  if (input.mode === 'failed' && run.status !== 'failed' && run.status !== 'cancelled')
    throw fail('Nothing failed in this run. Use "Re-run all jobs" instead.', 409);
  return act(
    repository,
    userId,
    {
      kind: input.mode === 'failed' ? 'rerun-failed' : 'rerun-all',
      target: String(run.runNumber),
      runId: run.id,
    },
    async () => {
      await github(
        `${base}/runs/${run.runNumber}/${input.mode === 'failed' ? 'rerun-failed-jobs' : 'rerun'}`,
        userId,
        {
          method: 'POST',
          body: '{}',
        },
      );
      return {
        url: run.externalUrl,
        message:
          input.mode === 'failed'
            ? `Re-running the failed jobs of run ${label}.`
            : `Re-running every job of run ${label}.`,
      };
    },
  );
}

// ---- Redeploy (rollback) ----------------------------------------------

/** What a workflow's manual trigger accepts: the inputs a redeploy needs. */
export function dispatchInputsOf(text: string): { target: string[] | null; ref: boolean } | null {
  let document: unknown;
  try {
    document = parseYaml(text);
  } catch {
    return null;
  }
  const on =
    (document as Record<string, unknown> | null)?.on ?? (document as Record<string, unknown> | null)?.true;
  const dispatch =
    on && typeof on === 'object' && !Array.isArray(on)
      ? (on as Record<string, unknown>).workflow_dispatch
      : undefined;
  if (dispatch === undefined) return null;
  const inputs = (dispatch as { inputs?: Record<string, { options?: unknown }> } | null)?.inputs ?? {};
  if (!inputs.target) return { target: null, ref: Boolean(inputs.ref) };
  const options = Array.isArray(inputs.target.options) ? inputs.target.options.map(String) : null;
  return { target: options, ref: Boolean(inputs.ref) };
}

/** Successful deploys to one environment, newest first, one per commit. */
export async function releasesOf(repository: Repository, environmentName: string) {
  const db = getDb();
  const env = (
    await db
      .select()
      .from(environments)
      .where(and(eq(environments.repositoryId, repository.id), eq(environments.name, environmentName)))
      .limit(1)
  )[0];
  if (!env) throw fail('Environment not found.', 404);
  const deploys = (
    await db.select().from(environmentDeployments).where(eq(environmentDeployments.environmentId, env.id))
  )
    .filter((d) => d.status === 'live' || d.status === 'superseded')
    .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt));
  const runIds = [...new Set(deploys.map((d) => d.runId).filter((id): id is string => Boolean(id)))];
  const runs = runIds.length
    ? await db.select().from(pipelineRuns).where(inArray(pipelineRuns.id, runIds))
    : [];
  const pipelineRows = runs.length
    ? await db.select().from(pipelines).where(eq(pipelines.repositoryId, repository.id))
    : [];
  const runById = new Map(runs.map((r) => [r.id, r]));
  const pipelineById = new Map(pipelineRows.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const releases = [];
  for (const deploy of deploys) {
    if (seen.has(deploy.commitSha)) continue;
    seen.add(deploy.commitSha);
    const run = deploy.runId ? runById.get(deploy.runId) : undefined;
    releases.push({
      commitSha: deploy.commitSha,
      commitShort: deploy.commitSha.slice(0, 7),
      commitMessage: run?.commitMessage ?? null,
      deployedAt: deploy.completedAt ?? deploy.startedAt,
      actor: deploy.actor,
      current: deploy.commitSha === env.currentCommitSha,
      run: run
        ? {
            runNumber: run.runNumber,
            displayNumber: run.displayNumber ?? run.runNumber,
            pipeline: pipelineById.get(run.pipelineId)?.name ?? 'Pipeline',
            pipelineFile: pipelineById.get(run.pipelineId)?.filePath ?? null,
          }
        : null,
    });
    if (releases.length >= 10) break;
  }
  return { environment: env, releases };
}

/**
 * Starts the repository's deploy workflow for one environment at a
 * chosen commit. The workflow decides what that means; CodeLens only
 * checks first that it accepts a target and a commit, so a repository
 * without that trigger gets a clear answer instead of a GitHub 422.
 */
export async function redeploy(
  repository: Repository,
  userId: string,
  input: { environment: string; commitSha: string },
) {
  if (!/^[a-f0-9]{40}$/.test(input.commitSha)) throw fail('Choose a full commit to deploy.');
  const { environment, releases } = await releasesOf(repository, input.environment);
  const release = releases.find((r) => r.commitSha === input.commitSha);
  if (!release?.run?.pipelineFile)
    throw fail('Only a commit that deployed successfully to this environment can be redeployed.', 409);
  const workflowPath = release.run.pipelineFile;

  return act(
    repository,
    userId,
    {
      kind: 'redeploy',
      target: environment.name,
      environment: environment.name,
      detail: { commitSha: input.commitSha, workflow: workflowPath, from: environment.currentCommitSha },
    },
    async () => {
      const file = await github(
        `${repoPath(repository)}/contents/${workflowPath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(repository.defaultBranch)}`,
        userId,
      );
      const inputs = dispatchInputsOf(Buffer.from(String(file.content ?? ''), 'base64').toString('utf8'));
      if (!inputs?.ref || !inputs.target)
        throw fail(
          `${workflowPath} can't deploy one environment at a chosen commit yet. Give its workflow_dispatch trigger "target" and "ref" inputs.`,
          422,
        );
      if (!inputs.target.includes(environment.name))
        throw fail(`${workflowPath} doesn't list ${environment.name} as a target.`, 422);
      const workflowFile = workflowPath.split('/').pop()!;
      await github(
        `${repoPath(repository)}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
        userId,
        {
          method: 'POST',
          body: JSON.stringify({
            ref: repository.defaultBranch,
            inputs: { target: environment.name, ref: input.commitSha },
          }),
        },
      );
      return {
        url: `https://github.com/${repository.fullName}/actions/workflows/${encodeURIComponent(workflowFile)}`,
        message: `Deploying ${input.commitSha.slice(0, 7)} to ${environment.name}. The run appears here within a minute${environment.tier === 'production' ? ', and waits for approval if the environment requires it' : ''}.`,
      };
    },
  );
}

// ---- Approvals ------------------------------------------------------

export interface PendingGate {
  environment: string;
  environmentId: number;
  waitTimerMinutes: number;
  waitTimerStartedAt: string | null;
  canApprove: boolean;
  reviewers: string[];
}

interface GhPending {
  environment: { id: number; name: string };
  wait_timer: number;
  wait_timer_started_at: string | null;
  current_user_can_approve: boolean;
  reviewers: { type: string; reviewer: { login?: string; name?: string; slug?: string } }[];
}

/**
 * The environments a waiting run is held at. Read with the visitor's
 * token when they have one, so `canApprove` is about them; otherwise
 * with the sync token, which can see the gate but never approve it.
 */
export async function pendingGates(
  repository: Repository,
  run: RunRow,
  userId?: string | null,
): Promise<PendingGate[]> {
  if (run.status !== 'blocked') return [];
  const linked = userId ? await connection(userId) : undefined;
  const fallback = repository.userId ? undefined : process.env.GITHUB_SYNC_TOKEN?.trim() || undefined;
  let pending: GhPending[];
  try {
    pending = await github(
      `${repoPath(repository)}/actions/runs/${run.runNumber}/pending_deployments`,
      linked ? userId : null,
      undefined,
      linked ? undefined : fallback,
    );
  } catch {
    return [];
  }
  return (pending ?? []).map((p) => ({
    environment: p.environment.name,
    environmentId: p.environment.id,
    waitTimerMinutes: p.wait_timer ?? 0,
    waitTimerStartedAt: p.wait_timer_started_at ?? null,
    canApprove: Boolean(linked && p.current_user_can_approve),
    reviewers: (p.reviewers ?? []).map(
      (r) => r.reviewer.login ?? r.reviewer.slug ?? r.reviewer.name ?? r.type,
    ),
  }));
}

export async function review(
  repository: Repository,
  userId: string,
  input: { runNumber: number; environments: string[]; decision: 'approved' | 'rejected'; comment?: string },
) {
  const run = await runOf(repository, input.runNumber);
  if (run.status !== 'blocked') throw fail('This run is not waiting for approval any more.', 409);
  if (!input.environments.length) throw fail('Choose at least one environment.');
  const comment = (input.comment ?? '').slice(0, 500);
  return act(
    repository,
    userId,
    {
      kind: input.decision === 'approved' ? 'approve' : 'reject',
      target: String(run.runNumber),
      runId: run.id,
      environment: input.environments.join(', '),
      detail: { environments: input.environments, comment },
    },
    async () => {
      const gates = await pendingGates(repository, run, userId);
      const chosen = gates.filter((g) => input.environments.includes(g.environment));
      if (!chosen.length) throw fail('Those environments are no longer waiting.', 409);
      if (chosen.some((g) => !g.canApprove))
        throw fail("GitHub doesn't list you as a reviewer for every chosen environment.", 403);
      await github(`${repoPath(repository)}/actions/runs/${run.runNumber}/pending_deployments`, userId, {
        method: 'POST',
        body: JSON.stringify({
          environment_ids: chosen.map((g) => g.environmentId),
          state: input.decision,
          comment:
            comment || (input.decision === 'approved' ? 'Approved in CodeLens' : 'Rejected in CodeLens'),
        }),
      });
      const names = chosen.map((g) => g.environment).join(', ');
      return {
        url: run.externalUrl,
        message:
          input.decision === 'approved' ? `Approved ${names}. The deploy continues.` : `Rejected ${names}.`,
      };
    },
  );
}

// ---- Fix pull requests (recorded here, built in fix-pull-requests.ts) --

export async function recordFix<T extends { url: string; message: string }>(
  repository: Repository,
  userId: string,
  entry: {
    target: string;
    runId?: string | null;
    environment?: string | null;
    detail?: Record<string, unknown>;
  },
  call: () => Promise<T>,
) {
  return act(repository, userId, { kind: 'fix-pr', ...entry }, call);
}
