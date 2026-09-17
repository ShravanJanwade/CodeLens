// ============================================================
// CodeLens — Pipeline failure root-cause classifier
// ============================================================
// Given the context of a failed pipeline stage, decide *why* it
// failed and what to do about it.
//
// Design constraints, in priority order:
//
//  1. Explainable. Every verdict ships the list of signals that
//     produced it, with the weight each contributed, plus the ones
//     that argued against it. An engineer looking at a diagnosis can
//     check the reasoning rather than trusting a score.
//  2. Deterministic. Same context in, same verdict out. That is what
//     makes the benchmark in apps/api/src/pipeline/benchmark.ts
//     meaningful and what keeps the product debuggable.
//  3. Cheap. Pure functions over already-fetched context, no I/O
//     and no model call, so diagnosis is sub-millisecond and can
//     run on every failed run without a budget conversation.
//
// The interesting problem here is discriminating a flaky test from
// a real regression. Both present identically in a single run --
// "tests failed" -- and the difference is only visible in history:
// a flaky test fails across unrelated branches at a low rate, a
// regression fails deterministically on exactly one branch and
// starts at a specific commit.
// ============================================================

export const DIAGNOSIS_ENGINE_VERSION = '2.1.0';

export type DiagnosisCategory =
  | 'flaky-test'
  | 'code-regression'
  | 'infra-capacity'
  | 'dependency-drift'
  | 'config-drift'
  | 'secret-expiry'
  | 'migration-failure'
  | 'timeout'
  | 'unknown';

export type RecommendedAction =
  | 'retry'
  | 'revert'
  | 'quarantine-test'
  | 'scale-runner'
  | 'pin-dependency'
  | 'rotate-secret'
  | 'fix-forward'
  | 'investigate';

export type StageKind =
  'checkout' | 'build' | 'test' | 'scan' | 'package' | 'approval' | 'deploy' | 'verify' | 'rollback';

/** A single piece of evidence that moved the verdict. */
export interface DiagnosisSignal {
  /** Stable id so the UI can link to an explanation. */
  id: string;
  label: string;
  detail: string;
  /** Which category this evidence argues for. */
  supports: DiagnosisCategory;
  /** 0..1 — how much this signal contributed. */
  weight: number;
  /** Where the evidence came from, shown as provenance in the UI. */
  source: 'log' | 'history' | 'topology' | 'diff' | 'metrics';
}

export interface FailingTest {
  name: string;
  file: string;
  suite?: string;
  message?: string;
  /** Fraction of historical runs where this test failed. */
  flakeRate: number;
  /** How many distinct branches it has failed on. */
  distinctBranches: number;
  runCount: number;
  /** True when this test has never failed before this run. */
  firstFailure?: boolean;
}

export interface FailureContext {
  stage: {
    key: string;
    name: string;
    kind: StageKind;
    exitCode?: number | null;
    durationMs?: number | null;
    attempts?: number;
    log: string;
    /** Baseline duration for this stage across recent green runs. */
    baselineDurationMs?: number | null;
    region?: string | null;
    environment?: string | null;
  };
  run: {
    branch: string;
    defaultBranch: string;
    trigger: string;
    commitSha: string;
    commitMessage?: string;
    commitAuthor?: string;
    /** Paths touched by this commit relative to the repo root. */
    filesChanged?: string[];
  };
  history: {
    failingTests?: FailingTest[];
    /** True when the previous run on this same branch was green. */
    previousRunOnBranchPassed?: boolean;
    /** Runs of this stage on *other* branches that failed the same way. */
    sameFailureOtherBranches?: number;
    /** A dependency manifest or lockfile is in the diff. */
    lockfileChanged?: boolean;
    /** Sibling deploy targets for the same run, by region. */
    siblingRegionResults?: { region: string; status: string }[];
    /** Configuration keys that differ between the failing target and its peers. */
    configDrift?: { key: string; expected: string; actual: string }[];
    runnerMemoryPct?: number | null;
    runnerDiskPct?: number | null;
    /** Ids of earlier runs that produced the same log signature. */
    similarRunIds?: string[];
  };
}

export interface Diagnosis {
  category: DiagnosisCategory;
  title: string;
  summary: string;
  /** 0..1, rounded to two decimals. */
  confidence: number;
  signals: DiagnosisSignal[];
  recommendation: string;
  recommendedAction: RecommendedAction;
  blame?: {
    commitSha?: string;
    file?: string;
    line?: number;
    author?: string;
  };
  similarRunIds: string[];
  engineVersion: string;
}

// ============================================================
// Log signatures
// ------------------------------------------------------------
// Ordered most-specific first. A resource-exhaustion kill and a
// generic "process exited" both contain "exit", so ordering here
// is load-bearing.
// ============================================================

interface LogRule {
  id: string;
  label: string;
  supports: DiagnosisCategory;
  weight: number;
  pattern: RegExp;
  /** Only apply to these stage kinds, when the signal is kind-specific. */
  kinds?: StageKind[];
}

const LOG_RULES: LogRule[] = [
  // ---- Resource exhaustion -------------------------------------
  {
    id: 'oom-kill',
    label: 'Runner killed on memory',
    supports: 'infra-capacity',
    weight: 0.62,
    pattern:
      /OOMKilled|out of memory|Cannot allocate memory|exit code 137|signal: killed|JavaScript heap out of memory/i,
  },
  {
    id: 'disk-full',
    label: 'Runner disk exhausted',
    supports: 'infra-capacity',
    weight: 0.6,
    pattern: /no space left on device|ENOSPC|disk quota exceeded/i,
  },
  {
    id: 'runner-unavailable',
    label: 'No runner could be acquired',
    supports: 'infra-capacity',
    weight: 0.5,
    pattern:
      /no runner matching|waiting for a runner|runner (?:lost|disconnected)|the self-hosted runner.*lost communication/i,
  },

  // ---- Credentials --------------------------------------------
  // Deliberately narrow: a 401 from the *application* under test
  // during a verify stage is a regression, not an expired secret,
  // so these require registry/cloud/auth vocabulary nearby.
  {
    id: 'auth-expired',
    label: 'Credential rejected by provider',
    supports: 'secret-expiry',
    weight: 0.66,
    pattern:
      /(?:401|403|unauthorized|forbidden|bad credentials|invalid[_ ]token|access denied|authentication failed|could not read Username)[\s\S]{0,180}?(?:registry|ghcr|docker|ecr|npm|pypi|maven|aws|gcp|azure|sts|oidc|assume[_ -]?role|vault|secret|token|kubeconfig|helm)/i,
  },
  {
    id: 'token-expiry-explicit',
    label: 'Provider reported an expired credential',
    supports: 'secret-expiry',
    weight: 0.72,
    pattern:
      /token (?:has )?expired|credential(?:s)? (?:have )?expired|ExpiredToken|certificate has expired|signature has expired|password authentication failed/i,
  },

  // ---- Dependencies -------------------------------------------
  {
    id: 'dep-resolution',
    label: 'Dependency resolution failed',
    supports: 'dependency-drift',
    weight: 0.64,
    pattern:
      /ERESOLVE|unable to resolve dependency tree|conflicting peer dependency|version solving failed|Could not find a version that satisfies|no matching version found/i,
  },
  {
    id: 'dep-missing-export',
    label: 'Upstream package changed its public surface',
    supports: 'dependency-drift',
    weight: 0.58,
    // Bare specifiers only. A relative path that fails to resolve is
    // a problem in this repository, not upstream.
    pattern:
      /Module '"[^"./][^"]*"' has no exported member|does not provide an export named|Cannot find module '[^'./][^']*'|Can't resolve '[^'./][^']*'/i,
  },
  {
    id: 'dep-registry-404',
    label: 'Package missing from registry',
    supports: 'dependency-drift',
    weight: 0.55,
    pattern: /npm ERR! 404|404 Not Found -\s*GET .*registry|yanked|deprecated and removed/i,
  },

  // ---- Database migrations ------------------------------------
  {
    id: 'migration-error',
    label: 'Schema migration failed',
    supports: 'migration-failure',
    weight: 0.7,
    pattern:
      /migration (?:failed|error|aborted)|duplicate column name|relation "[^"]+" already exists|column "[^"]+" (?:does not exist|already exists)|SQLSTATE\[|ORA-\d{5}|deadlock detected|lock timeout exceeded/i,
  },

  // ---- Timeouts -----------------------------------------------
  {
    id: 'explicit-timeout',
    label: 'Step hit its time limit',
    supports: 'timeout',
    weight: 0.5,
    pattern:
      /timed out|timeout (?:of )?\d+|deadline exceeded|ETIMEDOUT|context deadline exceeded|exceeded the maximum execution time/i,
  },

  // ---- Configuration ------------------------------------------
  {
    id: 'missing-config',
    label: 'Required configuration absent at runtime',
    supports: 'config-drift',
    weight: 0.56,
    pattern:
      /(?:required )?(?:env(?:ironment)? var(?:iable)?|configuration key|config value)\s+['"`]?[A-Z0-9_]{3,}['"`]?\s+(?:is )?(?:not set|missing|undefined|required)|Missing required environment|ConfigurationError/i,
  },
  {
    id: 'readiness-fail',
    label: 'Deployed replicas never became ready',
    supports: 'config-drift',
    weight: 0.45,
    kinds: ['deploy', 'verify'],
    pattern:
      /readiness probe failed|liveness probe failed|deployment .* exceeded its progress deadline|CrashLoopBackOff|ImagePullBackOff|0\/\d+ replicas? (?:are )?(?:available|ready)/i,
  },

  // ---- Compilation / tests ------------------------------------
  {
    id: 'compile-error',
    label: 'Source failed to compile',
    supports: 'code-regression',
    weight: 0.6,
    // TS2305 (no exported member) and TS2307 (cannot find module) are
    // resolution failures, owned by dep-missing-export above. Letting
    // the generic rule claim them reported every upstream API change
    // as a regression in whichever commit happened to be building.
    pattern:
      /error TS(?!2305\b|2307\b)\d{4}|SyntaxError|cannot find name|Type '[^']+' is not assignable|compilation (?:failed|terminated)|error\[E\d{4}\]/i,
  },
  {
    id: 'assertion-failure',
    label: 'Test assertions failed',
    supports: 'code-regression',
    weight: 0.34,
    pattern:
      /AssertionError|expected .* (?:to|but) (?:be|equal|received)|✕|✗|\bFAIL\b|Tests:\s+\d+ failed|assert(?:ion)? failed/i,
  },
  {
    id: 'unhandled-throw',
    label: 'Unhandled exception during the run',
    supports: 'code-regression',
    weight: 0.3,
    pattern:
      /Unhandled(?:Promise)?Rejection|TypeError:|ReferenceError:|NullPointerException|panic:|nil pointer dereference/i,
  },
];

/** Matches a log against every rule, newest evidence first. */
function readLog(context: FailureContext): DiagnosisSignal[] {
  const { log, kind } = { log: context.stage.log ?? '', kind: context.stage.kind };
  const signals: DiagnosisSignal[] = [];
  for (const rule of LOG_RULES) {
    if (rule.kinds && !rule.kinds.includes(kind)) continue;
    const match = rule.pattern.exec(log);
    if (!match) continue;
    signals.push({
      id: rule.id,
      label: rule.label,
      // Quote the matched line so the engineer sees the actual evidence.
      detail: excerpt(log, match.index),
      supports: rule.supports,
      weight: rule.weight,
      source: 'log',
    });
  }
  return signals;
}

/** Pulls the whole log line containing `index`, trimmed for display. */
function excerpt(log: string, index: number): string {
  const start = log.lastIndexOf('\n', index) + 1;
  const end = log.indexOf('\n', index);
  const line = log.slice(start, end === -1 ? undefined : end).trim();
  return line.length > 180 ? `${line.slice(0, 177)}...` : line || 'matched in stage log';
}

// ============================================================
// History: flaky test vs. real regression
// ------------------------------------------------------------
// A single run cannot tell these apart, so everything here is a
// judgement about the *shape of the failure over time*.
// ============================================================

/** A test failing at a low rate across many branches is infrastructure noise. */
const FLAKE_RATE_FLOOR = 0.04;
/** Below this many observations the flake rate is not yet trustworthy. */
const MIN_RUNS_FOR_FLAKE = 8;
/** Failing on this many distinct branches means it is not about your diff. */
const CROSS_BRANCH_THRESHOLD = 3;

function readTestHistory(context: FailureContext): DiagnosisSignal[] {
  const tests = context.history.failingTests ?? [];
  if (tests.length === 0) return [];
  const signals: DiagnosisSignal[] = [];

  const established = tests.filter((t) => t.runCount >= MIN_RUNS_FOR_FLAKE);
  const flaky = established.filter(
    (t) => t.flakeRate >= FLAKE_RATE_FLOOR && t.distinctBranches >= CROSS_BRANCH_THRESHOLD,
  );
  const fresh = tests.filter((t) => t.firstFailure || t.flakeRate === 0);

  // Every failing test has a history of failing elsewhere: this diff
  // is almost certainly innocent.
  if (flaky.length > 0 && flaky.length === tests.length) {
    const worst = flaky.reduce((a, b) => (b.flakeRate > a.flakeRate ? b : a));
    signals.push({
      id: 'all-failures-known-flaky',
      label: 'Every failing test has a flake history',
      detail: `${flaky.length} failing test${flaky.length === 1 ? '' : 's'}, all previously failing on other branches. Worst: ${worst.name} at ${(worst.flakeRate * 100).toFixed(1)}% over ${worst.runCount} runs across ${worst.distinctBranches} branches.`,
      supports: 'flaky-test',
      weight: 0.74,
      source: 'history',
    });
  } else if (flaky.length > 0) {
    // Mixed: some noise, but something new is also broken.
    signals.push({
      id: 'partial-flake-overlap',
      label: 'Some failures are known flakes',
      detail: `${flaky.length} of ${tests.length} failing tests have prior cross-branch failures; ${tests.length - flaky.length} do not.`,
      supports: 'flaky-test',
      weight: 0.2,
      source: 'history',
    });
  }

  // A test that has never failed before, now failing deterministically.
  if (fresh.length > 0) {
    signals.push({
      id: 'first-time-failure',
      label: 'Test failing for the first time',
      detail: `${fresh
        .map((t) => t.name)
        .slice(0, 3)
        .join(
          ', ',
        )}${fresh.length > 3 ? ` +${fresh.length - 3} more` : ''} — no prior failure on any branch.`,
      supports: 'code-regression',
      weight: 0.56,
      source: 'history',
    });
  }

  return signals;
}

/**
 * The same stage failing identically across unrelated branches means
 * the cause is shared, not local to one diff.
 *
 * This lives outside readTestHistory on purpose: a build or install
 * stage has no failing tests at all, and gating this behind a test
 * list meant every cross-branch build failure got blamed on the
 * commit that happened to be running.
 */
function readCrossBranch(context: FailureContext): DiagnosisSignal[] {
  const cross = context.history.sameFailureOtherBranches ?? 0;
  if (cross < 2) return [];
  const onTests = context.stage.kind === 'test';
  return [
    {
      id: onTests ? 'concurrent-cross-branch' : 'shared-failure-across-branches',
      label: 'Same failure on unrelated branches',
      detail: `${cross} other branches are failing this stage identically, so the cause is shared rather than local to this change.`,
      supports: 'flaky-test',
      // Outside a test stage this signal only rules things *out* -- it
      // says the cause is shared, not that a test is flaky. Weight 0
      // keeps it out of the scores while still firing its suppression.
      weight: onTests ? 0.42 : 0,
      source: 'history',
    },
  ];
}

/** Ties a failure to the diff that introduced it. */
function readDiff(context: FailureContext): DiagnosisSignal[] {
  const signals: DiagnosisSignal[] = [];
  const changed = context.run.filesChanged ?? [];

  if (context.history.lockfileChanged) {
    signals.push({
      id: 'lockfile-in-diff',
      label: 'Dependency manifest changed in this commit',
      detail: 'A lockfile or manifest is part of the diff, so the dependency graph moved with this change.',
      supports: 'dependency-drift',
      weight: 0.4,
      source: 'diff',
    });
  }

  // A green previous run on the same branch narrows the blame window
  // to exactly this commit.
  if (context.history.previousRunOnBranchPassed) {
    signals.push({
      id: 'branch-was-green',
      label: 'Previous run on this branch was green',
      detail: `The last run of ${context.run.branch} succeeded, so the fault was introduced by ${short(context.run.commitSha)}.`,
      supports: 'code-regression',
      weight: 0.46,
      source: 'history',
    });
  }

  // Failing test files overlapping the diff is the strongest
  // regression signal available without running coverage.
  const tests = context.history.failingTests ?? [];
  if (changed.length > 0 && tests.length > 0) {
    const overlap = tests.filter((t) => sharesModule(t.file, changed));
    if (overlap.length > 0) {
      signals.push({
        id: 'diff-touches-failing-area',
        label: 'Diff touches the failing module',
        detail: `${overlap[0].file} failed and this commit modified a sibling or the module under test.`,
        supports: 'code-regression',
        weight: 0.5,
        source: 'diff',
      });
    }
  }

  // Migrations that fail *and* were edited in the same commit.
  if (changed.some((f) => /migration|migrate|\.sql$|schema\.(ts|js|prisma|rb)$/i.test(f))) {
    signals.push({
      id: 'migration-in-diff',
      label: 'Schema change in this commit',
      detail: changed
        .filter((f) => /migration|migrate|\.sql$|schema\./i.test(f))
        .slice(0, 2)
        .join(', '),
      supports: 'migration-failure',
      weight: 0.34,
      source: 'diff',
    });
  }

  // Config-only commits that break a deploy point at drift, not code.
  if (
    changed.length > 0 &&
    changed.every((f) =>
      /\.(ya?ml|toml|ini|env|json|tf|tfvars)$|^(?:config|deploy|k8s|helm|charts|infra)\//i.test(f),
    )
  ) {
    signals.push({
      id: 'config-only-diff',
      label: 'Commit changed only configuration',
      detail: `${changed.length} changed path${changed.length === 1 ? '' : 's'}, none of them application source.`,
      supports: 'config-drift',
      weight: 0.38,
      source: 'diff',
    });
  }

  return signals;
}

/** True when `file` lives in the same module tree as any changed path. */
function sharesModule(file: string, changed: string[]): boolean {
  const base = file
    .replace(/\.(test|spec)\.[a-z]+$/i, '')
    .replace(/^(?:tests?|__tests__|spec)\//, '')
    .replace(/\/[^/]*$/, '');
  if (!base) return false;
  return changed.some((c) => c.startsWith(base) || base.startsWith(c.replace(/\/[^/]*$/, '')));
}

function short(sha: string): string {
  return (sha ?? '').slice(0, 7);
}

// ============================================================
// Topology: which region / environment is actually broken
// ------------------------------------------------------------
// The most useful question during a bad deploy is "is this
// everywhere, or just one target?". Blast radius across regions
// discriminates a code problem (fails everywhere) from a
// target-specific problem (fails in one place).
// ============================================================

function readTopology(context: FailureContext): DiagnosisSignal[] {
  const signals: DiagnosisSignal[] = [];
  const siblings = context.history.siblingRegionResults ?? [];
  const drift = context.history.configDrift ?? [];

  if (siblings.length > 1) {
    const healthy = siblings.filter((s) => s.status === 'success');
    const broken = siblings.filter((s) => s.status === 'failed');

    // One region down while its peers shipped the identical artifact:
    // the artifact is fine, the target is not.
    if (broken.length >= 1 && healthy.length >= 1) {
      signals.push({
        id: 'region-isolated-failure',
        label: 'Failure isolated to one region',
        detail: `${broken.map((s) => s.region).join(', ')} failed while ${healthy.map((s) => s.region).join(', ')} deployed the same artifact successfully.`,
        supports: 'config-drift',
        weight: 0.6,
        source: 'topology',
      });
    }

    // Every region rejected the artifact: the artifact is the problem.
    if (healthy.length === 0 && broken.length === siblings.length) {
      signals.push({
        id: 'all-regions-failed',
        label: 'Every region rejected the artifact',
        detail: `All ${siblings.length} targets failed, so the cause travels with the build rather than the environment.`,
        supports: 'code-regression',
        weight: 0.4,
        source: 'topology',
      });
    }
  }

  if (drift.length > 0) {
    signals.push({
      id: 'config-key-divergence',
      label: 'Configuration differs from healthy peers',
      detail: drift
        .slice(0, 3)
        .map((d) => `${d.key}: expected ${d.expected}, found ${d.actual}`)
        .join(' · '),
      supports: 'config-drift',
      weight: 0.66,
      source: 'topology',
    });
  }

  return signals;
}

/** Runner metrics and duration outliers. */
function readMetrics(context: FailureContext): DiagnosisSignal[] {
  const signals: DiagnosisSignal[] = [];
  const { runnerMemoryPct, runnerDiskPct } = context.history;

  if (typeof runnerMemoryPct === 'number' && runnerMemoryPct >= 92) {
    signals.push({
      id: 'runner-memory-saturated',
      label: 'Runner memory saturated',
      detail: `Peak memory ${runnerMemoryPct.toFixed(0)}% of the runner allocation.`,
      supports: 'infra-capacity',
      weight: 0.52,
      source: 'metrics',
    });
  }
  if (typeof runnerDiskPct === 'number' && runnerDiskPct >= 94) {
    signals.push({
      id: 'runner-disk-saturated',
      label: 'Runner disk saturated',
      detail: `Disk at ${runnerDiskPct.toFixed(0)}% during the stage.`,
      supports: 'infra-capacity',
      weight: 0.5,
      source: 'metrics',
    });
  }

  // A stage that ran far past its own baseline before dying was
  // waiting on something, not failing fast on bad code.
  const { durationMs, baselineDurationMs } = context.stage;
  if (durationMs && baselineDurationMs && baselineDurationMs > 0) {
    const ratio = durationMs / baselineDurationMs;
    if (ratio >= 2.2) {
      signals.push({
        id: 'duration-outlier',
        label: 'Stage ran far beyond its baseline',
        detail: `${fmtDuration(durationMs)} against a ${fmtDuration(baselineDurationMs)} baseline (${ratio.toFixed(1)}x).`,
        supports: 'timeout',
        weight: 0.44,
        source: 'metrics',
      });
    }
  }

  // Retried and still failing rules out transient noise.
  const attempts = context.stage.attempts ?? 1;
  if (attempts >= 2) {
    signals.push({
      id: 'reproduced-on-retry',
      label: `Reproduced across ${attempts} attempts`,
      detail: 'A retry did not clear the failure, so it is deterministic rather than intermittent.',
      supports: 'code-regression',
      weight: 0.36,
      source: 'history',
    });
  }

  return signals;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  return `${m}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// ============================================================
// Scoring
// ============================================================

/**
 * Signals that argue *against* a competing category. Without this
 * the engine confuses flaky tests and regressions constantly: both
 * accumulate "tests failed" evidence, and only the suppressions
 * below encode which story the evidence actually rules out.
 *
 * Read as: when `key` fires, multiply these categories' scores.
 */
const SUPPRESSIONS: Record<string, Partial<Record<DiagnosisCategory, number>>> = {
  // A process killed by the runtime reports every unfinished test as
  // failed, so its test results carry almost no information. Without
  // these three the engine blames the commit for an OOM roughly half
  // the time -- the assertion noise from a half-run suite outweighs
  // the single kill line that actually explains the failure.
  'oom-kill': { 'code-regression': 0.35, 'flaky-test': 0.5 },
  'disk-full': { 'code-regression': 0.4, 'flaky-test': 0.5 },
  'runner-unavailable': { 'code-regression': 0.4, 'flaky-test': 0.5 },
  // A retry that reproduced the failure is not intermittent.
  'reproduced-on-retry': { 'flaky-test': 0.4 },
  // Known-flaky across branches means this diff is not the cause.
  'all-failures-known-flaky': { 'code-regression': 0.3 },
  'concurrent-cross-branch': { 'code-regression': 0.45 },
  'shared-failure-across-branches': { 'code-regression': 0.35 },
  // The same artifact succeeded elsewhere, so the artifact is fine.
  'region-isolated-failure': { 'code-regression': 0.45, 'dependency-drift': 0.6 },
  'config-key-divergence': { 'code-regression': 0.55 },
  // It failed in every region, so it is not one target's config.
  'all-regions-failed': { 'config-drift': 0.45, 'secret-expiry': 0.7 },
  // A green parent commit makes noise much less likely.
  'branch-was-green': { 'flaky-test': 0.6 },
  // A test's first-ever failure is by definition not a known flake.
  'first-time-failure': { 'flaky-test': 0.55 },
};

/**
 * Combines independent evidence with noisy-OR: 1 - prod(1 - w).
 * Chosen over a plain sum because two 0.6 signals should read as
 * "very likely" (0.84), not "impossible" (1.2), and because it
 * gives diminishing returns for free.
 */
function combine(weights: number[]): number {
  return 1 - weights.reduce((acc, w) => acc * (1 - clamp(w)), 1);
}

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}

function scoreCategories(signals: DiagnosisSignal[]): Map<DiagnosisCategory, number> {
  const byCategory = new Map<DiagnosisCategory, number[]>();
  for (const s of signals) {
    const list = byCategory.get(s.supports) ?? [];
    list.push(s.weight);
    byCategory.set(s.supports, list);
  }

  const scores = new Map<DiagnosisCategory, number>();
  for (const [category, weights] of byCategory) scores.set(category, combine(weights));

  // Suppressions apply after the base scores exist, so a suppression
  // can never resurrect a category that had no evidence at all.
  const fired = new Set(signals.map((s) => s.id));
  for (const id of fired) {
    const rules = SUPPRESSIONS[id];
    if (!rules) continue;
    for (const [category, factor] of Object.entries(rules)) {
      const current = scores.get(category as DiagnosisCategory);
      if (current !== undefined) scores.set(category as DiagnosisCategory, current * factor!);
    }
  }

  return scores;
}

// ============================================================
// Narrative
// ============================================================

interface Narrative {
  title: string;
  summary: (c: FailureContext, s: DiagnosisSignal[]) => string;
  recommendation: (c: FailureContext, s: DiagnosisSignal[]) => string;
  action: RecommendedAction;
}

function worstFlake(c: FailureContext): FailingTest | null {
  const tests = c.history.failingTests ?? [];
  return tests.length ? tests.reduce((a, b) => (b.flakeRate > a.flakeRate ? b : a)) : null;
}

const NARRATIVES: Record<DiagnosisCategory, Narrative> = {
  'flaky-test': {
    title: 'Flaky test, not a real failure',
    summary: (c) => {
      const tests = c.history.failingTests ?? [];
      const worst = worstFlake(c);
      return worst
        ? `${c.stage.name} failed on ${tests.length} test${tests.length === 1 ? '' : 's'} that already have a flake history. ${worst.name} has failed ${(worst.flakeRate * 100).toFixed(1)}% of ${worst.runCount} runs across ${worst.distinctBranches} branches, so the failure is independent of this change.`
        : `${c.stage.name} failed in a pattern matching known intermittent behaviour rather than anything introduced by this commit.`;
    },
    recommendation: (c) => {
      const worst = worstFlake(c);
      return worst
        ? `Quarantine ${worst.name} (${worst.file}) so it stops gating unrelated merges, then fix the underlying nondeterminism. Re-running this pipeline should pass with no code change.`
        : 'Re-run the stage. If it passes, quarantine the offending test rather than retrying future builds by hand.';
    },
    action: 'quarantine-test',
  },

  'code-regression': {
    title: 'Regression introduced by this commit',
    summary: (c) => {
      const tests = c.history.failingTests ?? [];
      const first = tests.find((t) => t.firstFailure || t.flakeRate === 0);
      const where = first ? ` ${first.name} in ${first.file} has never failed before.` : '';
      return `${c.stage.name} failed deterministically on ${c.run.branch} at ${short(c.run.commitSha)}.${where} The evidence points at the change itself rather than the environment or a known flake.`;
    },
    recommendation: (c) => {
      const tests = c.history.failingTests ?? [];
      const first = tests.find((t) => t.firstFailure || t.flakeRate === 0);
      const target = first ? first.file : 'the failing module';
      return c.run.branch === c.run.defaultBranch
        ? `Revert ${short(c.run.commitSha)} to restore ${c.run.defaultBranch}, then fix forward on a branch. Start in ${target}.`
        : `Fix forward in ${target} before merging. Nothing has shipped, so there is no rollback to perform.`;
    },
    action: 'revert',
  },

  'infra-capacity': {
    title: 'Runner ran out of resources',
    summary: (c, s) => {
      const which = s.find((x) => x.supports === 'infra-capacity');
      return `${c.stage.name} was terminated by the runtime, not by the test suite. ${which?.detail ?? 'The runner exhausted its resource allocation.'} No application code is implicated.`;
    },
    recommendation: (c) =>
      `Move ${c.stage.name} to a larger runner class or reduce its peak footprint — parallelism, heap ceiling, cached artifacts. A retry at the same runner size will most likely fail identically.`,
    action: 'scale-runner',
  },

  'dependency-drift': {
    title: 'Upstream dependency changed',
    summary: (c, s) => {
      const which = s.find((x) => x.supports === 'dependency-drift');
      return `${c.stage.name} failed while resolving or consuming a third-party package. ${which?.detail ?? 'A dependency moved out from under the build.'} Repository source is unchanged in the relevant path.`;
    },
    recommendation: () =>
      'Pin the offending dependency to the last known-good version and commit the updated lockfile, then upgrade deliberately behind its own pipeline run.',
    action: 'pin-dependency',
  },
  'config-drift': {
    title: 'Environment configuration is wrong',
    summary: (c, s) => {
      const drift = s.find((x) => x.id === 'config-key-divergence');
      const isolated = s.find((x) => x.id === 'region-isolated-failure');
      const target = [c.stage.environment, c.stage.region].filter(Boolean).join(' / ') || 'this target';
      return `${c.stage.name} failed against ${target} while the same artifact succeeded elsewhere. ${drift?.detail ?? isolated?.detail ?? 'Configuration on this target diverges from its healthy peers.'}`;
    },
    recommendation: (c, s) => {
      const drift = s.find((x) => x.id === 'config-key-divergence');
      const target =
        [c.stage.environment, c.stage.region].filter(Boolean).join(' / ') || 'the failing target';
      return drift
        ? `Reconcile configuration on ${target} against a healthy peer, then re-run the deploy stage only. Do not revert the build — the artifact is proven good in the other regions.`
        : `Compare ${target} against a healthy region and reconcile the difference. The artifact itself needs no change.`;
    },
    action: 'fix-forward',
  },

  'secret-expiry': {
    title: 'Credential expired or was revoked',
    summary: (c, s) => {
      const which = s.find((x) => x.supports === 'secret-expiry');
      return `${c.stage.name} was refused by an external provider. ${which?.detail ?? 'A credential was rejected during the stage.'} This is an access problem, not a code problem.`;
    },
    recommendation: (c) =>
      `Rotate the credential used by ${c.stage.name} and re-run. Add an expiry alarm so the next rotation is not discovered by a red pipeline.`,
    action: 'rotate-secret',
  },

  'migration-failure': {
    title: 'Database migration failed',
    summary: (c, s) => {
      const which = s.find((x) => x.supports === 'migration-failure');
      return `${c.stage.name} failed while applying a schema change${c.stage.environment ? ` to ${c.stage.environment}` : ''}. ${which?.detail ?? 'The migration did not apply cleanly.'} The target may now be partially migrated.`;
    },
    recommendation: () =>
      'Check whether the migration applied partially before doing anything else — a blind retry can double-apply. Make the migration idempotent and backwards compatible so it can ship ahead of the code that needs it.',
    action: 'fix-forward',
  },

  timeout: {
    title: 'Stage exceeded its time limit',
    summary: (c, s) => {
      const which = s.find((x) => x.id === 'duration-outlier');
      return `${c.stage.name} hit its time limit rather than failing an assertion. ${which?.detail ?? 'The stage ran past its allotted window.'} That usually means it was blocked on something, not that the code is wrong.`;
    },
    recommendation: () =>
      'Find what the stage was waiting on — a slow external service, a lock, an unbounded retry loop — before raising the timeout. Raising the limit hides the queue rather than draining it.',
    action: 'investigate',
  },

  unknown: {
    title: 'No confident root cause',
    summary: (c) =>
      `${c.stage.name} failed, but the available evidence does not favour any single explanation strongly enough to act on. The signals below are what the engine did find.`,
    recommendation: () =>
      'Open the stage log and the diff side by side. If this shape of failure recurs it is worth adding a signal for it, so the next occurrence classifies automatically.',
    action: 'investigate',
  },
};

// ============================================================
// Public entry point
// ============================================================

/** Below this the engine declines to guess rather than misleading. */
const MIN_ACTIONABLE_SCORE = 0.28;

export interface DiagnoseOptions {
  /**
   * Restrict which evidence sources are allowed to contribute.
   *
   * Exists for the ablation study in the benchmark: re-scoring the
   * same corpus with `['log']` and then with everything shows how
   * much of the engine's accuracy comes from history and topology
   * rather than from pattern-matching the log. That delta is the
   * argument for keeping flake history and region results around at
   * all, so it is worth being able to measure.
   */
  sources?: DiagnosisSignal['source'][];
}

/**
 * Classifies one failed stage.
 *
 * Pure and synchronous: no I/O, no clock, no randomness. Callers
 * gather the context; this decides what it means.
 */
export function diagnose(context: FailureContext, options: DiagnoseOptions = {}): Diagnosis {
  const allowed = options.sources ? new Set(options.sources) : null;
  const signals = [
    ...readLog(context),
    ...readTestHistory(context),
    ...readCrossBranch(context),
    ...readDiff(context),
    ...readTopology(context),
    ...readMetrics(context),
  ].filter((s) => !allowed || allowed.has(s.source));

  const scores = scoreCategories(signals);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [topCategory, topScore] = ranked[0] ?? (['unknown', 0] as [DiagnosisCategory, number]);
  const runnerUp = ranked[1]?.[1] ?? 0;

  const category: DiagnosisCategory = topScore >= MIN_ACTIONABLE_SCORE ? topCategory : 'unknown';

  // Confidence discounts for ambiguity: a clear winner keeps its
  // score, a photo finish is reported as genuinely uncertain. Without
  // this the engine sounds equally sure of a 0.7-vs-0.1 call and a
  // 0.7-vs-0.68 coin flip.
  const margin = topScore > 0 ? (topScore - runnerUp) / topScore : 0;
  const confidence =
    category === 'unknown' ? clamp(topScore, 0, 0.3) : clamp(topScore * (0.62 + 0.38 * margin), 0, 0.97);

  const narrative = NARRATIVES[category];
  // Only the evidence for the winning category, plus anything that
  // actively argued against it — that pairing is what makes the
  // verdict checkable rather than just assertive.
  const relevant = signals
    .filter((s) => s.supports === category || SUPPRESSIONS[s.id]?.[category] !== undefined)
    .sort((a, b) => b.weight - a.weight);

  return {
    category,
    title: narrative.title,
    summary: narrative.summary(context, signals),
    confidence: Math.round(confidence * 100) / 100,
    signals: relevant.length > 0 ? relevant : signals.sort((a, b) => b.weight - a.weight),
    recommendation: narrative.recommendation(context, signals),
    recommendedAction: pickAction(category, narrative.action, context),
    blame: pickBlame(category, context),
    similarRunIds: context.history.similarRunIds ?? [],
    engineVersion: DIAGNOSIS_ENGINE_VERSION,
  };
}

/**
 * The recommended action is category-driven but situation-aware: the
 * same regression warrants a revert on main and a fix-forward on a
 * feature branch, because only one of them is blocking anyone else.
 */
function pickAction(
  category: DiagnosisCategory,
  fallback: RecommendedAction,
  context: FailureContext,
): RecommendedAction {
  const onDefault = context.run.branch === context.run.defaultBranch;
  if (category === 'code-regression') return onDefault ? 'revert' : 'fix-forward';
  if (category === 'flaky-test') {
    const worst = worstFlake(context);
    // Not yet bad enough to quarantine — a retry is the cheaper call.
    return worst && worst.flakeRate < 0.1 ? 'retry' : 'quarantine-test';
  }
  return fallback;
}

/** Points at the most specific location the evidence supports. */
function pickBlame(category: DiagnosisCategory, context: FailureContext): Diagnosis['blame'] {
  const tests = context.history.failingTests ?? [];
  switch (category) {
    case 'code-regression': {
      const first = tests.find((t) => t.firstFailure || t.flakeRate === 0) ?? tests[0];
      return {
        commitSha: context.run.commitSha,
        author: context.run.commitAuthor,
        file: first?.file,
      };
    }
    case 'flaky-test': {
      const worst = worstFlake(context);
      // Deliberately no commit: blaming this commit for an old flake
      // is exactly the mistake the engine exists to prevent.
      return worst ? { file: worst.file } : undefined;
    }
    case 'migration-failure':
    case 'dependency-drift': {
      const file = (context.run.filesChanged ?? []).find((f) =>
        category === 'migration-failure'
          ? /migration|migrate|\.sql$|schema\./i.test(f)
          : /lock(file)?|package\.json|requirements|go\.mod|Gemfile|Cargo\.toml/i.test(f),
      );
      return file ? { commitSha: context.run.commitSha, file, author: context.run.commitAuthor } : undefined;
    }
    default:
      return undefined;
  }
}

/** Human label for a category, shared by the API and the UI. */
export const CATEGORY_LABELS: Record<DiagnosisCategory, string> = {
  'flaky-test': 'Flaky test',
  'code-regression': 'Code regression',
  'infra-capacity': 'Infra capacity',
  'dependency-drift': 'Dependency drift',
  'config-drift': 'Config drift',
  'secret-expiry': 'Secret expiry',
  'migration-failure': 'Migration failure',
  timeout: 'Timeout',
  unknown: 'Unclassified',
};

export const ACTION_LABELS: Record<RecommendedAction, string> = {
  retry: 'Re-run the stage',
  revert: 'Revert the commit',
  'quarantine-test': 'Quarantine the test',
  'scale-runner': 'Scale the runner',
  'pin-dependency': 'Pin the dependency',
  'rotate-secret': 'Rotate the credential',
  'fix-forward': 'Fix forward',
  investigate: 'Investigate manually',
};

/**
 * True when the category means "your change is fine" — used by the UI
 * to tell a developer whether they are actually blocked. This is the
 * single most valuable bit in the whole product: it is the difference
 * between reading logs for 40 minutes and pressing re-run.
 */
export function isChangeExonerated(category: DiagnosisCategory): boolean {
  return (
    category === 'flaky-test' ||
    category === 'infra-capacity' ||
    category === 'secret-expiry' ||
    category === 'config-drift'
  );
}
