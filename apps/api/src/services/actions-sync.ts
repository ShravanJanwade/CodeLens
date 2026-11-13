// ============================================================
// GitHub Actions ingestion
// ------------------------------------------------------------
// Turns a repository's real workflow runs into the pipeline model:
// workflows become pipelines, runs become pipeline runs, jobs become
// stages laid out by the workflow's `needs` graph, jobs with an
// `environment:` become deploy targets and deployments, and failing
// tests named in the logs become flake history. Every failed run is
// diagnosed by the same classifier the benchmark scores, using only
// history from before that run.
//
// Catch-up, not polling: a sync starts when someone opens the
// repository's delivery view and its data is more than a minute old.
// Nothing here wakes a scale-to-zero host on a timer or a webhook.
// ============================================================

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
  and,
  eq,
  inArray,
} from '@codelens/db';
import { diagnose, type FailingTest, type StageKind } from '@codelens/shared';
import { parse as parseYaml } from 'yaml';
import { buildFailureContext } from '../pipeline/context';
import { githubToken } from './identity';
import { startIndex } from './repository-sync';

type Repository = typeof schema.repositories.$inferSelect;
type RunRow = typeof pipelineRuns.$inferInsert;
type StageRow = typeof pipelineStages.$inferInsert;
type RunStatus = NonNullable<RunRow['status']>;
type StageStatus = NonNullable<StageRow['status']>;

/** The public live example: a real repository whose runs anyone can browse. */
export const LIVE_EXAMPLE_ID = 'live-northwind-commerce';
const DEFAULT_LIVE_EXAMPLE = 'ShravanJanwade/northwind-commerce';

const MIN_SYNC_INTERVAL_MS = 60_000;
const MAX_RUNS_PER_SYNC = 60;
/** While a run is in progress, a visit catches up this often instead. */
const ACTIVE_SYNC_INTERVAL_MS = 8_000;
const LOG_TAIL_CHARS = 48_000;
const MAX_FILES_CHANGED = 300;

// ---- GitHub access ------------------------------------------------

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(
      status === 403 || status === 429
        ? 'GitHub rate limit or permission refused the request. Set GITHUB_SYNC_TOKEN for the live example.'
        : status === 404
          ? `GitHub could not find ${path}.`
          : `GitHub answered ${status} for ${path}.`,
    );
    this.name = 'GitHubError';
  }
}

export interface GitHubAccess {
  /** True when requests carry a token; job logs need one even for public repositories. */
  authenticated: boolean;
  json<T>(path: string): Promise<T>;
  /** Text at an API path, following a redirect; null when GitHub refuses or it is gone. */
  text(path: string, accept?: string): Promise<string | null>;
  /** A file of the repository at a commit; null when it does not exist. */
  file(fullName: string, path: string, ref: string): Promise<string | null>;
}

export function createGitHubAccess(token: string | undefined, fetchImpl: typeof fetch = fetch): GitHubAccess {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CodeLens',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return {
    authenticated: Boolean(token),
    async json<T>(path: string): Promise<T> {
      const response = await fetchImpl(`https://api.github.com${path}`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new GitHubError(response.status, path);
      return (await response.json()) as T;
    },
    async text(path: string, accept?: string): Promise<string | null> {
      // Logs answer with a redirect to short-lived storage, which must not
      // receive the GitHub token, so the redirect is followed by hand.
      let response = await fetchImpl(`https://api.github.com${path}`, {
        headers: accept ? { ...headers, Accept: accept } : headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return null;
        response = await fetchImpl(location, { signal: AbortSignal.timeout(30_000) });
      }
      if (response.status === 403 || response.status === 429) {
        if (response.headers.get('x-ratelimit-remaining') === '0')
          throw new GitHubError(response.status, path);
        return null;
      }
      return response.ok ? response.text() : null;
    },
    async file(fullName: string, path: string, ref: string): Promise<string | null> {
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      if (token) {
        return this.text(
          `/repos/${fullName}/contents/${encoded}?ref=${encodeURIComponent(ref)}`,
          'application/vnd.github.raw+json',
        );
      }
      // Public files without a token come from raw.githubusercontent.com, which
      // does not count against the 60-requests-an-hour anonymous API limit.
      const response = await fetchImpl(
        `https://raw.githubusercontent.com/${fullName}/${encodeURIComponent(ref)}/${encoded}`,
        {
          signal: AbortSignal.timeout(20_000),
        },
      );
      return response.ok ? response.text() : null;
    },
  };
}

// ---- GitHub shapes (only the fields read) ----------------------------

interface GhWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export interface GhRun {
  id: number;
  name: string | null;
  run_number: number;
  run_attempt?: number;
  event: string;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string;
  path: string;
  workflow_id: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string | null;
  actor?: { login: string } | null;
  triggering_actor?: { login: string } | null;
  head_commit?: { message: string; author?: { name: string } | null } | null;
  pull_requests?: { number: number }[];
  display_title?: string;
}

export interface GhJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  labels?: string[];
  steps?: {
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
    started_at?: string | null;
    completed_at?: string | null;
  }[];
}

// ---- Workflow structure -------------------------------------------

export interface WorkflowJob {
  id: string;
  name: string;
  needs: string[];
  environment: string | null;
  order: number;
}

/** The jobs of a workflow file with their `needs` and `environment`; [] when it cannot be read. */
export function parseWorkflow(text: string): WorkflowJob[] {
  let document: unknown;
  try {
    document = parseYaml(text);
  } catch {
    return [];
  }
  const jobs = (document as { jobs?: unknown } | null)?.jobs;
  if (!jobs || typeof jobs !== 'object') return [];
  return Object.entries(jobs as Record<string, unknown>).map(([id, raw], order) => {
    const job = (raw ?? {}) as Record<string, unknown>;
    const needs =
      typeof job.needs === 'string'
        ? [job.needs]
        : Array.isArray(job.needs)
          ? job.needs.filter((n): n is string => typeof n === 'string')
          : [];
    const environment =
      typeof job.environment === 'string'
        ? job.environment
        : typeof (job.environment as { name?: unknown } | undefined)?.name === 'string'
          ? (job.environment as { name: string }).name
          : null;
    return {
      id,
      name: typeof job.name === 'string' && !job.name.includes('${{') ? job.name : id,
      needs,
      // An expression is only known at run time; leave those unlabelled.
      environment: environment && !environment.includes('${{') ? environment : null,
      order,
    };
  });
}

export interface PlannedStage {
  key: string;
  baseId: string;
  name: string;
  kind: StageKind;
  sequence: number;
  lane: number;
  dependsOn: string[];
  environment: string | null;
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'job';

/** Infers what a job does from its display name: the label a human chose is the best evidence. */
export function stageKind(name: string, environment: string | null): StageKind {
  const text = name.toLowerCase();
  if (environment || /\bdeploy|\bpromote|\brelease to\b/.test(text)) return 'deploy';
  if (/rollback|roll back/.test(text)) return 'rollback';
  if (/approv/.test(text)) return 'approval';
  if (/smoke|verify|health|check production|e2e|synthetic|\bbake\b|\bsoak/.test(text)) return 'verify';
  if (/test|spec/.test(text)) return 'test';
  if (/codeql|scan|audit|security|sast|vulnerab/.test(text)) return 'scan';
  if (/package|bundle|artifact|docker|image|container/.test(text)) return 'package';
  return 'build';
}

/**
 * Lays a run's jobs out as a DAG. Each job is matched to the workflow job
 * it came from by display name (matrix jobs carry their values in
 * parentheses); sequence is the job's depth in the `needs` graph and lane
 * its position within that depth, so parallel regional deploys share a
 * level the way the flow view expects.
 */
export function planStages(
  jobs: readonly GhJob[],
  workflow: readonly WorkflowJob[],
): Map<number, PlannedStage> {
  const byName = new Map(workflow.map((job) => [job.name, job]));
  const byId = new Map(workflow.map((job) => [job.id, job]));

  const depthCache = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const job = byId.get(id);
    if (!job || seen.has(id)) return 0;
    seen.add(id);
    const value = job.needs.length ? 1 + Math.max(...job.needs.map((need) => depth(need, seen))) : 0;
    depthCache.set(id, value);
    return value;
  };

  const planned: { gh: GhJob; base: WorkflowJob | null; variant: string | null; key: string }[] = [];
  const usedKeys = new Set<string>();
  for (const gh of jobs) {
    let base: WorkflowJob | null = byName.get(gh.name) ?? byId.get(gh.name) ?? null;
    let variant: string | null = null;
    if (!base) {
      const matrix = /^(.*) \((.+)\)$/.exec(gh.name);
      if (matrix) {
        base = byName.get(matrix[1]) ?? byId.get(matrix[1]) ?? null;
        if (base) variant = matrix[2];
      }
    }
    let key = base ? (variant ? `${base.id}-${slug(variant)}` : base.id) : slug(gh.name);
    for (let n = 2; usedKeys.has(key); n += 1) key = `${key.replace(/-\d+$/, '')}-${n}`;
    usedKeys.add(key);
    planned.push({ gh, base, variant, key });
  }

  const lanes = new Map<number, number>();
  const ordered = [...planned].sort(
    (a, b) =>
      (a.base ? depth(a.base.id) : 0) - (b.base ? depth(b.base.id) : 0) ||
      (a.base?.order ?? 1e6) - (b.base?.order ?? 1e6) ||
      (a.variant ?? '').localeCompare(b.variant ?? '') ||
      a.gh.id - b.gh.id,
  );
  const result = new Map<number, PlannedStage>();
  for (const entry of ordered) {
    const sequence = entry.base ? depth(entry.base.id) : 0;
    const lane = lanes.get(sequence) ?? 0;
    lanes.set(sequence, lane + 1);
    const dependsOn = (entry.base?.needs ?? []).flatMap((need) =>
      planned.filter((other) => other.base?.id === need).map((other) => other.key),
    );
    const environment = entry.base?.environment ?? null;
    result.set(entry.gh.id, {
      key: entry.key,
      baseId: entry.base?.id ?? entry.key,
      name: entry.gh.name,
      kind: stageKind(entry.gh.name, environment),
      sequence,
      lane,
      dependsOn,
      environment,
    });
  }
  return result;
}

// ---- Statuses -----------------------------------------------------

export function runStatus(run: Pick<GhRun, 'status' | 'conclusion'>): RunStatus {
  if (run.status !== 'completed') {
    if (run.status === 'in_progress') return 'running';
    if (run.status === 'waiting' || run.status === 'action_required') return 'blocked';
    return 'queued';
  }
  switch (run.conclusion) {
    case 'success':
      return 'success';
    case 'cancelled':
    case 'skipped':
    case 'neutral':
      return 'cancelled';
    case 'action_required':
      return 'blocked';
    default:
      return 'failed';
  }
}

export function stageStatus(job: Pick<GhJob, 'status' | 'conclusion'>): StageStatus {
  if (job.status !== 'completed') {
    if (job.status === 'in_progress') return 'running';
    if (job.status === 'waiting') return 'blocked';
    return 'queued';
  }
  switch (job.conclusion) {
    case 'success':
      return 'success';
    case 'skipped':
    case 'neutral':
      return 'skipped';
    case 'cancelled':
      return 'cancelled';
    case 'action_required':
      return 'blocked';
    default:
      return 'failed';
  }
}

/**
 * A manual run that deploys one environment at a chosen commit, as the
 * run title CodeLens's redeploy convention sets: "Deploy <target> at <sha>".
 */
export function redeployOf(
  run: Pick<GhRun, 'event' | 'display_title'>,
): { target: string; sha: string } | null {
  if (run.event !== 'workflow_dispatch') return null;
  const match = /^Deploy ([\w.-]+) at ([0-9a-f]{40})$/.exec(run.display_title?.trim() ?? '');
  return match && match[1] !== 'all' ? { target: match[1], sha: match[2] } : null;
}

function trigger(event: string): RunRow['trigger'] {
  if (event === 'push') return 'push';
  if (event === 'pull_request' || event === 'pull_request_target') return 'pull_request';
  if (event === 'schedule') return 'schedule';
  return 'manual';
}

// ---- Logs ---------------------------------------------------------

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const TIMESTAMP = /^﻿?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;

/** Strips timestamps and colour codes and keeps the end, where failures are reported. */
export function cleanLog(raw: string): string {
  const text = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(TIMESTAMP, '').replace(ANSI, ''))
    .join('\n')
    .trimEnd();
  if (text.length <= LOG_TAIL_CHARS) return text;
  return `[${(text.length - LOG_TAIL_CHARS).toLocaleString('en-US')} earlier characters omitted]\n${text.slice(-LOG_TAIL_CHARS)}`;
}

export function exitCodeFrom(log: string): number | null {
  const matches = [...log.matchAll(/Process completed with exit code (\d+)/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

export interface FailedTest {
  name: string;
  file: string;
  suite: string;
}

/**
 * Tests a log reports as failed: Vitest's `FAIL file > suite > test` and
 * Jest's `● suite › test`. A Vitest workspace names the project before the
 * file: `|unit|` in a plain terminal, but a coloured badge in CI, which reads
 * ` unit ` once the colour codes are stripped.
 */
export function failingTestsFrom(log: string): FailedTest[] {
  const tests = new Map<string, FailedTest>();
  for (const match of log.matchAll(
    /^\s*FAIL\s+(?:(?:\|[^|\n]+\||[\w-]+)\s+)?(\S+?\.(?:test|spec)\.[cm]?[jt]sx?)\s+>\s+(.+?)\s*$/gm,
  )) {
    const parts = match[2].split(' > ');
    tests.set(match[2], {
      name: match[2],
      file: match[1],
      suite: parts.length > 1 ? parts.slice(0, -1).join(' > ') : match[1],
    });
  }
  for (const match of log.matchAll(/^\s*●\s+(.+?)\s+›\s+(.+?)\s*$/gm)) {
    const name = `${match[1]} › ${match[2]}`;
    if (!tests.has(name)) tests.set(name, { name, file: '', suite: match[1] });
  }
  return [...tests.values()];
}

export function testCountsFrom(log: string): { passed: number; failed: number } | null {
  const vitest = [...log.matchAll(/^\s*Tests\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed/gm)].pop();
  if (vitest) return { failed: Number(vitest[1] ?? 0), passed: Number(vitest[2]) };
  const jest = [...log.matchAll(/^Tests:\s+(?:(\d+) failed, )?(\d+) passed/gm)].pop();
  if (jest) return { failed: Number(jest[1] ?? 0), passed: Number(jest[2]) };
  return null;
}

interface GhAnnotation {
  path: string;
  start_line: number;
  annotation_level: string;
  title: string | null;
  message: string;
}

/**
 * Annotations are public even where logs are not, and carry the lines that
 * matter: each failing test with its assertion, a timeout, an ::error from a
 * script. Rendered in the shape failingTestsFrom reads.
 */
export function annotationLog(annotations: readonly GhAnnotation[]): string {
  return annotations
    .filter((a) => a.annotation_level === 'failure')
    .map((a) => {
      const test = /^(?:\[[^\]]+\]\s+)?(\S+?\.(?:test|spec)\.[cm]?[jt]sx?) > (.+)$/.exec(a.title ?? '');
      if (test) return ` FAIL  ${test[1]} > ${test[2]}\n${a.message.trimEnd()}`;
      return a.title ? `##[error]${a.title}\n${a.message.trimEnd()}` : `##[error]${a.message.trimEnd()}`;
    })
    .join('\n');
}

/** For jobs whose log was not fetched: their steps, as a readable summary. */
function stepSummary(job: GhJob): string {
  // Not ✗: the classifier reads that glyph as a failed assertion.
  const icon: Record<string, string> = { success: '✓', failure: '✘', skipped: '–', cancelled: '⊘' };
  return (job.steps ?? [])
    .map((step) => {
      const seconds =
        step.started_at && step.completed_at
          ? ` (${Math.max(0, Math.round((Date.parse(step.completed_at) - Date.parse(step.started_at)) / 1000))}s)`
          : '';
      return `${icon[step.conclusion ?? ''] ?? '•'} ${step.name}${seconds}`;
    })
    .join('\n');
}

// ---- Environment labels -------------------------------------------

interface EnvironmentLabel {
  tier: 'development' | 'staging' | 'production';
  region: string;
  regionLabel: string;
  provider: string;
  cluster: string;
}

interface CodelensConfig {
  environments?: Record<string, Partial<EnvironmentLabel>>;
  /** Per-environment config file to compare when one deploy fails and its siblings pass. */
  deployConfig?: string;
}

function labelFor(name: string, config: CodelensConfig): EnvironmentLabel {
  const declared = config.environments?.[name] ?? {};
  const lower = name.toLowerCase();
  const tier =
    declared.tier && ['development', 'staging', 'production'].includes(declared.tier)
      ? declared.tier
      : /prod/.test(lower)
        ? 'production'
        : /stag|pre-?prod|uat/.test(lower)
          ? 'staging'
          : 'development';
  return {
    tier,
    region: declared.region || 'default',
    regionLabel: declared.regionLabel || name,
    provider: declared.provider || 'github',
    cluster: declared.cluster || 'GitHub environment',
  };
}

// ---- Sync ---------------------------------------------------------

export interface SyncResult {
  runsIngested: number;
  runsSkipped: number;
  failuresDiagnosed: number;
  logsFetched: number;
  logsAvailable: boolean;
  /** Runs queued, running or waiting at a gate when the sync finished. */
  activeRuns?: number;
}

interface SyncState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: SyncResult | null;
}

const states = new Map<string, SyncState>();
const lastAttempt = new Map<string, number>();

export function liveExampleRepository(): string | null {
  const configured = process.env.LIVE_EXAMPLE_REPOSITORY;
  if (configured === '') return null;
  const value = (configured ?? DEFAULT_LIVE_EXAMPLE).trim();
  return /^[\w.-]+\/[\w.-]+$/.test(value) ? value : null;
}

/** Repositories with real GitHub runs: the live example, and any a signed-in user connected. */
export function isSyncable(repository: Repository): boolean {
  if (repository.id === LIVE_EXAMPLE_ID) return liveExampleRepository() !== null;
  return Boolean(repository.userId) && /^[\w.-]+\/[\w.-]+$/.test(repository.fullName);
}

export function syncStatus(repository: Repository) {
  if (!isSyncable(repository)) return null;
  const state = states.get(repository.id);
  return {
    source: 'github-actions' as const,
    repository: repository.fullName,
    url: `https://github.com/${repository.fullName}/actions`,
    running: state?.running ?? false,
    startedAt: state?.startedAt ?? null,
    finishedAt: state?.finishedAt ?? null,
    error: state?.error ?? null,
    logsAvailable: state?.result?.logsAvailable ?? null,
    runsIngested: state?.result?.runsIngested ?? null,
  };
}

/**
 * Starts a background sync when the repository's data is more than a minute
 * old. Never awaited by a request: the view renders what is stored and polls
 * while the sync runs.
 */
export function requestSync(repository: Repository, { force = false } = {}): void {
  if (!isSyncable(repository)) return;
  const state = states.get(repository.id);
  if (state?.running) return;
  const last = lastAttempt.get(repository.id) ?? 0;
  const interval = state?.result?.activeRuns ? ACTIVE_SYNC_INTERVAL_MS : MIN_SYNC_INTERVAL_MS;
  if (!force && Date.now() - last < interval) return;
  lastAttempt.set(repository.id, Date.now());
  const next: SyncState = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    result: state?.result ?? null,
  };
  states.set(repository.id, next);
  void (async () => {
    try {
      const token = repository.userId
        ? await githubToken(repository.userId)
        : process.env.GITHUB_SYNC_TOKEN?.trim() || undefined;
      next.result = await syncRepository(repository, createGitHubAccess(token));
      await refreshIndex(repository);
    } catch (error) {
      next.error = error instanceof Error ? error.message : 'Sync failed';
      console.error(`[actions-sync] ${repository.fullName}: ${next.error}`);
    } finally {
      next.running = false;
      next.finishedAt = new Date().toISOString();
    }
  })();
}

const INDEX_MAX_AGE_MS = 6 * 60 * 60_000;

/** Keeps the import graph behind blast radius current for the live example. */
async function refreshIndex(repository: Repository) {
  if (repository.id !== LIVE_EXAMPLE_ID) return;
  const current = (
    await getDb().select().from(schema.repositories).where(eq(schema.repositories.id, repository.id))
  )[0];
  const age = current?.lastAnalyzedAt ? Date.now() - Date.parse(current.lastAnalyzedAt) : Infinity;
  if (age < INDEX_MAX_AGE_MS) return;
  try {
    await startIndex(current ?? repository, undefined, process.env.GITHUB_SYNC_TOKEN?.trim() || undefined);
  } catch (error) {
    console.error(`[actions-sync] indexing ${repository.fullName} failed: ${(error as Error).message}`);
  }
}

/** Ingests the newest runs of every workflow in the repository. Exported for tests. */
export async function syncRepository(repository: Repository, access: GitHubAccess): Promise<SyncResult> {
  const db = getDb();
  const repoPath = `/repos/${repository.fullName}`;
  const result: SyncResult = {
    runsIngested: 0,
    runsSkipped: 0,
    failuresDiagnosed: 0,
    logsFetched: 0,
    logsAvailable: access.authenticated,
  };

  // Repository metadata and the optional .codelens.json.
  const meta = await access.json<{
    default_branch: string;
    language: string | null;
    description: string | null;
  }>(repoPath);
  if (meta.default_branch !== repository.defaultBranch || meta.language !== repository.language) {
    await db
      .update(schema.repositories)
      .set({
        defaultBranch: meta.default_branch,
        language: meta.language,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.repositories.id, repository.id));
    repository = { ...repository, defaultBranch: meta.default_branch, language: meta.language };
  }
  let config: CodelensConfig = {};
  const configText = await access.file(repository.fullName, '.codelens.json', meta.default_branch);
  if (configText) {
    try {
      config = JSON.parse(configText) as CodelensConfig;
    } catch {
      config = {};
    }
  }

  // Workflows become pipelines.
  const workflows = (
    await access.json<{ workflows: GhWorkflow[] }>(`${repoPath}/actions/workflows?per_page=100`)
  ).workflows;
  const pipelineIdFor = (workflowId: number) => `${repository.id}:wf:${workflowId}`;
  for (const workflow of workflows) {
    await db
      .insert(pipelines)
      .values({
        id: pipelineIdFor(workflow.id),
        repositoryId: repository.id,
        name: workflow.name,
        provider: 'github-actions',
        filePath: workflow.path,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({ target: pipelines.id, set: { name: workflow.name, filePath: workflow.path } });
  }

  // Newest runs first; stop at runs already stored in their final state.
  const stored = new Map(
    (
      await db
        .select({ id: pipelineRuns.id, status: pipelineRuns.status, completedAt: pipelineRuns.completedAt })
        .from(pipelineRuns)
        .where(eq(pipelineRuns.repositoryId, repository.id))
    ).map((row) => [row.id, row]),
  );
  const pending: GhRun[] = [];
  for (let page = 1; page <= 3 && pending.length < MAX_RUNS_PER_SYNC; page += 1) {
    const { workflow_runs: runs } = await access.json<{ workflow_runs: GhRun[] }>(
      `${repoPath}/actions/runs?per_page=50&page=${page}`,
    );
    let unchanged = 0;
    for (const run of runs) {
      const previous = stored.get(`${repository.id}:run:${run.id}`);
      const finished = previous && !['queued', 'running', 'blocked'].includes(previous.status);
      if (finished && run.status === 'completed' && previous.completedAt === run.updated_at) {
        unchanged += 1;
        result.runsSkipped += 1;
        continue;
      }
      if (pending.length < MAX_RUNS_PER_SYNC) pending.push(run);
    }
    if (runs.length < 50 || unchanged === runs.length) break;
  }

  const workflowCache = new Map<string, WorkflowJob[]>();
  const workflowAt = async (path: string, sha: string) => {
    const cacheKey = `${path}@${sha}`;
    if (!workflowCache.has(cacheKey)) {
      const text = await access.file(repository.fullName, path, sha);
      workflowCache.set(cacheKey, text ? parseWorkflow(text) : []);
    }
    return workflowCache.get(cacheKey)!;
  };

  const environmentIds = new Map<string, string>();
  const environmentId = async (name: string) => {
    const known = environmentIds.get(name);
    if (known) return known;
    const id = `${repository.id}:env:${name}`;
    const label = labelFor(name, config);
    await db
      .insert(environments)
      .values({ id, repositoryId: repository.id, name, ...label, createdAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: environments.id, set: label });
    environmentIds.set(name, id);
    return id;
  };

  const ingestedFailures: string[] = [];
  // Read once per commit: a bake stage takes its length from the deploy
  // settings of the environment it follows.
  const settingsCache = new Map<string, Record<string, unknown> | null>();
  const settingsOf = async (environment: string, sha: string) => {
    if (!config.deployConfig?.includes('{environment}')) return null;
    const path = config.deployConfig.replace('{environment}', environment);
    const key = `${path}@${sha}`;
    if (!settingsCache.has(key)) {
      const text = await access.file(repository.fullName, path, sha).catch(() => null);
      try {
        settingsCache.set(key, text ? (JSON.parse(text) as Record<string, unknown>) : null);
      } catch {
        settingsCache.set(key, null);
      }
    }
    return settingsCache.get(key)!;
  };

  // Oldest first, so "previous run on this branch" is already stored.
  for (const run of pending.reverse()) {
    const runId = `${repository.id}:run:${run.id}`;
    // A redeploy ships the commit it names, not the head of its branch.
    const redeploy = redeployOf(run);
    const deployedSha = redeploy?.sha ?? run.head_sha;
    let redeployMessage: string | null = null;
    if (redeploy) {
      const commit = await access
        .json<{ commit?: { message?: string } }>(`${repoPath}/commits/${redeploy.sha}`)
        .catch(() => null);
      redeployMessage = commit?.commit?.message?.split('\n')[0] ?? null;
    }
    const jobs = (
      await access.json<{ jobs: GhJob[] }>(
        `${repoPath}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
      )
    ).jobs;
    const plan = planStages(jobs, await workflowAt(run.path, run.head_sha));

    // A job that hits timeout-minutes ends "cancelled", and so does its run.
    // Only the job's annotation says it timed out rather than being stopped.
    const timedOut = new Map<number, GhAnnotation[]>();
    if (run.conclusion === 'cancelled') {
      for (const job of jobs.filter((j) => j.conclusion === 'cancelled')) {
        const annotations = await access
          .json<GhAnnotation[]>(`${repoPath}/check-runs/${job.id}/annotations?per_page=50`)
          .catch((error: unknown) => {
            if (error instanceof GitHubError && (error.status === 403 || error.status === 429)) throw error;
            return [] as GhAnnotation[];
          });
        if (annotations.some((a) => /exceeded the maximum execution time/i.test(a.message)))
          timedOut.set(job.id, annotations);
      }
    }
    const status: RunStatus = timedOut.size ? 'failed' : runStatus(run);

    const stageRows: StageRow[] = [];
    for (const job of jobs) {
      const planned = plan.get(job.id)!;
      const jobStatus: StageStatus = timedOut.has(job.id) ? 'failed' : stageStatus(job);
      let log = stepSummary(job);
      if (jobStatus === 'failed' || (jobStatus === 'cancelled' && status === 'failed')) {
        const raw = access.authenticated
          ? await access.text(`${repoPath}/actions/jobs/${job.id}/logs`)
          : null;
        if (raw) {
          result.logsFetched += 1;
          log = cleanLog(raw);
        } else {
          // Without a token GitHub withholds the log; its annotations are public.
          const annotations = await access
            .json<GhAnnotation[]>(`${repoPath}/check-runs/${job.id}/annotations?per_page=50`)
            .catch((error: unknown) => {
              if (error instanceof GitHubError && (error.status === 403 || error.status === 429)) throw error;
              return [] as GhAnnotation[];
            });
          log = `${log}\n\n${annotationLog(annotations)}\n\n(Job log unavailable without a GitHub token; showing the job's annotations.)`;
        }
        const timeout = timedOut.get(job.id);
        if (timeout && raw) log = `${log}\n${annotationLog(timeout)}`;
      }
      const tests = planned.kind === 'test' ? testCountsFrom(log) : null;
      const failedStep = job.steps?.find((step) => step.conclusion === 'failure')?.name;
      let bakeMinutes: number | null = null;
      if (planned.kind === 'verify' && /\bbake\b|\bsoak/i.test(planned.name)) {
        const upstream = [...plan.values()].find((p) => planned.dependsOn.includes(p.key) && p.environment);
        const settings = upstream?.environment ? await settingsOf(upstream.environment, deployedSha) : null;
        const value = Number(settings?.bakeMinutes);
        bakeMinutes = settings && Number.isFinite(value) && value >= 0 ? value : null;
      }
      stageRows.push({
        id: `${runId}:${planned.key}`,
        runId,
        stageKey: planned.key,
        name: planned.name,
        kind: planned.kind,
        lane: planned.lane,
        sequence: planned.sequence,
        dependsOn: JSON.stringify(planned.dependsOn),
        // A deploy that never ran says nothing about its target.
        environmentId:
          planned.environment && jobStatus !== 'skipped' ? await environmentId(planned.environment) : null,
        status: jobStatus,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        durationMs:
          job.started_at && job.completed_at
            ? Math.max(0, Date.parse(job.completed_at) - Date.parse(job.started_at))
            : null,
        attempts: run.run_attempt ?? 1,
        exitCode: jobStatus === 'success' ? 0 : exitCodeFrom(log),
        runnerLabel: job.labels?.[0] ?? null,
        summary: JSON.stringify({
          steps: job.steps?.length ?? 0,
          ...(failedStep ? { failedStep } : {}),
          ...(tests ? { testsPassed: tests.passed, testsFailed: tests.failed } : {}),
          ...(bakeMinutes !== null ? { bakeMinutes } : {}),
          githubJobId: job.id,
        }),
        log,
      });
    }

    // The first stage to break, by DAG level and then by time.
    const broken = stageRows
      .filter((stage) => stage.status === 'failed')
      .sort(
        (a, b) =>
          (a.sequence ?? 0) - (b.sequence ?? 0) || String(a.completedAt).localeCompare(String(b.completedAt)),
      )[0];

    if (broken && status === 'failed') {
      const evidence: {
        filesChanged?: string[];
        configDrift?: { key: string; expected: string; actual: string }[];
      } = {};
      try {
        const commit = await access.json<{ files?: { filename: string }[] }>(
          `${repoPath}/commits/${deployedSha}`,
        );
        evidence.filesChanged = (commit.files ?? []).slice(0, MAX_FILES_CHANGED).map((file) => file.filename);
      } catch (error) {
        if (error instanceof GitHubError && (error.status === 403 || error.status === 429)) throw error;
      }
      const drift = await configDrift(
        access,
        repository.fullName,
        config,
        deployedSha,
        broken,
        stageRows,
        plan,
      );
      if (drift.length) evidence.configDrift = drift;
      broken.summary = JSON.stringify({ ...JSON.parse(broken.summary ?? '{}'), evidence });
    }

    const tiers = stageRows
      .filter((stage) => stage.kind === 'deploy' && stage.environmentId && stage.status !== 'skipped')
      .map((stage) => labelFor(stage.environmentId!.split(':env:')[1], config).tier);
    const targetTier = tiers.includes('production')
      ? 'production'
      : tiers.includes('staging')
        ? 'staging'
        : tiers.length
          ? 'development'
          : 'none';
    const startedAt = run.run_started_at ?? run.created_at;
    const completedAt = run.status === 'completed' ? run.updated_at : null;
    const runRow: RunRow = {
      id: runId,
      repositoryId: repository.id,
      pipelineId: pipelineIdFor(run.workflow_id),
      // Repository-unique and stable; GitHub's own per-workflow number is displayNumber.
      runNumber: run.id,
      displayNumber: run.run_number,
      externalUrl: run.html_url,
      branch: run.head_branch ?? 'detached',
      targetTier,
      commitSha: deployedSha,
      commitMessage: redeployMessage ?? ((run.head_commit?.message ?? '').split('\n')[0] || '(no message)'),
      deployTarget: redeploy?.target ?? null,
      commitAuthor: run.head_commit?.author?.name ?? run.actor?.login ?? 'unknown',
      trigger: trigger(run.event),
      pullRequestNumber: run.pull_requests?.[0]?.number ?? null,
      status,
      startedAt,
      completedAt,
      durationMs: completedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null,
      queuedMs: run.run_started_at
        ? Math.max(0, Date.parse(run.run_started_at) - Date.parse(run.created_at))
        : null,
      actor: run.triggering_actor?.login ?? run.actor?.login ?? 'unknown',
      failedStage: status === 'failed' ? (broken?.stageKey ?? null) : null,
      createdAt: new Date().toISOString(),
    };

    // Pipelines must exist for the foreign key even when a workflow was deleted.
    await db
      .insert(pipelines)
      .values({
        id: runRow.pipelineId,
        repositoryId: repository.id,
        name: run.name ?? run.path,
        provider: 'github-actions',
        filePath: run.path,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
    await db.transaction(async (tx) => {
      const { id: _id, createdAt: _createdAt, ...update } = runRow;
      await tx
        .insert(pipelineRuns)
        .values(runRow)
        .onConflictDoUpdate({ target: pipelineRuns.id, set: update });
      await tx.delete(environmentDeployments).where(eq(environmentDeployments.runId, runId));
      await tx.delete(pipelineStages).where(eq(pipelineStages.runId, runId));
      if (stageRows.length) await tx.insert(pipelineStages).values(stageRows);
      for (const stage of stageRows) {
        if (stage.kind !== 'deploy' || !stage.environmentId) continue;
        // A deploy waiting at its gate has not started: the environment
        // still runs its previous release.
        if (stage.status === 'skipped' || stage.status === 'blocked' || stage.status === 'queued') continue;
        await tx.insert(environmentDeployments).values({
          id: `${stage.id}:deploy`,
          environmentId: stage.environmentId,
          runId,
          version: deployedSha.slice(0, 7),
          commitSha: deployedSha,
          strategy: 'recreate',
          status: stage.status === 'success' ? 'live' : stage.status === 'failed' ? 'failed' : 'deploying',
          healthCheck:
            stage.status === 'success' ? 'passing' : stage.status === 'failed' ? 'failing' : 'pending',
          actor: runRow.actor,
          startedAt: stage.startedAt ?? startedAt,
          completedAt: stage.completedAt ?? null,
        });
      }
    });
    result.runsIngested += 1;
    if (status === 'failed') ingestedFailures.push(runId);
  }

  await refreshEnvironments(repository.id, access, repoPath);
  await refreshPipelineStats(repository.id);
  const history = await refreshFlakeHistory(repository.id);
  // Every stored failure, not only new ones: classification is a pure
  // function of the run and its history up to that run, and costs well
  // under a millisecond, so re-running it is how an engine fix reaches runs
  // diagnosed before it. It also covers any failure an interrupted sync left
  // without a verdict.
  const failed = await db
    .select({ id: pipelineRuns.id })
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repositoryId, repository.id), eq(pipelineRuns.status, 'failed')));
  const toDiagnose = new Set([...ingestedFailures, ...failed.map((row) => row.id)]);
  result.failuresDiagnosed = await diagnoseRuns(repository, [...toDiagnose], history);
  const active = await db
    .select({ id: pipelineRuns.id })
    .from(pipelineRuns)
    .where(
      and(
        eq(pipelineRuns.repositoryId, repository.id),
        inArray(pipelineRuns.status, ['queued', 'running', 'blocked']),
      ),
    );
  result.activeRuns = active.length;
  return result;
}

/**
 * Keys a failing deploy target is missing that a sibling which deployed
 * fine has, read from the per-environment file `.codelens.json` names.
 */
async function configDrift(
  access: GitHubAccess,
  fullName: string,
  config: CodelensConfig,
  sha: string,
  broken: StageRow,
  stages: StageRow[],
  plan: Map<number, PlannedStage>,
): Promise<{ key: string; expected: string; actual: string }[]> {
  if (!config.deployConfig?.includes('{environment}') || broken.kind !== 'deploy') return [];
  const environmentOf = (stage: StageRow) =>
    [...plan.values()].find((p) => p.key === stage.stageKey)?.environment ?? null;
  const failing = environmentOf(broken);
  const sibling = stages.find(
    (s) =>
      s.kind === 'deploy' && s.sequence === broken.sequence && s.status === 'success' && environmentOf(s),
  );
  const siblingEnvironment = sibling ? environmentOf(sibling) : null;
  if (!failing || !siblingEnvironment) return [];
  const read = async (environment: string) => {
    const text = await access.file(fullName, config.deployConfig!.replace('{environment}', environment), sha);
    try {
      return text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const [mine, theirs] = await Promise.all([read(failing), read(siblingEnvironment)]);
  if (!theirs) return [];
  return Object.keys(theirs)
    .filter((key) => !mine || !(key in mine))
    .map((key) => ({
      key,
      expected: `set (as in ${siblingEnvironment})`,
      actual: mine ? 'absent' : 'file missing',
    }));
}

/** Each target's state follows its latest deploy; the address comes from GitHub's deployment record. */
async function refreshEnvironments(repositoryId: string, access: GitHubAccess, repoPath: string) {
  const db = getDb();
  const envRows = await db.select().from(environments).where(eq(environments.repositoryId, repositoryId));
  let lookups = true;
  for (const env of envRows) {
    const deploys = (
      await db.select().from(environmentDeployments).where(eq(environmentDeployments.environmentId, env.id))
    ).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const latest = deploys[0];
    const lastGood = deploys.find((d) => d.status === 'live' || d.status === 'superseded');
    // Older successful deploys are superseded by the newest one.
    for (const deploy of deploys) {
      if (deploy.status === 'live' && deploy.id !== lastGood?.id) {
        await db
          .update(environmentDeployments)
          .set({ status: 'superseded' })
          .where(eq(environmentDeployments.id, deploy.id));
      }
    }
    let url = env.url;
    // The address is a nicety: look it up only for targets that were deployed
    // to, and never let it fail the sync.
    if (latest && lookups) {
      try {
        const [deployment] = await access.json<{ id: number }[]>(
          `${repoPath}/deployments?environment=${encodeURIComponent(env.name)}&per_page=1`,
        );
        if (deployment) {
          const [status] = await access.json<{ environment_url?: string; target_url?: string }[]>(
            `${repoPath}/deployments/${deployment.id}/statuses?per_page=1`,
          );
          url = status?.environment_url || status?.target_url || url;
        }
      } catch {
        lookups = false;
      }
    }
    await db
      .update(environments)
      .set({
        url,
        status: !latest
          ? 'unknown'
          : latest.status === 'failed'
            ? 'down'
            : latest.status === 'deploying'
              ? 'deploying'
              : 'healthy',
        currentVersion: lastGood?.version ?? null,
        currentCommitSha: lastGood?.commitSha ?? null,
        deployedAt: lastGood?.completedAt ?? null,
      })
      .where(eq(environments.id, env.id));
  }
}

async function refreshPipelineStats(repositoryId: string) {
  const db = getDb();
  const runs = await db.select().from(pipelineRuns).where(eq(pipelineRuns.repositoryId, repositoryId));
  const byPipeline = new Map<string, typeof runs>();
  for (const run of runs) byPipeline.set(run.pipelineId, [...(byPipeline.get(run.pipelineId) ?? []), run]);
  for (const [pipelineId, list] of byPipeline) {
    const finished = list.filter((r) => r.status === 'success' || r.status === 'failed');
    const durations = finished
      .map((r) => r.durationMs ?? 0)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    await db
      .update(pipelines)
      .set({
        successRate: finished.length
          ? finished.filter((r) => r.status === 'success').length / finished.length
          : null,
        p50DurationMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
        lastRunAt:
          list
            .map((r) => r.startedAt)
            .sort()
            .pop() ?? null,
      })
      .where(eq(pipelines.id, pipelineId));
  }
}

interface TestObservation {
  runId: string;
  stageKey: string;
  branch: string;
  at: string;
  failed: FailedTest[];
}

/**
 * Flake history from every finished test stage: a test's run count is the
 * number of executions of the stages it has failed in, so a test that fails
 * one run in ten across branches reads as flaky and one that fails every run
 * of one branch reads as a regression.
 */
export function flakeStats(
  observations: readonly TestObservation[],
  asOf?: string,
): Map<string, FailingTest & { firstSeenAt: string; lastFailedAt: string }> {
  const visible = asOf ? observations.filter((o) => o.at <= asOf) : observations;
  const failures = new Map<string, { test: FailedTest; stageKeys: Set<string>; runs: TestObservation[] }>();
  for (const observation of visible) {
    for (const test of observation.failed) {
      const entry = failures.get(test.name) ?? { test, stageKeys: new Set<string>(), runs: [] };
      entry.stageKeys.add(observation.stageKey);
      entry.runs.push(observation);
      failures.set(test.name, entry);
    }
  }
  const stats = new Map<string, FailingTest & { firstSeenAt: string; lastFailedAt: string }>();
  for (const [name, entry] of failures) {
    const runCount = visible.filter((o) => entry.stageKeys.has(o.stageKey)).length;
    const times = entry.runs.map((r) => r.at).sort();
    stats.set(name, {
      name,
      file: entry.test.file,
      suite: entry.test.suite,
      runCount,
      flakeRate: runCount ? entry.runs.length / runCount : 0,
      distinctBranches: new Set(entry.runs.map((r) => r.branch)).size,
      firstFailure: entry.runs.length === 1,
      firstSeenAt: times[0],
      lastFailedAt: times[times.length - 1],
    });
  }
  return stats;
}

async function refreshFlakeHistory(repositoryId: string): Promise<TestObservation[]> {
  const db = getDb();
  const rows = await db
    .select({
      runId: pipelineRuns.id,
      branch: pipelineRuns.branch,
      startedAt: pipelineRuns.startedAt,
      stageKey: pipelineStages.stageKey,
      status: pipelineStages.status,
      log: pipelineStages.log,
    })
    .from(pipelineStages)
    .innerJoin(pipelineRuns, eq(pipelineStages.runId, pipelineRuns.id))
    .where(and(eq(pipelineRuns.repositoryId, repositoryId), eq(pipelineStages.kind, 'test')));
  const observations: TestObservation[] = rows
    .filter((row) => row.status === 'success' || row.status === 'failed')
    .map((row) => ({
      runId: row.runId,
      stageKey: row.stageKey,
      branch: row.branch,
      at: row.startedAt,
      failed: row.status === 'failed' ? failingTestsFrom(row.log) : [],
    }));

  const stats = flakeStats(observations);
  await db.delete(flakyTests).where(eq(flakyTests.repositoryId, repositoryId));
  for (const test of stats.values()) {
    await db.insert(flakyTests).values({
      id: `${repositoryId}:flake:${Buffer.from(test.name).toString('base64url').slice(0, 80)}`,
      repositoryId,
      testName: test.name,
      filePath: test.file,
      suite: test.suite ?? '',
      runCount: test.runCount,
      failCount: Math.round(test.flakeRate * test.runCount),
      flakeRate: test.flakeRate,
      distinctBranches: test.distinctBranches,
      quarantined: false,
      firstSeenAt: test.firstSeenAt,
      lastFailedAt: test.lastFailedAt,
    });
  }
  return observations;
}

async function diagnoseRuns(
  repository: Repository,
  runIds: string[],
  observations: TestObservation[],
): Promise<number> {
  if (runIds.length === 0) return 0;
  const db = getDb();
  const runs = await db.select().from(pipelineRuns).where(inArray(pipelineRuns.id, runIds));
  let diagnosed = 0;
  for (const run of runs) {
    // History as of the run: later failures must not change an old verdict.
    const history = flakeStats(observations, run.startedAt);
    const built = await buildFailureContext(repository, run, { flakeHistory: history });
    if (!built) continue;
    const started = performance.now();
    const verdict = diagnose(built.context);
    const computeMs = Math.max(1, Math.round(performance.now() - started));
    const row = {
      id: `${run.id}:diagnosis`,
      runId: run.id,
      stageKey: built.broken.stageKey,
      category: verdict.category,
      title: verdict.title,
      summary: verdict.summary,
      confidence: verdict.confidence,
      blameCommitSha: verdict.blame?.commitSha ?? null,
      blameFile: verdict.blame?.file ?? null,
      blameLine: verdict.blame?.line ?? null,
      blameAuthor: verdict.blame?.author ?? null,
      signals: JSON.stringify(verdict.signals),
      recommendation: verdict.recommendation,
      recommendedAction: verdict.recommendedAction,
      similarRunIds: JSON.stringify(verdict.similarRunIds),
      computeMs,
      createdAt: new Date().toISOString(),
    };
    await db.delete(pipelineDiagnoses).where(eq(pipelineDiagnoses.runId, run.id));
    await db.insert(pipelineDiagnoses).values(row);
    diagnosed += 1;
  }
  return diagnosed;
}

/** Registers the live example repository at startup; a no-op when LIVE_EXAMPLE_REPOSITORY is empty. */
export async function ensureLiveExample(): Promise<void> {
  const fullName = liveExampleRepository();
  if (!fullName) return;
  const [owner, name] = fullName.split('/');
  const now = new Date().toISOString();
  await getDb()
    .insert(schema.repositories)
    .values({
      id: LIVE_EXAMPLE_ID,
      owner,
      name,
      fullName,
      url: `https://github.com/${fullName}.git`,
      defaultBranch: 'main',
      description: 'Live example: real GitHub Actions runs, logs and Azure deployments, synced on visit.',
      userId: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.repositories.id,
      set: { owner, name, fullName, url: `https://github.com/${fullName}.git`, updatedAt: now },
    });
}
