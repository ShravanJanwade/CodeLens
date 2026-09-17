// ============================================================
// CodeLens — Demo workspace seed
// ============================================================
// Builds the repository, dependency graph, environments and
// pipeline history that the no-login demo renders.
//
// Two rules govern everything in this file:
//
//  1. The data is *shaped* like a real monorepo, not filled with
//     lorem ipsum. The import graph has genuine hubs and leaves so
//     blast radius produces a meaningful answer, and the pipeline
//     history has a real success rate so the health numbers are not
//     decorative.
//
//  2. Diagnoses are not authored here. Every failed run builds a
//     FailureContext and calls the actual classifier, so what the
//     demo shows is what the engine produced. If the engine changes,
//     the demo changes with it.
// ============================================================

import { getDb } from './index';
import * as core from './schema';
import * as pipe from './pipeline-schema';
import { diagnose, type FailureContext, type FailingTest } from '@codelens/shared';
import { eq } from 'drizzle-orm';

export const DEMO_REPO_ID = 'demo-commerce-platform';
const DEMO_OWNER = 'northwind';
const DEMO_NAME = 'commerce-platform';
const DEFAULT_BRANCH = 'main';

/** Anchored so relative timestamps stay stable within one seed run. */
const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Deterministic PRNG: the demo looks identical on every deploy. */
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
const rand = rng(0xc0de1e45);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

function sha(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 40; i += 1) s += hex[Math.floor(rand() * 16)];
  return s;
}

const AUTHORS = [
  'dana.kowalski',
  'r.okafor',
  'mei.tanaka',
  'j.bergstrom',
  's.almeida',
  'priya.nair',
] as const;

// ============================================================
// Module graph
// ============================================================
// Declared explicitly rather than generated randomly: the shape is
// the point. packages/core/* are leaves with high fan-in, the
// service entrypoints are sinks, and orders -> payments -> ledger
// is a real cross-service chain that blast radius has to walk.

interface Module {
  path: string;
  service?: string;
  imports: string[];
  endpoints?: string[];
  complexity: number;
}

const CORE: Module[] = [
  { path: 'packages/core/src/result.ts', imports: [], complexity: 4 },
  { path: 'packages/core/src/logger.ts', imports: ['packages/core/src/config.ts'], complexity: 6 },
  { path: 'packages/core/src/config.ts', imports: ['packages/core/src/result.ts'], complexity: 9 },
  { path: 'packages/core/src/money.ts', imports: ['packages/core/src/result.ts'], complexity: 12 },
  { path: 'packages/core/src/clock.ts', imports: [], complexity: 3 },
  { path: 'packages/core/src/id.ts', imports: [], complexity: 2 },
  {
    path: 'packages/core/src/retry.ts',
    imports: ['packages/core/src/clock.ts', 'packages/core/src/logger.ts'],
    complexity: 14,
  },
  {
    path: 'packages/http/src/client.ts',
    imports: ['packages/core/src/retry.ts', 'packages/core/src/logger.ts', 'packages/core/src/result.ts'],
    complexity: 18,
  },
  {
    path: 'packages/http/src/server.ts',
    imports: ['packages/core/src/logger.ts', 'packages/core/src/config.ts'],
    complexity: 21,
  },
  {
    path: 'packages/http/src/middleware.ts',
    imports: ['packages/http/src/server.ts', 'packages/core/src/logger.ts'],
    complexity: 11,
  },
  {
    path: 'packages/db-client/src/index.ts',
    imports: ['packages/core/src/config.ts', 'packages/core/src/logger.ts', 'packages/core/src/result.ts'],
    complexity: 24,
  },
];

const SERVICES: Module[] = [
  // ---- identity ----
  {
    path: 'services/identity/src/token.ts',
    service: 'identity',
    imports: ['packages/core/src/clock.ts', 'packages/core/src/config.ts', 'packages/core/src/result.ts'],
    complexity: 22,
  },
  {
    path: 'services/identity/src/session.ts',
    service: 'identity',
    imports: [
      'services/identity/src/token.ts',
      'packages/db-client/src/index.ts',
      'packages/core/src/clock.ts',
    ],
    complexity: 26,
  },
  {
    path: 'services/identity/src/repo.ts',
    service: 'identity',
    imports: ['packages/db-client/src/index.ts', 'packages/core/src/id.ts'],
    complexity: 15,
  },
  {
    path: 'services/identity/src/routes.ts',
    service: 'identity',
    imports: [
      'services/identity/src/session.ts',
      'services/identity/src/repo.ts',
      'packages/http/src/server.ts',
    ],
    endpoints: ['POST /auth/login', 'POST /auth/refresh', 'DELETE /auth/session'],
    complexity: 19,
  },
  {
    path: 'services/identity/src/index.ts',
    service: 'identity',
    imports: ['services/identity/src/routes.ts', 'packages/http/src/middleware.ts'],
    complexity: 7,
  },

  // ---- payments ----
  {
    path: 'services/payments/src/provider.ts',
    service: 'payments',
    imports: ['packages/http/src/client.ts', 'packages/core/src/money.ts', 'packages/core/src/retry.ts'],
    complexity: 31,
  },
  {
    path: 'services/payments/src/domain.ts',
    service: 'payments',
    imports: ['packages/core/src/money.ts', 'packages/core/src/result.ts', 'packages/core/src/clock.ts'],
    complexity: 38,
  },
  {
    path: 'services/payments/src/authorize.ts',
    service: 'payments',
    imports: [
      'services/payments/src/domain.ts',
      'services/payments/src/provider.ts',
      'services/payments/src/repo.ts',
    ],
    complexity: 29,
  },
  {
    path: 'services/payments/src/capture.ts',
    service: 'payments',
    imports: [
      'services/payments/src/domain.ts',
      'services/payments/src/provider.ts',
      'services/ledger/src/post.ts',
    ],
    complexity: 27,
  },
  {
    path: 'services/payments/src/refund.ts',
    service: 'payments',
    imports: [
      'services/payments/src/domain.ts',
      'services/payments/src/provider.ts',
      'services/ledger/src/post.ts',
    ],
    complexity: 25,
  },
  {
    path: 'services/payments/src/repo.ts',
    service: 'payments',
    imports: ['packages/db-client/src/index.ts', 'packages/core/src/id.ts', 'packages/core/src/money.ts'],
    complexity: 20,
  },
  {
    path: 'services/payments/src/routes.ts',
    service: 'payments',
    imports: [
      'services/payments/src/authorize.ts',
      'services/payments/src/capture.ts',
      'services/payments/src/refund.ts',
      'packages/http/src/server.ts',
    ],
    endpoints: ['POST /payments/authorize', 'POST /payments/capture', 'POST /payments/refund'],
    complexity: 23,
  },
  {
    path: 'services/payments/src/index.ts',
    service: 'payments',
    imports: ['services/payments/src/routes.ts', 'packages/http/src/middleware.ts'],
    complexity: 8,
  },

  // ---- orders ----
  {
    path: 'services/orders/src/promo.ts',
    service: 'orders',
    imports: ['packages/core/src/money.ts', 'packages/core/src/clock.ts', 'packages/core/src/result.ts'],
    complexity: 34,
  },
  {
    path: 'services/orders/src/cart.ts',
    service: 'orders',
    imports: ['services/orders/src/promo.ts', 'packages/core/src/money.ts', 'services/orders/src/repo.ts'],
    complexity: 28,
  },
  {
    path: 'services/orders/src/domain.ts',
    service: 'orders',
    imports: ['packages/core/src/money.ts', 'packages/core/src/result.ts'],
    complexity: 30,
  },
  {
    path: 'services/orders/src/checkout.ts',
    service: 'orders',
    imports: [
      'services/orders/src/cart.ts',
      'services/orders/src/domain.ts',
      'services/payments/src/authorize.ts',
      'services/identity/src/session.ts',
    ],
    complexity: 41,
  },
  {
    path: 'services/orders/src/repo.ts',
    service: 'orders',
    imports: ['packages/db-client/src/index.ts', 'packages/core/src/id.ts'],
    complexity: 17,
  },
  {
    path: 'services/orders/src/routes.ts',
    service: 'orders',
    imports: [
      'services/orders/src/checkout.ts',
      'services/orders/src/cart.ts',
      'packages/http/src/server.ts',
    ],
    endpoints: ['POST /orders/checkout', 'GET /orders/:id', 'POST /cart/items'],
    complexity: 22,
  },
  {
    path: 'services/orders/src/index.ts',
    service: 'orders',
    imports: ['services/orders/src/routes.ts', 'packages/http/src/middleware.ts'],
    complexity: 7,
  },

  // ---- ledger ----
  {
    path: 'services/ledger/src/post.ts',
    service: 'ledger',
    imports: ['packages/core/src/money.ts', 'packages/db-client/src/index.ts', 'packages/core/src/id.ts'],
    complexity: 33,
  },
  {
    path: 'services/ledger/src/settle.ts',
    service: 'ledger',
    imports: ['services/ledger/src/post.ts', 'packages/core/src/money.ts', 'packages/core/src/clock.ts'],
    complexity: 36,
  },
  {
    path: 'services/ledger/src/reconcile.ts',
    service: 'ledger',
    imports: ['services/ledger/src/settle.ts', 'services/ledger/src/repo.ts', 'packages/core/src/money.ts'],
    complexity: 44,
  },
  {
    path: 'services/ledger/src/repo.ts',
    service: 'ledger',
    imports: ['packages/db-client/src/index.ts', 'packages/core/src/money.ts'],
    complexity: 19,
  },
  {
    path: 'services/ledger/src/routes.ts',
    service: 'ledger',
    imports: [
      'services/ledger/src/reconcile.ts',
      'services/ledger/src/settle.ts',
      'packages/http/src/server.ts',
    ],
    endpoints: ['GET /ledger/entries', 'POST /ledger/settle', 'POST /ledger/reconcile'],
    complexity: 18,
  },
  {
    path: 'services/ledger/src/index.ts',
    service: 'ledger',
    imports: ['services/ledger/src/routes.ts', 'packages/http/src/middleware.ts'],
    complexity: 7,
  },

  // ---- gateway (fronts everything) ----
  {
    path: 'services/gateway/src/auth-guard.ts',
    service: 'gateway',
    imports: ['services/identity/src/token.ts', 'packages/http/src/middleware.ts'],
    complexity: 16,
  },
  {
    path: 'services/gateway/src/rate-limit.ts',
    service: 'gateway',
    imports: ['packages/core/src/clock.ts', 'packages/core/src/config.ts'],
    complexity: 21,
  },
  {
    path: 'services/gateway/src/router.ts',
    service: 'gateway',
    imports: [
      'services/gateway/src/auth-guard.ts',
      'services/gateway/src/rate-limit.ts',
      'services/orders/src/routes.ts',
      'services/payments/src/routes.ts',
      'services/ledger/src/routes.ts',
      'services/identity/src/routes.ts',
    ],
    endpoints: ['ALL /api/*'],
    complexity: 26,
  },
  {
    path: 'services/gateway/src/index.ts',
    service: 'gateway',
    imports: ['services/gateway/src/router.ts', 'packages/http/src/server.ts'],
    complexity: 9,
  },
];

/** Tests mirror the module they cover, which is how the coverage
 *  gap in blast radius gets computed. */
const TESTED = [
  'packages/core/src/money.ts',
  'packages/core/src/retry.ts',
  'packages/http/src/client.ts',
  'services/identity/src/session.ts',
  'services/identity/src/token.ts',
  'services/payments/src/domain.ts',
  'services/payments/src/authorize.ts',
  'services/payments/src/refund.ts',
  'services/orders/src/promo.ts',
  'services/orders/src/cart.ts',
  'services/orders/src/checkout.ts',
  'services/ledger/src/settle.ts',
  'services/ledger/src/reconcile.ts',
  'services/gateway/src/rate-limit.ts',
];

const CONFIG_FILES = [
  'deploy/base/values.yaml',
  'deploy/staging/values.yaml',
  'deploy/production/us-east-1.yaml',
  'deploy/production/eu-west-1.yaml',
  'deploy/production/ap-southeast-2.yaml',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  'package.json',
  'pnpm-lock.yaml',
];

const MIGRATIONS = [
  'packages/db-client/migrations/0048_add_promo_stacking.sql',
  'packages/db-client/migrations/0049_settlement_index.sql',
  'packages/db-client/migrations/0051_split_ledger_rows.sql',
];

/** Flattens the declared modules into file + edge rows. */
function buildGraph() {
  const modules = [...CORE, ...SERVICES];
  const files: {
    path: string;
    language: string;
    role: string;
    service?: string;
    endpoints: string[];
    complexity: number;
    imports: string[];
  }[] = [];

  for (const m of modules) {
    files.push({
      path: m.path,
      language: 'typescript',
      role: /\/index\.ts$/.test(m.path) ? 'entrypoint' : 'source',
      service: m.service,
      endpoints: m.endpoints ?? [],
      complexity: m.complexity,
      imports: m.imports,
    });
  }

  for (const target of TESTED) {
    const m = modules.find((x) => x.path === target)!;
    files.push({
      path: target.replace(/\.ts$/, '.test.ts'),
      language: 'typescript',
      role: 'test',
      service: m.service,
      endpoints: [],
      complexity: Math.round(m.complexity * 0.4),
      // A test imports the module it covers, so impact reaches it.
      imports: [target],
    });
  }

  for (const path of CONFIG_FILES) {
    files.push({
      path,
      language: path.endsWith('.json') ? 'json' : 'yaml',
      role: 'config',
      endpoints: [],
      complexity: 1,
      imports: [],
    });
  }

  for (const path of MIGRATIONS) {
    files.push({ path, language: 'sql', role: 'migration', endpoints: [], complexity: 3, imports: [] });
  }

  const edges = files.flatMap((f) => f.imports.map((target) => ({ source: f.path, target, kind: 'import' })));

  return { files, edges };
}

// ============================================================
// Environments
// ============================================================
// Production is three rows, one per region. That is what makes
// "which region is broken?" answerable at all.

const ENVIRONMENTS = [
  {
    key: 'dev',
    name: 'development',
    tier: 'development' as const,
    region: 'us-east-1',
    regionLabel: 'N. Virginia',
    cluster: 'nw-dev-use1',
    url: 'https://dev.commerce.northwind.internal',
    requiresApproval: false,
    replicas: 2,
  },
  {
    key: 'staging',
    name: 'staging',
    tier: 'staging' as const,
    region: 'us-east-1',
    regionLabel: 'N. Virginia',
    cluster: 'nw-stg-use1',
    url: 'https://staging.commerce.northwind.com',
    requiresApproval: false,
    replicas: 4,
  },
  {
    key: 'prod-use1',
    name: 'production',
    tier: 'production' as const,
    region: 'us-east-1',
    regionLabel: 'N. Virginia',
    cluster: 'nw-prod-use1',
    url: 'https://commerce.northwind.com',
    requiresApproval: true,
    replicas: 12,
  },
  {
    key: 'prod-euw1',
    name: 'production',
    tier: 'production' as const,
    region: 'eu-west-1',
    regionLabel: 'Ireland',
    cluster: 'nw-prod-euw1',
    url: 'https://eu.commerce.northwind.com',
    requiresApproval: true,
    replicas: 8,
  },
  {
    key: 'prod-apse2',
    name: 'production',
    tier: 'production' as const,
    region: 'ap-southeast-2',
    regionLabel: 'Sydney',
    cluster: 'nw-prod-apse2',
    url: 'https://au.commerce.northwind.com',
    requiresApproval: true,
    replicas: 6,
  },
];

// ============================================================
// Stage topology
// ============================================================

type StageStatus =
  'pending' | 'queued' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled' | 'blocked';

interface StageSpec {
  key: string;
  name: string;
  kind: 'checkout' | 'build' | 'test' | 'scan' | 'package' | 'approval' | 'deploy' | 'verify' | 'rollback';
  lane: number;
  sequence: number;
  dependsOn: string[];
  envKey?: string;
  /** Typical duration in ms, jittered per run. */
  typical: number;
  runner?: string;
}

/** The DAG. Lanes are the vertical tracks the flow view draws. */
function topology(tier: 'none' | 'staging' | 'production'): StageSpec[] {
  const stages: StageSpec[] = [
    {
      key: 'checkout',
      name: 'Checkout',
      kind: 'checkout',
      lane: 0,
      sequence: 0,
      dependsOn: [],
      typical: 9_000,
      runner: 'ubuntu-22.04 · 2-core',
    },
    {
      key: 'build',
      name: 'Build',
      kind: 'build',
      lane: 0,
      sequence: 1,
      dependsOn: ['checkout'],
      typical: 96_000,
      runner: 'ubuntu-22.04 · 8-core',
    },
    {
      key: 'unit-tests',
      name: 'Unit tests',
      kind: 'test',
      lane: 0,
      sequence: 2,
      dependsOn: ['build'],
      typical: 142_000,
      runner: 'ubuntu-22.04 · 8-core',
    },
    {
      key: 'lint',
      name: 'Lint & typecheck',
      kind: 'scan',
      lane: 1,
      sequence: 2,
      dependsOn: ['build'],
      typical: 51_000,
      runner: 'ubuntu-22.04 · 4-core',
    },
    {
      key: 'security-scan',
      name: 'Dependency audit',
      kind: 'scan',
      lane: 2,
      sequence: 2,
      dependsOn: ['build'],
      typical: 38_000,
      runner: 'ubuntu-22.04 · 2-core',
    },
    {
      key: 'integration-tests',
      name: 'Integration tests',
      kind: 'test',
      lane: 0,
      sequence: 3,
      dependsOn: ['unit-tests'],
      typical: 268_000,
      runner: 'ubuntu-22.04 · 16-core',
    },
    {
      key: 'package',
      name: 'Build & push image',
      kind: 'package',
      lane: 0,
      sequence: 4,
      dependsOn: ['integration-tests', 'lint', 'security-scan'],
      typical: 118_000,
      runner: 'ubuntu-22.04 · 8-core',
    },
  ];

  if (tier === 'none') return stages;

  if (tier === 'staging') {
    stages.push(
      {
        key: 'deploy-staging',
        name: 'Deploy staging',
        kind: 'deploy',
        lane: 0,
        sequence: 5,
        dependsOn: ['package'],
        envKey: 'staging',
        typical: 74_000,
        runner: 'deploy-runner',
      },
      {
        key: 'verify-staging',
        name: 'Smoke test staging',
        kind: 'verify',
        lane: 0,
        sequence: 6,
        dependsOn: ['deploy-staging'],
        envKey: 'staging',
        typical: 43_000,
        runner: 'deploy-runner',
      },
    );
    return stages;
  }

  stages.push(
    {
      key: 'deploy-staging',
      name: 'Deploy staging',
      kind: 'deploy',
      lane: 0,
      sequence: 5,
      dependsOn: ['package'],
      envKey: 'staging',
      typical: 74_000,
      runner: 'deploy-runner',
    },
    {
      key: 'approval',
      name: 'Production approval',
      kind: 'approval',
      lane: 0,
      sequence: 6,
      dependsOn: ['deploy-staging'],
      typical: 0,
    },
    {
      key: 'deploy-use1',
      name: 'Deploy us-east-1',
      kind: 'deploy',
      lane: 0,
      sequence: 7,
      dependsOn: ['approval'],
      envKey: 'prod-use1',
      typical: 121_000,
      runner: 'deploy-runner',
    },
    {
      key: 'deploy-euw1',
      name: 'Deploy eu-west-1',
      kind: 'deploy',
      lane: 1,
      sequence: 7,
      dependsOn: ['approval'],
      envKey: 'prod-euw1',
      typical: 108_000,
      runner: 'deploy-runner',
    },
    {
      key: 'deploy-apse2',
      name: 'Deploy ap-southeast-2',
      kind: 'deploy',
      lane: 2,
      sequence: 7,
      dependsOn: ['approval'],
      envKey: 'prod-apse2',
      typical: 114_000,
      runner: 'deploy-runner',
    },
    {
      key: 'verify-prod',
      name: 'Post-deploy verification',
      kind: 'verify',
      lane: 0,
      sequence: 8,
      dependsOn: ['deploy-use1', 'deploy-euw1', 'deploy-apse2'],
      typical: 67_000,
      runner: 'deploy-runner',
    },
  );
  return stages;
}

// ============================================================
// Logs
// ============================================================
// Written in the shape GitHub Actions emits, because the log pane
// is where an engineer actually looks and a fake-looking log makes
// everything above it look fake too.

const L = (lines: string[]) => lines.join('\n');

function successLog(
  spec: StageSpec,
  ctx: { sha: string; branch: string; env?: string; region?: string },
): string {
  const short = ctx.sha.slice(0, 7);
  switch (spec.kind) {
    case 'checkout':
      return L([
        '##[group]Run actions/checkout@v4',
        `Syncing repository: ${DEMO_OWNER}/${DEMO_NAME}`,
        `/usr/bin/git fetch --no-tags --prune --depth=1 origin +${ctx.sha}:refs/remotes/origin/${ctx.branch}`,
        `HEAD is now at ${short}`,
        '##[endgroup]',
      ]);
    case 'build':
      return L([
        '##[group]pnpm install --frozen-lockfile',
        'Lockfile is up to date, resolution step is skipped',
        'Packages: +1284',
        'Done in 21.4s',
        '##[endgroup]',
        '##[group]pnpm -r build',
        'packages/core       build: 1.9s',
        'packages/http       build: 2.4s',
        'packages/db-client  build: 3.1s',
        'services/identity   build: 4.2s',
        'services/payments   build: 5.8s',
        'services/orders     build: 5.1s',
        'services/ledger     build: 4.7s',
        'services/gateway    build: 3.3s',
        '##[endgroup]',
        'Build succeeded',
      ]);
    case 'test':
      return L([
        `##[group]vitest run --coverage --shard=${intBetween(1, 4)}/4`,
        ' ✓ packages/core/src/money.test.ts (34)',
        ' ✓ packages/core/src/retry.test.ts (18)',
        ' ✓ services/identity/src/session.test.ts (41)',
        ' ✓ services/payments/src/domain.test.ts (77)',
        ' ✓ services/orders/src/promo.test.ts (52)',
        ' ✓ services/ledger/src/settle.test.ts (63)',
        '',
        ` Test Files  ${intBetween(28, 34)} passed`,
        `      Tests  ${intBetween(410, 488)} passed`,
        `   Coverage  ${between(82, 89).toFixed(1)}% statements`,
        '##[endgroup]',
      ]);
    case 'scan':
      return L([
        '##[group]pnpm audit --audit-level=high',
        'No known vulnerabilities found',
        '##[endgroup]',
        '##[group]tsc --noEmit -b',
        'No errors found in 11 projects',
        '##[endgroup]',
      ]);
    case 'package':
      return L([
        '##[group]docker buildx build',
        ` => [internal] load build definition                         0.1s`,
        ` => [builder 4/6] RUN pnpm -r build                         48.2s`,
        ` => exporting layers                                        11.6s`,
        `#12 pushing ghcr.io/${DEMO_OWNER}/${DEMO_NAME}:sha-${short}`,
        `#12 pushed manifest sha256:${sha().slice(0, 32)}`,
        `Image size: ${between(118, 146).toFixed(0)}MB`,
        '##[endgroup]',
      ]);
    case 'approval':
      return L([
        'Environment production requires approval',
        `Approved by ${pick(AUTHORS)} after ${intBetween(3, 24)}m`,
        'Reviewers satisfied: 1 of 1',
      ]);
    case 'deploy':
      return L([
        `##[group]helm upgrade --install commerce ./deploy --namespace ${ctx.env}`,
        `Release "commerce" has been upgraded. Happy Helming!`,
        `NAMESPACE: ${ctx.env}   REVISION: ${intBetween(180, 260)}`,
        `Cluster: ${ctx.region}`,
        '##[endgroup]',
        '##[group]kubectl rollout status deploy/gateway deploy/orders deploy/payments deploy/ledger deploy/identity',
        'deployment "gateway" successfully rolled out',
        'deployment "orders" successfully rolled out',
        'deployment "payments" successfully rolled out',
        'deployment "ledger" successfully rolled out',
        'deployment "identity" successfully rolled out',
        '##[endgroup]',
        `Deployed sha-${short} to ${ctx.region}`,
      ]);
    case 'verify':
      return L([
        '##[group]Post-deploy verification',
        'GET  /healthz                        200   11ms',
        'POST /auth/login                     200   84ms',
        'POST /cart/items                     201   62ms',
        'POST /orders/checkout                201  238ms',
        'POST /payments/authorize             201  196ms',
        'GET  /ledger/entries                 200   47ms',
        '',
        `error rate ${between(0.01, 0.08).toFixed(2)}%  ·  p95 ${intBetween(180, 260)}ms  ·  all checks green`,
        '##[endgroup]',
      ]);
    default:
      return 'Stage completed';
  }
}

const SKIPPED_LOG = 'Stage skipped: an upstream stage did not succeed.';
const PENDING_LOG = 'Stage has not started.';

// ============================================================
// Scenarios
// ============================================================
// Each scripted run is a failure shape worth showing. The history
// block is what gets handed to the classifier, so these are the
// inputs the diagnosis is derived from -- not the diagnosis itself.

interface Scenario {
  runNumber: number;
  branch: string;
  tier: 'none' | 'staging' | 'production';
  trigger: 'push' | 'pull_request' | 'manual' | 'schedule' | 'revert' | 'rollback';
  startedAgo: number;
  status: 'success' | 'failed' | 'running' | 'cancelled';
  commitMessage: string;
  author: string;
  prNumber?: number;
  filesChanged: string[];
  /** Explicit per-stage status; everything else is inferred. */
  overrides?: Record<string, { status: StageStatus; log?: string; durationMs?: number; attempts?: number }>;
  /** Handed to diagnose() when the run failed. */
  history?: FailureContext['history'];
  /** Stage at which the run broke. */
  failedStage?: string;
  runningStage?: string;
}

const FLAKY_SESSION: FailingTest = {
  name: 'session refresh survives clock skew',
  file: 'services/identity/src/session.test.ts',
  suite: 'identity',
  flakeRate: 0.17,
  distinctBranches: 9,
  runCount: 312,
  firstFailure: false,
};

const REGRESSION_PROMO: FailingTest = {
  name: 'stacks at most one percentage promo',
  file: 'services/orders/src/promo.test.ts',
  suite: 'orders',
  flakeRate: 0,
  distinctBranches: 1,
  runCount: 288,
  firstFailure: true,
};

const SCENARIOS: Scenario[] = [
  // ---- Currently running, so the UI has a live run to animate ----
  {
    runNumber: 2185,
    branch: 'main',
    tier: 'production',
    trigger: 'push',
    startedAgo: 4 * MIN,
    status: 'running',
    commitMessage: 'fix(ledger): guard settlement against duplicate capture ids',
    author: 'mei.tanaka',
    filesChanged: ['services/ledger/src/settle.ts', 'services/ledger/src/settle.test.ts'],
    runningStage: 'integration-tests',
  },

  // ---- Hero scenario: one region broken, two green -------------
  {
    runNumber: 2184,
    branch: 'main',
    tier: 'production',
    trigger: 'push',
    startedAgo: 2 * HOUR + 12 * MIN,
    status: 'failed',
    commitMessage: 'feat(orders): enable promo stacking behind a flag',
    author: 'dana.kowalski',
    prNumber: 1841,
    filesChanged: [],
    failedStage: 'deploy-apse2',
    overrides: {
      'deploy-apse2': {
        status: 'failed',
        durationMs: 214_000,
        log: L([
          '##[group]helm upgrade --install commerce ./deploy --namespace production',
          'Release "commerce" has been upgraded. Happy Helming!',
          'NAMESPACE: production   REVISION: 241',
          'Cluster: ap-southeast-2',
          '##[endgroup]',
          '##[group]kubectl rollout status deploy/gateway deploy/orders deploy/payments deploy/ledger deploy/identity',
          'deployment "gateway" successfully rolled out',
          'deployment "identity" successfully rolled out',
          'Waiting for deployment "orders" rollout to finish: 2 of 6 updated replicas are available...',
          'Waiting for deployment "orders" rollout to finish: 2 of 6 updated replicas are available...',
          '##[error]Readiness probe failed: HTTP probe failed with statuscode: 503',
          '##[error]error: deployment "orders" exceeded its progress deadline',
          '0/6 replicas are available',
          '##[endgroup]',
          '##[group]kubectl logs deploy/orders --tail=20',
          'ConfigurationError: required environment variable LEDGER_WEBHOOK_SECRET is not set',
          '    at loadConfig (/app/packages/core/dist/config.js:41:11)',
          '    at bootstrap (/app/services/orders/dist/index.js:12:19)',
          '##[endgroup]',
          'Rolling back to sha-4c1e9ab',
        ]),
      },
      'verify-prod': { status: 'skipped' },
    },
    history: {
      siblingRegionResults: [
        { region: 'us-east-1', status: 'success' },
        { region: 'eu-west-1', status: 'success' },
        { region: 'ap-southeast-2', status: 'failed' },
      ],
      configDrift: [
        { key: 'LEDGER_WEBHOOK_SECRET', expected: 'present (sealed secret)', actual: 'absent' },
        { key: 'VAULT_MOUNT_PATH', expected: 'kv/prod/apse2', actual: 'kv/prod/use1' },
      ],
      similarRunIds: [],
    },
  },

  // ---- Exoneration: a flake blocking an innocent branch --------
  {
    runNumber: 2183,
    branch: 'feat/checkout-promo-stacking',
    tier: 'none',
    trigger: 'pull_request',
    startedAgo: 3 * HOUR + 41 * MIN,
    status: 'failed',
    commitMessage: 'test(orders): cover promo stacking ceiling',
    author: 'dana.kowalski',
    prNumber: 1841,
    filesChanged: ['services/orders/src/promo.test.ts'],
    failedStage: 'unit-tests',
    overrides: {
      'unit-tests': {
        status: 'failed',
        durationMs: 151_000,
        log: L([
          '##[group]vitest run --coverage',
          ' ✓ packages/core/src/money.test.ts (34)',
          ' ✓ services/orders/src/promo.test.ts (52)',
          ' ✓ services/payments/src/domain.test.ts (77)',
          ' ✕ services/identity/src/session.test.ts > session refresh survives clock skew (5031 ms)',
          '',
          '  AssertionError: expected 1758240041 to be 1758240040',
          '   ❯ services/identity/src/session.test.ts:118:24',
          '     116|   const refreshed = await refresh(session, clock);',
          '     117|   expect(refreshed.ok).toBe(true);',
          '     118|   expect(refreshed.value.expiresAt).toBe(clock.now() + TTL);',
          '',
          ' Test Files  1 failed | 31 passed',
          `      Tests  1 failed | 447 passed`,
          '##[endgroup]',
        ]),
      },
    },
    history: {
      failingTests: [FLAKY_SESSION],
      sameFailureOtherBranches: 4,
      previousRunOnBranchPassed: false,
    },
  },

  // ---- Genuine regression on main, later reverted --------------
  {
    runNumber: 2179,
    branch: 'main',
    tier: 'production',
    trigger: 'push',
    startedAgo: 1 * DAY + 5 * HOUR,
    status: 'failed',
    commitMessage: 'feat(orders): allow stacking percentage promos',
    author: 'dana.kowalski',
    filesChanged: [
      'services/orders/src/promo.ts',
      'services/orders/src/cart.ts',
      'packages/db-client/migrations/0048_add_promo_stacking.sql',
    ],
    failedStage: 'unit-tests',
    overrides: {
      'unit-tests': {
        status: 'failed',
        durationMs: 138_000,
        attempts: 2,
        log: L([
          '##[group]vitest run --coverage',
          ' ✕ services/orders/src/promo.test.ts > stacks at most one percentage promo (11 ms)',
          '',
          '  AssertionError: expected 1200 to equal 900',
          '   ❯ services/orders/src/promo.test.ts:64:31',
          '      62|   const cart = withItems([{ price: 3000 }]);',
          '      63|   const total = applyPromos(cart, [pct(10), pct(20)]);',
          '      64|   expect(total.amountMinor).toEqual(900);',
          '',
          '  → applyPromos now compounds both percentage promos instead of',
          '    selecting the single best one.',
          '',
          ' Test Files  1 failed | 31 passed',
          '      Tests  1 failed | 446 passed',
          '##[endgroup]',
        ]),
      },
    },
    history: {
      failingTests: [REGRESSION_PROMO],
      previousRunOnBranchPassed: true,
      sameFailureOtherBranches: 0,
    },
  },

  // ---- The revert that followed --------------------------------
  {
    runNumber: 2180,
    branch: 'main',
    tier: 'production',
    trigger: 'revert',
    startedAgo: 1 * DAY + 4 * HOUR,
    status: 'success',
    commitMessage: 'Revert "feat(orders): allow stacking percentage promos"',
    author: 'r.okafor',
    filesChanged: ['services/orders/src/promo.ts', 'services/orders/src/cart.ts'],
  },

  // ---- Runner OOM ---------------------------------------------
  {
    runNumber: 2176,
    branch: 'refactor/payments-core',
    tier: 'none',
    trigger: 'pull_request',
    startedAgo: 2 * DAY + 3 * HOUR,
    status: 'failed',
    commitMessage: 'refactor(payments): split provider adapter per processor',
    author: 'j.bergstrom',
    prNumber: 1836,
    filesChanged: ['services/payments/src/provider.ts', 'services/payments/src/authorize.ts'],
    failedStage: 'integration-tests',
    overrides: {
      'integration-tests': {
        status: 'failed',
        durationMs: 402_000,
        log: L([
          '##[group]vitest run --config vitest.integration.ts',
          ' ✓ services/payments/src/authorize.test.ts (24)',
          ' ✓ services/orders/src/checkout.test.ts (31)',
          '',
          '<--- Last few GCs --->',
          '[1847:0x6c1a000]   288411 ms: Mark-Compact 4041.2 (4128.9) -> 4038.7 (4129.1) MB',
          '',
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
          ' 1: 0x10a8f5 node::Abort() [node]',
          ' 2: 0xb8d3f1 v8::internal::Heap::CollectGarbage()',
          '##[error]The operation was canceled.',
          'Process completed with exit code 137.',
          '##[endgroup]',
        ]),
      },
    },
    history: {
      runnerMemoryPct: 99.2,
      failingTests: [],
      previousRunOnBranchPassed: true,
    },
  },

  // ---- Dependency drift ---------------------------------------
  {
    runNumber: 2172,
    branch: 'chore/bump-deps',
    tier: 'none',
    trigger: 'schedule',
    startedAgo: 3 * DAY + 9 * HOUR,
    status: 'failed',
    commitMessage: 'chore(deps): weekly dependency bump',
    author: 'priya.nair',
    filesChanged: ['package.json', 'pnpm-lock.yaml'],
    failedStage: 'build',
    overrides: {
      build: {
        status: 'failed',
        durationMs: 61_000,
        log: L([
          '##[group]pnpm install --frozen-lockfile',
          'Packages: +1291 -1284',
          'Done in 24.8s',
          '##[endgroup]',
          '##[group]pnpm -r build',
          'packages/core       build: 1.8s',
          'packages/http       build: FAILED',
          '',
          "services/payments/src/provider.ts(14,10): error TS2305: Module '\"@northwind/retry-policy\"' has no exported member 'createBackoff'.",
          '',
          '  @northwind/retry-policy@4.0.0 renamed createBackoff to backoffFactory',
          '  in a major release. The manifest range ^3.2.0 resolved to 4.0.1.',
          '##[error]Process completed with exit code 2.',
          '##[endgroup]',
        ]),
      },
    },
    history: { lockfileChanged: true, previousRunOnBranchPassed: false },
  },

  // ---- Migration failure in staging ---------------------------
  {
    runNumber: 2168,
    branch: 'main',
    tier: 'production',
    trigger: 'push',
    startedAgo: 4 * DAY + 6 * HOUR,
    status: 'failed',
    commitMessage: 'feat(ledger): split settlement rows by currency',
    author: 'mei.tanaka',
    filesChanged: [
      'packages/db-client/migrations/0051_split_ledger_rows.sql',
      'services/ledger/src/settle.ts',
    ],
    failedStage: 'deploy-staging',
    overrides: {
      'deploy-staging': {
        status: 'failed',
        durationMs: 96_000,
        log: L([
          '##[group]pnpm db:migrate --env staging',
          'Applying 0049_settlement_index.sql ... ok (312ms)',
          'Applying 0051_split_ledger_rows.sql ...',
          '',
          'error: relation "ledger_entries_by_currency" already exists',
          'SQLSTATE[42P07]',
          '  at 0051_split_ledger_rows.sql:14',
          '',
          '##[error]migration aborted at step 3 of 7; 2 of 7 steps already committed',
          '##[error]Process completed with exit code 1.',
          '##[endgroup]',
        ]),
      },
      approval: { status: 'skipped' },
      'deploy-use1': { status: 'skipped' },
      'deploy-euw1': { status: 'skipped' },
      'deploy-apse2': { status: 'skipped' },
      'verify-prod': { status: 'skipped' },
    },
    history: { previousRunOnBranchPassed: true },
  },

  // ---- Expired registry credential ----------------------------
  {
    runNumber: 2163,
    branch: 'main',
    tier: 'production',
    trigger: 'push',
    startedAgo: 5 * DAY + 11 * HOUR,
    status: 'failed',
    commitMessage: 'docs(readme): document the release checklist',
    author: 's.almeida',
    filesChanged: ['README.md'],
    failedStage: 'package',
    overrides: {
      package: {
        status: 'failed',
        durationMs: 74_000,
        log: L([
          '##[group]docker buildx build',
          ' => exporting layers                                        10.9s',
          '##[endgroup]',
          `##[group]docker push ghcr.io/${DEMO_OWNER}/${DEMO_NAME}`,
          'The push refers to repository [ghcr.io/northwind/commerce-platform]',
          'error: failed to authorize: unauthorized: bad credentials for registry ghcr.io',
          'denied: permission_denied: The token provided has expired',
          '##[error]Process completed with exit code 1.',
          '##[endgroup]',
        ]),
      },
    },
    history: { previousRunOnBranchPassed: true },
  },
];

// ============================================================
// Status resolution
// ============================================================

/** Transitive dependency closure, so "did my ancestor fail?" is cheap. */
function ancestorsOf(specs: StageSpec[]): Map<string, Set<string>> {
  const byKey = new Map(specs.map((s) => [s.key, s]));
  const memo = new Map<string, Set<string>>();
  const walk = (key: string): Set<string> => {
    const cached = memo.get(key);
    if (cached) return cached;
    const set = new Set<string>();
    memo.set(key, set); // guards against a malformed cyclic topology
    for (const dep of byKey.get(key)?.dependsOn ?? []) {
      set.add(dep);
      for (const up of walk(dep)) set.add(up);
    }
    return set;
  };
  for (const s of specs) walk(s.key);
  return memo;
}

function resolveStatus(
  spec: StageSpec,
  scenario: Scenario,
  specs: StageSpec[],
  ancestors: Map<string, Set<string>>,
): StageStatus {
  const override = scenario.overrides?.[spec.key];
  if (override) return override.status;

  if (scenario.status === 'running') {
    const active = specs.find((s) => s.key === scenario.runningStage);
    if (!active) return 'success';
    if (spec.sequence < active.sequence) return 'success';
    if (spec.key === active.key) return 'running';
    return 'pending';
  }

  if (scenario.status === 'cancelled') {
    const active = specs.find((s) => s.key === scenario.runningStage);
    if (active && spec.sequence < active.sequence) return 'success';
    return spec.key === active?.key ? 'cancelled' : 'skipped';
  }

  if (scenario.status === 'failed') {
    const broken = specs.find((s) => s.key === scenario.failedStage);
    if (!broken) return 'success';
    if (spec.key === broken.key) return 'failed';
    // Anything downstream of the break never ran.
    if (ancestors.get(spec.key)?.has(broken.key)) return 'skipped';
    // Siblings at or before the break did run, and may well be green:
    // that asymmetry is exactly what the region view is for.
    return spec.sequence <= broken.sequence ? 'success' : 'skipped';
  }

  return 'success';
}

// ============================================================
// Filler history
// ============================================================
// Scripted scenarios alone would give an unbelievable success rate,
// and the p50 duration and flake numbers need a population to be
// computed from. These fill in the boring green runs around them.

const FILLER_MESSAGES = [
  'fix(gateway): tighten rate-limit window accounting',
  'chore(core): drop unused money helpers',
  'feat(identity): add device fingerprint to sessions',
  'test(ledger): cover partial refund reconciliation',
  'perf(orders): memoise promo eligibility lookup',
  'fix(payments): retry provider 429 with jitter',
  'refactor(http): extract request-id middleware',
  'docs(payments): document capture idempotency',
  'feat(ledger): expose settlement export endpoint',
  'fix(orders): reject checkout with an empty cart',
] as const;

const FILLER_BRANCHES = [
  'main',
  'main',
  'main',
  'feat/device-fingerprint',
  'fix/rate-limit-window',
  'perf/promo-lookup',
  'test/ledger-refunds',
] as const;

function buildFiller(): Scenario[] {
  const runs: Scenario[] = [];

  // Filler is the *older* history, so it has to take run numbers below
  // every scripted run. Interleaving them would produce a run #2182
  // that is older than #2163, and a run number that disagrees with the
  // clock is the kind of detail that makes seeded data look seeded.
  const oldestScripted = Math.min(...SCENARIOS.map((s) => s.runNumber));
  let runNumber = oldestScripted;

  // 32 runs stepping back from six days to three weeks.
  for (let i = 0; i < 32; i += 1) {
    runNumber -= 1;

    const branch = pick(FILLER_BRANCHES);
    const onMain = branch === 'main';
    runs.push({
      runNumber,
      branch,
      tier: onMain ? 'production' : 'none',
      trigger: onMain ? 'push' : 'pull_request',
      // Older than every scripted run, and ordered so a higher run
      // number is always more recent.
      startedAgo: Math.round(6 * DAY + i * ((20 * DAY - 6 * DAY) / 32) + between(0, 4 * HOUR)),
      status: 'success',
      commitMessage: pick(FILLER_MESSAGES),
      author: pick(AUTHORS),
      prNumber: onMain ? undefined : intBetween(1790, 1840),
      filesChanged: [pick([...CORE, ...SERVICES]).path],
    });
  }
  return runs;
}

const FLAKY_ROSTER = [
  {
    testName: 'session refresh survives clock skew',
    filePath: 'services/identity/src/session.test.ts',
    suite: 'identity',
    runCount: 312,
    failCount: 53,
    distinctBranches: 9,
    quarantined: false,
    lastFailedAgo: 3 * HOUR + 41 * MIN,
  },
  {
    testName: 'webhook retries with exponential backoff',
    filePath: 'packages/core/src/retry.test.ts',
    suite: 'core',
    runCount: 298,
    failCount: 27,
    distinctBranches: 7,
    quarantined: false,
    lastFailedAgo: 2 * DAY + 4 * HOUR,
  },
  {
    testName: 'reconciles refunds issued across a month boundary',
    filePath: 'services/ledger/src/reconcile.test.ts',
    suite: 'ledger',
    runCount: 264,
    failCount: 41,
    distinctBranches: 6,
    quarantined: true,
    lastFailedAgo: 6 * DAY,
  },
  {
    testName: 'rate limiter releases tokens on the second tick',
    filePath: 'services/gateway/src/rate-limit.test.ts',
    suite: 'gateway',
    runCount: 271,
    failCount: 14,
    distinctBranches: 5,
    quarantined: false,
    lastFailedAgo: 8 * DAY,
  },
];

// ============================================================
// Seed
// ============================================================

export async function seedPipelineDemo() {
  const db = getDb();

  // Idempotent: wipe the demo repository's rows and rebuild. Scoped
  // to DEMO_REPO_ID so a real connected repository is never touched.
  await db.delete(pipe.pipelineDiagnoses).where(eq(pipe.pipelineDiagnoses.runId, '__never__'));
  const existingRuns = await db
    .select({ id: pipe.pipelineRuns.id })
    .from(pipe.pipelineRuns)
    .where(eq(pipe.pipelineRuns.repositoryId, DEMO_REPO_ID));
  for (const run of existingRuns) {
    await db.delete(pipe.pipelineDiagnoses).where(eq(pipe.pipelineDiagnoses.runId, run.id));
    await db.delete(pipe.pipelineStages).where(eq(pipe.pipelineStages.runId, run.id));
    await db.delete(pipe.environmentDeployments).where(eq(pipe.environmentDeployments.runId, run.id));
  }
  await db.delete(pipe.pipelineRuns).where(eq(pipe.pipelineRuns.repositoryId, DEMO_REPO_ID));
  await db.delete(pipe.flakyTests).where(eq(pipe.flakyTests.repositoryId, DEMO_REPO_ID));
  await db.delete(pipe.environments).where(eq(pipe.environments.repositoryId, DEMO_REPO_ID));
  await db.delete(pipe.pipelines).where(eq(pipe.pipelines.repositoryId, DEMO_REPO_ID));
  await db.delete(core.repositoryEdges).where(eq(core.repositoryEdges.repositoryId, DEMO_REPO_ID));
  await db.delete(core.repositoryFiles).where(eq(core.repositoryFiles.repositoryId, DEMO_REPO_ID));
  await db.delete(core.codeFindings).where(eq(core.codeFindings.repositoryId, DEMO_REPO_ID));
  await db.delete(core.codeAnalysisRuns).where(eq(core.codeAnalysisRuns.repositoryId, DEMO_REPO_ID));
  await db.delete(core.repositories).where(eq(core.repositories.id, DEMO_REPO_ID));

  // ---- Repository ----
  const headSha = sha();
  await db.insert(core.repositories).values({
    id: DEMO_REPO_ID,
    name: DEMO_NAME,
    owner: DEMO_OWNER,
    fullName: `${DEMO_OWNER}/${DEMO_NAME}`,
    url: `https://github.com/${DEMO_OWNER}/${DEMO_NAME}`,
    defaultBranch: DEFAULT_BRANCH,
    language: 'TypeScript',
    description:
      'Five-service commerce monorepo: gateway, identity, orders, payments and ledger. Deployed to three production regions.',
    lastAnalyzedAt: iso(18 * MIN),
    riskScore: 38,
    healthStatus: 'warning',
    userId: null,
    createdAt: iso(400 * DAY),
    updatedAt: iso(18 * MIN),
  });

  // ---- Index run + dependency graph ----
  const { files, edges } = buildGraph();
  const analysisRunId = 'demo-index-run';
  await db.insert(core.codeAnalysisRuns).values({
    id: analysisRunId,
    repositoryId: DEMO_REPO_ID,
    status: 'completed',
    branch: DEFAULT_BRANCH,
    commitSha: headSha,
    coverage: JSON.stringify({ statements: 86.4, branches: 79.1, functions: 88.2 }),
    progress: 100,
    filesProcessed: files.length,
    totalFiles: files.length,
    symbolsIndexed: files.reduce((a, f) => a + Math.max(2, Math.round(f.complexity / 2)), 0),
    findingsCount: 0,
    startedAt: iso(18 * MIN + 38_000),
    completedAt: iso(18 * MIN),
    error: null,
  });

  for (const f of files) {
    await db.insert(core.repositoryFiles).values({
      id: `demo-file-${f.path.replace(/[^a-z0-9]/gi, '-')}`,
      repositoryId: DEMO_REPO_ID,
      analysisRunId,
      path: f.path,
      language: f.language,
      content: '',
      summary: JSON.stringify({ role: f.role, service: f.service, endpoints: f.endpoints }),
      complexity: f.complexity,
      sizeBytes: 400 + f.complexity * 96,
      imports: JSON.stringify(f.imports),
      symbols: '[]',
      contentHash: null,
      updatedAt: iso(18 * MIN),
    });
  }

  for (const [i, e] of edges.entries()) {
    await db.insert(core.repositoryEdges).values({
      id: `demo-edge-${i}`,
      repositoryId: DEMO_REPO_ID,
      analysisRunId,
      sourcePath: e.source,
      targetPath: e.target,
      kind: e.kind,
    });
  }

  // ---- Environments ----
  const envIds = new Map<string, string>();
  for (const e of ENVIRONMENTS) {
    const id = `demo-env-${e.key}`;
    envIds.set(e.key, id);
    // ap-southeast-2 is left degraded on purpose: it is the target the
    // hero scenario failed to deploy to, and the region matrix should
    // still be showing that when the page loads.
    const degraded = e.key === 'prod-apse2';
    await db.insert(pipe.environments).values({
      id,
      repositoryId: DEMO_REPO_ID,
      name: e.name,
      tier: e.tier,
      region: e.region,
      regionLabel: e.regionLabel,
      provider: 'aws',
      cluster: e.cluster,
      url: e.url,
      requiresApproval: e.requiresApproval,
      status: degraded ? 'degraded' : 'healthy',
      // development auto-deploys main outside this pipeline, so it tracks
      // the newest build. Every other target is overwritten from real
      // deployment records in the reconciliation pass below.
      currentVersion: degraded ? '2024.9.80' : '2024.9.85',
      currentCommitSha: degraded ? sha() : headSha,
      deployedAt: degraded ? iso(3 * DAY) : iso(2 * HOUR + 6 * MIN),
      trafficPct: 100,
      errorRate: degraded ? 2.41 : Number(between(0.01, 0.09).toFixed(3)),
      latencyP95: degraded ? 812 : Math.round(between(176, 264)),
      requestsPerMin: Math.round(between(1400, 9800)),
      replicas: e.replicas,
      createdAt: iso(400 * DAY),
    });
  }

  // ---- Pipelines ----
  const ciPipelineId = 'demo-pipeline-ci';
  const releasePipelineId = 'demo-pipeline-release';
  await db.insert(pipe.pipelines).values([
    {
      id: ciPipelineId,
      repositoryId: DEMO_REPO_ID,
      name: 'CI',
      provider: 'github-actions',
      filePath: '.github/workflows/ci.yml',
      successRate: null,
      p50DurationMs: null,
      lastRunAt: null,
      createdAt: iso(400 * DAY),
    },
    {
      id: releasePipelineId,
      repositoryId: DEMO_REPO_ID,
      name: 'Release',
      provider: 'github-actions',
      filePath: '.github/workflows/release.yml',
      successRate: null,
      p50DurationMs: null,
      lastRunAt: null,
      createdAt: iso(400 * DAY),
    },
  ]);

  // ---- Runs ----
  // Oldest first: each deployment records the version it replaced, so
  // the chain has to be built forwards in time.
  const all = [...SCENARIOS, ...buildFiller()].sort((a, b) => b.startedAgo - a.startedAgo);

  /** Version currently live on each environment, as of this run. */
  const liveVersion = new Map<string, string>();
  const versionFor = (runNumber: number) => `2024.9.${runNumber - 2100}`;
  const stats = new Map<string, { durations: number[]; total: number; success: number; last: string }>();

  for (const scenario of all) {
    const specs = topology(scenario.tier);
    const ancestors = ancestorsOf(specs);
    const pipelineId = scenario.tier === 'none' ? ciPipelineId : releasePipelineId;
    const runId = `demo-run-${scenario.runNumber}`;
    const commitSha = sha();
    const startMs = NOW - scenario.startedAgo;

    // Resolve every stage first: the run's duration is the span of its
    // stages, so the stages have to exist before the run row is final.
    // Walk the DAG level by level, starting each level when the widest
    // stage of the previous one finished.
    //
    // The earlier version read start offsets from a table precomputed
    // off the declared `typical` durations, which meant per-stage
    // jitter never reached the run total and every release run came
    // out at exactly 24m 11s. Accumulating real durations is what
    // makes the run list look like a run list.
    const resolved: {
      spec: StageSpec;
      status: StageStatus;
      startedAt: string | null;
      completedAt: string | null;
      durationMs: number | null;
      attempts: number;
      endOffset: number;
      log: string;
      env: (typeof ENVIRONMENTS)[number] | undefined;
    }[] = [];

    const levels = [...new Set(specs.map((s) => s.sequence))].sort((a, b) => a - b);
    let levelStart = 0;

    for (const level of levels) {
      let levelEnd = levelStart;

      for (const spec of specs.filter((s) => s.sequence === level)) {
        const override = scenario.overrides?.[spec.key];
        const status = resolveStatus(spec, scenario, specs, ancestors);
        const ran = status === 'success' || status === 'failed' || status === 'cancelled';
        const duration =
          override?.durationMs ??
          (spec.kind === 'approval'
            ? intBetween(3, 24) * MIN
            : Math.round(spec.typical * between(0.86, 1.18)));
        const env = spec.envKey ? ENVIRONMENTS.find((e) => e.key === spec.envKey) : undefined;
        const logCtx = { sha: commitSha, branch: scenario.branch, env: env?.name, region: env?.region };
        const endOffset = ran ? levelStart + duration : levelStart;
        levelEnd = Math.max(levelEnd, endOffset);

        resolved.push({
          spec,
          status,
          startedAt: ran || status === 'running' ? new Date(startMs + levelStart).toISOString() : null,
          completedAt: ran ? new Date(startMs + endOffset).toISOString() : null,
          durationMs: ran ? duration : null,
          attempts: override?.attempts ?? 1,
          endOffset,
          log:
            override?.log ??
            (status === 'success'
              ? successLog(spec, logCtx)
              : status === 'skipped'
                ? SKIPPED_LOG
                : status === 'running'
                  ? successLog(spec, logCtx).split('\n').slice(0, 4).join('\n')
                  : PENDING_LOG),
          env,
        });
      }

      // Queue gap between phases.
      levelStart = levelEnd + intBetween(2, 9) * 1000;
    }

    const spanMs = Math.max(...resolved.map((r) => r.endOffset));
    const finished = scenario.status === 'success' || scenario.status === 'failed';
    const queuedMs = intBetween(2, 46) * 1000;

    await db.insert(pipe.pipelineRuns).values({
      id: runId,
      repositoryId: DEMO_REPO_ID,
      pipelineId,
      runNumber: scenario.runNumber,
      branch: scenario.branch,
      targetTier: scenario.tier,
      commitSha,
      commitMessage: scenario.commitMessage,
      commitAuthor: scenario.author,
      trigger: scenario.trigger,
      pullRequestNumber: scenario.prNumber ?? null,
      status: scenario.status,
      startedAt: new Date(startMs).toISOString(),
      completedAt: finished ? new Date(startMs + spanMs).toISOString() : null,
      durationMs: finished ? spanMs : null,
      queuedMs,
      actor: scenario.author,
      failedStage: scenario.status === 'failed' ? (scenario.failedStage ?? null) : null,
      createdAt: new Date(startMs - queuedMs).toISOString(),
    });

    for (const r of resolved) {
      await db.insert(pipe.pipelineStages).values({
        id: `${runId}-${r.spec.key}`,
        runId,
        stageKey: r.spec.key,
        name: r.spec.name,
        kind: r.spec.kind,
        lane: r.spec.lane,
        sequence: r.spec.sequence,
        dependsOn: JSON.stringify(r.spec.dependsOn),
        environmentId: r.spec.envKey ? (envIds.get(r.spec.envKey) ?? null) : null,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        durationMs: r.durationMs,
        attempts: r.attempts,
        exitCode: r.status === 'failed' ? 1 : r.status === 'success' ? 0 : null,
        runnerLabel: r.spec.runner ?? null,
        summary: JSON.stringify(stageSummary(r.spec, r.status)),
        log: r.log,
      });

      // A successful deploy stage lands a deployment record.
      if (r.spec.kind === 'deploy' && r.status === 'success' && r.spec.envKey) {
        await db.insert(pipe.environmentDeployments).values({
          id: `${runId}-deploy-${r.spec.envKey}`,
          environmentId: envIds.get(r.spec.envKey)!,
          runId,
          version: versionFor(scenario.runNumber),
          commitSha,
          previousVersion: liveVersion.get(r.spec.envKey) ?? null,
          strategy: r.spec.envKey.startsWith('prod') ? 'blue-green' : 'rolling',
          status: 'superseded',
          trafficPct: 100,
          healthCheck: 'passing',
          actor: scenario.author,
          startedAt: r.startedAt!,
          completedAt: r.completedAt,
          rolledBackAt: null,
          rollbackReason: null,
        });
        // This target is now running the new version, which the next
        // deployment to it will record as its predecessor.
        liveVersion.set(r.spec.envKey, versionFor(scenario.runNumber));
      }

      // A failed deploy records the rollback that followed.
      if (r.spec.kind === 'deploy' && r.status === 'failed' && r.spec.envKey) {
        await db.insert(pipe.environmentDeployments).values({
          id: `${runId}-deploy-${r.spec.envKey}`,
          environmentId: envIds.get(r.spec.envKey)!,
          runId,
          version: versionFor(scenario.runNumber),
          commitSha,
          previousVersion: liveVersion.get(r.spec.envKey) ?? null,
          strategy: 'blue-green',
          status: 'rolled-back',
          trafficPct: 0,
          healthCheck: 'failing',
          actor: scenario.author,
          startedAt: r.startedAt!,
          completedAt: r.completedAt,
          rolledBackAt: new Date(startMs + r.endOffset + 90_000).toISOString(),
          rollbackReason: 'Readiness probe never passed; traffic was never shifted.',
        });
      }
    }

    // ---- Diagnosis: produced by the engine, never authored here ----
    if (scenario.status === 'failed' && scenario.failedStage) {
      const broken = resolved.find((r) => r.spec.key === scenario.failedStage)!;
      const baseline = await baselineFor(scenario.failedStage, all, scenario.tier);
      const context: FailureContext = {
        stage: {
          key: broken.spec.key,
          name: broken.spec.name,
          kind: broken.spec.kind,
          exitCode: 1,
          durationMs: broken.durationMs,
          attempts: broken.attempts,
          log: broken.log,
          baselineDurationMs: baseline,
          region: broken.env?.region ?? null,
          environment: broken.env?.name ?? null,
        },
        run: {
          branch: scenario.branch,
          defaultBranch: DEFAULT_BRANCH,
          trigger: scenario.trigger,
          commitSha,
          commitMessage: scenario.commitMessage,
          commitAuthor: scenario.author,
          filesChanged: scenario.filesChanged,
        },
        history: scenario.history ?? {},
      };

      const t0 = performance.now();
      const verdict = diagnose(context);
      const computeMs = performance.now() - t0;

      await db.insert(pipe.pipelineDiagnoses).values({
        id: `${runId}-diagnosis`,
        runId,
        stageKey: broken.spec.key,
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
        computeMs: Math.max(1, Math.round(computeMs * 1000) / 1000),
        createdAt: new Date(startMs + spanMs + 1200).toISOString(),
      });
    }

    // ---- Pipeline health accumulation ----
    const entry = stats.get(pipelineId) ?? { durations: [], total: 0, success: 0, last: '' };
    if (finished) {
      entry.total += 1;
      if (scenario.status === 'success') entry.success += 1;
      entry.durations.push(spanMs);
    }
    const startedIso = new Date(startMs).toISOString();
    if (startedIso > entry.last) entry.last = startedIso;
    stats.set(pipelineId, entry);
  }

  // ---- Reconcile what is actually live ----
  // Every deployment was written as 'superseded' because, at the time
  // it was inserted, a later one might still arrive. Now that the
  // history is complete, promote the newest surviving deployment on
  // each target to 'live' and point the environment row at it. Doing
  // it here rather than guessing up front is what keeps the region
  // matrix and the deployment table telling the same story.
  for (const [envKey, environmentId] of envIds) {
    const landed = (
      await db
        .select()
        .from(pipe.environmentDeployments)
        .where(eq(pipe.environmentDeployments.environmentId, environmentId))
    )
      .filter((d) => d.status !== 'rolled-back' && d.status !== 'failed')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const current = landed[0];
    if (!current) continue;

    await db
      .update(pipe.environmentDeployments)
      .set({ status: 'live' })
      .where(eq(pipe.environmentDeployments.id, current.id));

    // ap-southeast-2 is deliberately left degraded: its last deploy
    // rolled back, so it is still serving the older revision.
    const degraded = envKey === 'prod-apse2';
    await db
      .update(pipe.environments)
      .set({
        currentVersion: current.version,
        currentCommitSha: current.commitSha,
        deployedAt: current.completedAt ?? current.startedAt,
        status: degraded ? 'degraded' : 'healthy',
      })
      .where(eq(pipe.environments.id, environmentId));
  }

  // ---- Denormalised pipeline health ----
  for (const [pipelineId, entry] of stats) {
    const sorted = [...entry.durations].sort((a, b) => a - b);
    await db
      .update(pipe.pipelines)
      .set({
        successRate: entry.total ? Math.round((entry.success / entry.total) * 1000) / 1000 : null,
        p50DurationMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
        lastRunAt: entry.last || null,
      })
      .where(eq(pipe.pipelines.id, pipelineId));
  }

  // ---- Flake roster ----
  for (const [i, f] of FLAKY_ROSTER.entries()) {
    await db.insert(pipe.flakyTests).values({
      id: `demo-flaky-${i}`,
      repositoryId: DEMO_REPO_ID,
      testName: f.testName,
      filePath: f.filePath,
      suite: f.suite,
      runCount: f.runCount,
      failCount: f.failCount,
      flakeRate: Math.round((f.failCount / f.runCount) * 10000) / 10000,
      distinctBranches: f.distinctBranches,
      quarantined: f.quarantined,
      firstSeenAt: iso(60 * DAY),
      lastFailedAt: iso(f.lastFailedAgo),
    });
  }

  return {
    repositoryId: DEMO_REPO_ID,
    files: files.length,
    edges: edges.length,
    runs: all.length,
    environments: ENVIRONMENTS.length,
  };
}

/** Median duration of this stage across the green runs in the corpus. */
async function baselineFor(
  stageKey: string,
  scenarios: Scenario[],
  tier: Scenario['tier'],
): Promise<number | null> {
  const spec = topology(tier).find((s) => s.key === stageKey);
  if (!spec) return null;
  // The scripted corpus is small, so the declared typical duration is a
  // better baseline than a sample of two.
  return spec.typical;
}

/** Stage-specific counters shown as chips on the flow nodes. */
function stageSummary(spec: StageSpec, status: StageStatus): Record<string, unknown> {
  if (status === 'skipped' || status === 'pending') return {};
  switch (spec.kind) {
    case 'test':
      return status === 'failed'
        ? { testsPassed: intBetween(398, 452), testsFailed: intBetween(1, 2), suites: intBetween(28, 34) }
        : { testsPassed: intBetween(410, 488), testsFailed: 0, suites: intBetween(28, 34) };
    case 'scan':
      return { vulnerabilities: 0, projects: 11 };
    case 'package':
      return { imageSizeMb: Math.round(between(118, 146)), layers: intBetween(11, 16) };
    case 'deploy':
      return status === 'failed'
        ? { replicasReady: 0, replicasDesired: 6 }
        : { replicasReady: 6, replicasDesired: 6 };
    case 'verify':
      return { checks: 6, errorRatePct: Number(between(0.01, 0.08).toFixed(3)) };
    case 'build':
      return { packages: 11 };
    default:
      return {};
  }
}
