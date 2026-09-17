// ============================================================
// Labelled failure corpus for the diagnosis engine
// ============================================================
// Generates a deterministic set of FailureContext fixtures with
// known ground truth, so the classifier can be scored instead of
// vibe-checked.
//
// Everything is driven by a seeded PRNG: the corpus is identical on
// every machine and in CI, which is the only way accuracy numbers
// mean anything across commits.
//
// The corpus is deliberately adversarial in places. Several cases
// are near-misses between flaky-test and code-regression, and a few
// deploy failures carry both a credential error *and* a region
// asymmetry, because those are exactly the shapes the engine gets
// wrong if the suppression rules are sloppy.
// ============================================================

import type {
  DiagnosisCategory,
  FailureContext,
  FailingTest,
  RecommendedAction,
  StageKind,
} from '@codelens/shared';

export interface BenchmarkCase {
  id: string;
  label: string;
  expectedCategory: DiagnosisCategory;
  expectedAction: RecommendedAction;
  context: FailureContext;
}

/** Mulberry32 — small, fast, and reproducible across runtimes. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(0x5eed1eaf);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function between(lo: number, hi: number): number {
  return lo + rand() * (hi - lo);
}

function intBetween(lo: number, hi: number): number {
  return Math.floor(between(lo, hi + 1));
}

function sha(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 40; i += 1) s += hex[Math.floor(rand() * 16)];
  return s;
}

const BRANCHES = [
  'feat/checkout-v2',
  'fix/session-expiry',
  'chore/bump-deps',
  'feat/ledger-batching',
  'fix/webhook-retry',
  'refactor/payments-core',
] as const;

const AUTHORS = ['dana.k', 'r.okafor', 'mei.tanaka', 'j.bergstrom', 's.almeida'] as const;

const SERVICE_DIRS = [
  'services/payments',
  'services/orders',
  'services/identity',
  'services/ledger',
  'packages/core',
] as const;

/** Baseline context; each generator overrides only what it needs. */
function base(kind: StageKind, name: string, log: string): FailureContext {
  const branch = pick(BRANCHES);
  return {
    stage: {
      key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      kind,
      exitCode: 1,
      durationMs: Math.round(between(20_000, 180_000)),
      attempts: 1,
      log,
      baselineDurationMs: Math.round(between(30_000, 120_000)),
    },
    run: {
      branch,
      defaultBranch: 'main',
      trigger: 'push',
      commitSha: sha(),
      commitAuthor: pick(AUTHORS),
      commitMessage: 'wip',
      filesChanged: [`${pick(SERVICE_DIRS)}/src/handler.ts`],
    },
    history: {},
  };
}

function flakyTest(over: Partial<FailingTest> = {}): FailingTest {
  const dir = pick(SERVICE_DIRS);
  const name = pick([
    'checkout applies promo before tax',
    'session refresh survives clock skew',
    'webhook retries with backoff',
    'ledger reconciles partial refunds',
    'search returns ranked results',
  ]);
  const runCount = intBetween(40, 400);
  return {
    name,
    file: `${dir}/src/${name.split(' ')[0]}.test.ts`,
    suite: dir.split('/').pop(),
    flakeRate: between(0.06, 0.24),
    distinctBranches: intBetween(4, 14),
    runCount,
    firstFailure: false,
    ...over,
  };
}

function freshTest(over: Partial<FailingTest> = {}): FailingTest {
  const dir = pick(SERVICE_DIRS);
  return {
    name: pick([
      'applies the configured discount ceiling',
      'rejects expired authorisation holds',
      'emits one audit row per settlement',
      'returns 404 for soft-deleted orders',
    ]),
    file: `${dir}/src/domain.test.ts`,
    suite: dir.split('/').pop(),
    flakeRate: 0,
    distinctBranches: 1,
    runCount: intBetween(60, 300),
    firstFailure: true,
    ...over,
  };
}

// ============================================================
// Log fragments
// ============================================================

const OOM_LOGS = [
  '##[error]The operation was canceled.\nProcess completed with exit code 137.\nRunner: OOMKilled after 4.2GiB of 4GiB',
  'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n 1: 0x10a8f5 node::Abort()',
  'vitest worker terminated: Cannot allocate memory\nsh: line 1: 4821 Killed  node --max-old-space-size=2048',
] as const;

const DISK_LOGS = [
  'Error: ENOSPC: no space left on device, write\n  at Object.writeSync (node:fs:936:3)',
  'failed to register layer: write /var/lib/docker/overlay2: no space left on device',
] as const;

const AUTH_LOGS = [
  'Error response from daemon: unauthorized: authentication required\nfailed to push ghcr.io/acme/payments:sha-8f21c: denied',
  'npm ERR! code E401\nnpm ERR! 401 Unauthorized - GET https://registry.npmjs.org/@acme%2fcore',
  'An error occurred (ExpiredToken) when calling the AssumeRole operation: The security token included in the request is expired',
  'error: failed to authorize: unauthorized: bad credentials for registry ecr.us-east-1.amazonaws.com',
] as const;

const DEP_LOGS = [
  'npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE unable to resolve dependency tree\nnpm ERR! Found: react@18.3.1',
  "error TS2305: Module '\"@acme/core\"' has no exported member 'createLedgerClient'.",
  'npm ERR! 404 Not Found - GET https://registry.npmjs.org/@acme%2ftelemetry - Not found',
  "Module not found: Error: Can't resolve 'node-fetch' in '/home/runner/work/acme/services/orders/src'",
] as const;

const MIGRATION_LOGS = [
  'error: duplicate column name: settled_at\nmigration 0042_add_settlement_columns failed, rolling back',
  'ERROR: relation "order_events" already exists\nSQLSTATE[42P07]\nmigration aborted at step 3 of 7',
  'error: deadlock detected while applying migration 0038_reindex_ledger\nDETAIL: Process 4821 waits for ShareLock',
] as const;

const TIMEOUT_LOGS = [
  '##[error]The job running on runner ubuntu-latest has exceeded the maximum execution time of 30 minutes.',
  'Error: context deadline exceeded (Client.Timeout exceeded while awaiting headers)\nwaiting for integration fixture...',
  'FAIL src/integration/settlement.test.ts > settles in order\n  Test timed out in 120000ms',
] as const;

const CONFIG_LOGS = [
  'ConfigurationError: required environment variable LEDGER_WEBHOOK_SECRET is not set',
  'Error: Missing required environment variable STRIPE_WEBHOOK_TOLERANCE\n  at loadConfig (src/config.ts:41:11)',
  'Readiness probe failed: HTTP probe failed with statuscode: 503\ndeployment "payments" exceeded its progress deadline\n0/6 replicas are available',
] as const;

const REGRESSION_LOGS = [
  "error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
  'FAIL services/payments/src/domain.test.ts\n  ✕ applies the configured discount ceiling (14 ms)\n\n  AssertionError: expected 1200 to equal 900\n\nTests: 1 failed, 418 passed',
  'TypeError: Cannot read properties of undefined (reading \x27settlementId\x27)\n    at settle (services/ledger/src/settle.ts:88:24)',
] as const;

const FLAKE_LOGS = [
  'FAIL services/orders/src/webhook.test.ts\n  ✕ webhook retries with backoff (5031 ms)\n\n  AssertionError: expected 3 to equal 2\n\nTests: 1 failed, 402 passed',
  'FAIL packages/core/src/session.test.ts\n  ✕ session refresh survives clock skew (2140 ms)\n\n  AssertionError: expected true to be false\n\nTests: 1 failed, 511 passed',
] as const;

const REGIONS = ['us-east-1', 'eu-west-1', 'ap-southeast-2'] as const;

// ============================================================
// Generators — one per ground-truth category
// ============================================================

type Generator = () => FailureContext;

const GENERATORS: { category: DiagnosisCategory; action: RecommendedAction; make: Generator }[] = [
  // ---- Flaky tests ------------------------------------------
  {
    category: 'flaky-test',
    action: 'quarantine-test',
    make: () => {
      const c = base('test', 'Unit tests', pick(FLAKE_LOGS));
      const tests = [flakyTest({ flakeRate: between(0.11, 0.26) })];
      c.history = {
        failingTests: tests,
        sameFailureOtherBranches: intBetween(2, 5),
        previousRunOnBranchPassed: false,
        similarRunIds: [],
      };
      return c;
    },
  },
  {
    category: 'flaky-test',
    action: 'retry',
    make: () => {
      // Low flake rate: real noise, but not yet worth quarantining.
      const c = base('test', 'Integration tests', pick(FLAKE_LOGS));
      c.history = {
        failingTests: [flakyTest({ flakeRate: between(0.05, 0.095), distinctBranches: intBetween(4, 9) })],
        sameFailureOtherBranches: intBetween(2, 4),
      };
      return c;
    },
  },

  // ---- Code regressions -------------------------------------
  {
    category: 'code-regression',
    action: 'fix-forward',
    make: () => {
      const c = base('test', 'Unit tests', pick(REGRESSION_LOGS));
      const dir = pick(SERVICE_DIRS);
      c.run.filesChanged = [`${dir}/src/domain.ts`, `${dir}/src/handler.ts`];
      c.history = {
        failingTests: [freshTest({ file: `${dir}/src/domain.test.ts` })],
        previousRunOnBranchPassed: true,
        sameFailureOtherBranches: 0,
      };
      return c;
    },
  },
  {
    category: 'code-regression',
    action: 'revert',
    make: () => {
      // On main, so the correct move is a revert rather than a fix.
      const c = base('build', 'Typecheck', REGRESSION_LOGS[0]);
      c.run.branch = 'main';
      const dir = pick(SERVICE_DIRS);
      c.run.filesChanged = [`${dir}/src/domain.ts`];
      c.history = { previousRunOnBranchPassed: true, failingTests: [] };
      return c;
    },
  },
  {
    category: 'code-regression',
    action: 'fix-forward',
    make: () => {
      // Adversarial: a retry reproduced it, so despite some flake
      // history the failure is deterministic.
      const c = base('test', 'Unit tests', pick(REGRESSION_LOGS));
      c.stage.attempts = 3;
      const dir = pick(SERVICE_DIRS);
      c.run.filesChanged = [`${dir}/src/domain.ts`];
      c.history = {
        failingTests: [freshTest({ file: `${dir}/src/domain.test.ts` })],
        previousRunOnBranchPassed: true,
      };
      return c;
    },
  },

  // ---- Infra capacity ---------------------------------------
  {
    category: 'infra-capacity',
    action: 'scale-runner',
    make: () => {
      const c = base('test', 'Integration tests', pick(OOM_LOGS));
      c.history = { runnerMemoryPct: between(94, 100), failingTests: [] };
      return c;
    },
  },
  {
    category: 'infra-capacity',
    action: 'scale-runner',
    make: () => {
      const c = base('package', 'Build container image', pick(DISK_LOGS));
      c.history = { runnerDiskPct: between(95, 100) };
      return c;
    },
  },

  // ---- Dependency drift -------------------------------------
  {
    category: 'dependency-drift',
    action: 'pin-dependency',
    make: () => {
      const c = base('build', 'Install dependencies', pick(DEP_LOGS));
      c.run.filesChanged = ['package.json', 'pnpm-lock.yaml'];
      c.run.branch = 'chore/bump-deps';
      c.history = { lockfileChanged: true };
      return c;
    },
  },
  {
    category: 'dependency-drift',
    action: 'pin-dependency',
    make: () => {
      // No lockfile in the diff: a floating range moved upstream.
      const c = base('build', 'Compile', DEP_LOGS[1]);
      c.history = { lockfileChanged: false, sameFailureOtherBranches: intBetween(2, 4) };
      return c;
    },
  },

  // ---- Secret expiry ----------------------------------------
  {
    category: 'secret-expiry',
    action: 'rotate-secret',
    make: () => {
      const c = base('package', 'Push image', pick(AUTH_LOGS));
      // No source changes at all — nothing about the code moved.
      c.run.filesChanged = ['README.md'];
      c.history = {};
      return c;
    },
  },
  {
    category: 'secret-expiry',
    action: 'rotate-secret',
    make: () => {
      const c = base('deploy', 'Deploy to production', AUTH_LOGS[2]);
      c.stage.environment = 'production';
      c.stage.region = pick(REGIONS);
      c.run.filesChanged = [];
      c.history = {
        // Every region failed, which rules out per-target config.
        siblingRegionResults: REGIONS.map((r) => ({ region: r, status: 'failed' })),
      };
      return c;
    },
  },

  // ---- Config drift -----------------------------------------
  {
    category: 'config-drift',
    action: 'fix-forward',
    make: () => {
      const failing = pick(REGIONS);
      const c = base('deploy', 'Deploy to production', pick(CONFIG_LOGS));
      c.stage.kind = 'deploy';
      c.stage.environment = 'production';
      c.stage.region = failing;
      c.run.filesChanged = [];
      c.history = {
        siblingRegionResults: REGIONS.map((r) => ({
          region: r,
          status: r === failing ? 'failed' : 'success',
        })),
        configDrift: [{ key: 'LEDGER_WEBHOOK_SECRET', expected: 'set', actual: 'absent' }],
      };
      return c;
    },
  },
  {
    category: 'config-drift',
    action: 'fix-forward',
    make: () => {
      // Region asymmetry with no explicit drift record.
      const failing = pick(REGIONS);
      const c = base('verify', 'Smoke test', CONFIG_LOGS[2]);
      c.stage.environment = 'staging';
      c.stage.region = failing;
      c.run.filesChanged = ['deploy/staging/values.yaml'];
      c.history = {
        siblingRegionResults: REGIONS.map((r) => ({
          region: r,
          status: r === failing ? 'failed' : 'success',
        })),
      };
      return c;
    },
  },

  // ---- Migration failure ------------------------------------
  {
    category: 'migration-failure',
    action: 'fix-forward',
    make: () => {
      const c = base('deploy', 'Apply migrations', pick(MIGRATION_LOGS));
      c.stage.environment = pick(['staging', 'production']);
      c.stage.region = pick(REGIONS);
      c.run.filesChanged = ['packages/db/migrations/0042_add_settlement_columns.sql'];
      c.history = {};
      return c;
    },
  },

  // ---- Timeout ----------------------------------------------
  {
    category: 'timeout',
    action: 'investigate',
    make: () => {
      const c = base('test', 'End-to-end tests', pick(TIMEOUT_LOGS));
      c.stage.baselineDurationMs = 240_000;
      c.stage.durationMs = Math.round(between(700_000, 1_100_000));
      c.history = { failingTests: [] };
      return c;
    },
  },
];

// ============================================================
// Corpus
// ============================================================

/**
 * Builds the labelled corpus. `perGenerator` controls how many
 * variants each generator emits; the PRNG makes each one different
 * while keeping the whole corpus reproducible.
 */
export function buildBenchmarkCorpus(perGenerator = 10, perHardCase = 10): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  for (const [gIndex, gen] of GENERATORS.entries()) {
    for (let i = 0; i < perGenerator; i += 1) {
      const context = gen.make();
      cases.push({
        id: `case-${String(gIndex).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        label: `${gen.category} · ${context.stage.name} · ${context.run.branch}`,
        expectedCategory: gen.category,
        expectedAction: gen.action,
        context,
      });
    }
  }

  // Adversarial block. Tagged in the label so the benchmark page can
  // report easy and hard accuracy separately -- an aggregate number
  // that hides which half it came from is not worth much.
  for (const [hIndex, gen] of HARD.entries()) {
    for (let i = 0; i < perHardCase; i += 1) {
      const context = gen.make();
      cases.push({
        id: `hard-${String(hIndex).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        label: `[hard] ${gen.category} · ${gen.note}`,
        expectedCategory: gen.category,
        expectedAction: gen.action,
        context,
      });
    }
  }

  return cases;
}

/** True for the deliberately ambiguous half of the corpus. */
export function isHardCase(c: BenchmarkCase): boolean {
  return c.id.startsWith('hard-');
}
/** Category distribution of the corpus, for the benchmark report. */
export function corpusShape(cases: BenchmarkCase[]): Record<string, number> {
  const shape: Record<string, number> = {};
  for (const c of cases) shape[c.expectedCategory] = (shape[c.expectedCategory] ?? 0) + 1;
  return shape;
}

// ============================================================
// Adversarial cases
// ============================================================
// The generators above each present one clean cause, which makes
// them easy and makes a score against them close to meaningless.
// Real pipeline logs are messier: a runner dies *and* assertions
// fail, a deploy 503s *and* something returns 401, a genuine
// regression lands in a file that also owns a flaky test.
//
// Each case below carries a decoy that argues for the wrong
// category. Ground truth is the *dominant* cause -- the thing an
// on-call engineer would actually act on -- and is annotated with
// why that is the right call.
// ============================================================

const HARD: { category: DiagnosisCategory; action: RecommendedAction; note: string; make: Generator }[] = [
  {
    category: 'code-regression',
    action: 'fix-forward',
    note: 'assertion failure is real; the timeout line belongs to an unrelated slow test',
    make: () => {
      const dir = pick(SERVICE_DIRS);
      const c = base(
        'test',
        'Unit tests',
        `${REGRESSION_LOGS[1]}\n\nFAIL src/integration/slow.test.ts\n  ✕ syncs nightly batch\n  Test timed out in 120000ms`,
      );
      c.run.filesChanged = [`${dir}/src/domain.ts`];
      c.history = {
        failingTests: [freshTest({ file: `${dir}/src/domain.test.ts` })],
        previousRunOnBranchPassed: true,
      };
      return c;
    },
  },
  {
    category: 'flaky-test',
    action: 'quarantine-test',
    note: 'the diff touches the same module, but the test has failed on 9 other branches for weeks',
    make: () => {
      const dir = pick(SERVICE_DIRS);
      const c = base('test', 'Integration tests', pick(FLAKE_LOGS));
      // Decoy: diff overlaps the failing test's module.
      c.run.filesChanged = [`${dir}/src/handler.ts`, `${dir}/src/util.ts`];
      c.history = {
        failingTests: [
          flakyTest({
            file: `${dir}/src/handler.test.ts`,
            flakeRate: between(0.15, 0.3),
            distinctBranches: intBetween(7, 13),
            runCount: intBetween(180, 400),
          }),
        ],
        sameFailureOtherBranches: intBetween(3, 6),
        previousRunOnBranchPassed: true,
      };
      return c;
    },
  },
  {
    category: 'infra-capacity',
    action: 'scale-runner',
    note: 'the runner was OOM-killed mid-suite; the failing assertions are collateral, not causal',
    make: () => {
      const c = base('test', 'Integration tests', `${pick(FLAKE_LOGS)}\n\n${OOM_LOGS[0]}`);
      c.history = {
        runnerMemoryPct: between(96, 100),
        failingTests: [freshTest()],
        previousRunOnBranchPassed: true,
      };
      return c;
    },
  },
  {
    category: 'config-drift',
    action: 'fix-forward',
    note: 'one region 503s while peers are green; the 401 is a downstream call failing for want of config',
    make: () => {
      const failing = pick(REGIONS);
      const c = base(
        'verify',
        'Post-deploy smoke test',
        `${CONFIG_LOGS[2]}\n\nGET /internal/ledger -> 401 unauthorized (token missing from vault mount)`,
      );
      c.stage.environment = 'production';
      c.stage.region = failing;
      c.run.filesChanged = [];
      c.history = {
        siblingRegionResults: REGIONS.map((r) => ({
          region: r,
          status: r === failing ? 'failed' : 'success',
        })),
        configDrift: [{ key: 'VAULT_MOUNT_PATH', expected: 'kv/prod', actual: 'kv/staging' }],
      };
      return c;
    },
  },
  {
    category: 'migration-failure',
    action: 'fix-forward',
    note: 'migration aborted; the npm deprecation warning in the same log is noise',
    make: () => {
      const c = base(
        'deploy',
        'Apply migrations',
        `npm WARN deprecated querystring@0.2.0: Use the built-in URLSearchParams\n\n${pick(MIGRATION_LOGS)}`,
      );
      c.stage.environment = 'production';
      c.stage.region = pick(REGIONS);
      c.run.filesChanged = ['packages/db/migrations/0051_split_ledger_rows.sql'];
      c.history = { lockfileChanged: false };
      return c;
    },
  },
  {
    category: 'code-regression',
    action: 'fix-forward',
    note: 'test has flake history, but three retries reproduced it deterministically',
    make: () => {
      const dir = pick(SERVICE_DIRS);
      const c = base('test', 'Unit tests', pick(FLAKE_LOGS));
      c.stage.attempts = 3;
      c.run.filesChanged = [`${dir}/src/handler.ts`];
      c.history = {
        failingTests: [
          flakyTest({ file: `${dir}/src/handler.test.ts`, flakeRate: 0.12, distinctBranches: 5 }),
        ],
        previousRunOnBranchPassed: true,
        sameFailureOtherBranches: 0,
      };
      return c;
    },
  },
  {
    category: 'config-drift',
    action: 'fix-forward',
    note: 'ERESOLVE in one region only: that runner points at a stale registry mirror, so the fix is on the target not the manifest',
    make: () => {
      const failing = pick(REGIONS);
      const c = base('build', 'Install dependencies', DEP_LOGS[0]);
      c.stage.environment = 'ci';
      c.stage.region = failing;
      c.run.filesChanged = [];
      c.history = {
        lockfileChanged: false,
        siblingRegionResults: REGIONS.map((r) => ({
          region: r,
          status: r === failing ? 'failed' : 'success',
        })),
      };
      return c;
    },
  },
  {
    category: 'secret-expiry',
    action: 'rotate-secret',
    note: 'registry 401 isolated to one region because only that region’s credential lapsed',
    make: () => {
      const failing = pick(REGIONS);
      const c = base('package', 'Push image', AUTH_LOGS[3]);
      c.stage.region = failing;
      c.run.filesChanged = [];
      c.history = {
        siblingRegionResults: REGIONS.map((r) => ({
          region: r,
          status: r === failing ? 'failed' : 'success',
        })),
      };
      return c;
    },
  },
  {
    category: 'unknown',
    action: 'investigate',
    note: 'no usable evidence at all; the engine must decline rather than guess',
    make: () => {
      const c = base('build', 'Build', '##[error]Process completed with exit code 1.');
      c.stage.baselineDurationMs = null;
      c.run.filesChanged = [];
      c.history = {};
      return c;
    },
  },
];
