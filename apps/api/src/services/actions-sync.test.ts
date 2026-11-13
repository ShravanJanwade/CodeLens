// ============================================================
// GitHub Actions ingestion: the pure parts
// ============================================================
// Workflow parsing, DAG layout, status mapping, log and annotation
// parsing, and flake statistics, against the shapes GitHub returns
// for the live example repository.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelens-actions-'));
process.env.DATABASE_URL = path.join(directory, 'test.db');
process.env.CODELENS_TEST = 'true';

const sync = await import('./actions-sync');
const { endpointsIn, serviceOf } = await import('../pipeline/graph-inference');
const { resolveLocalImport, workspacePackages } = await import('./import-resolution');

const DEPLOY_WORKFLOW = `
name: Deploy
on: { push: { branches: [main] } }
jobs:
  verify:
    name: Lint, typecheck and unit tests
    runs-on: ubuntu-latest
  integration-tests:
    name: Integration tests
    needs: verify
  deploy-staging:
    name: Deploy staging
    needs: integration-tests
    environment:
      name: staging
      url: \${{ steps.publish.outputs.url }}
  deploy-us:
    name: Deploy production-us
    needs: deploy-staging
    environment: { name: production-us }
  deploy-eu:
    name: Deploy production-eu
    needs: deploy-staging
    environment: production-eu
  verify-production:
    name: Verify production
    needs: [deploy-us, deploy-eu]
  check-production:
    name: Check production
    strategy: { matrix: { region: [US, EU] } }
`;

const job = (id: number, name: string, conclusion = 'success') => ({
  id,
  name,
  status: 'completed',
  conclusion,
  started_at: '2026-11-13T05:00:00Z',
  completed_at: '2026-11-13T05:01:00Z',
});

test('parses needs and environments from a workflow file', () => {
  const jobs = sync.parseWorkflow(DEPLOY_WORKFLOW);
  const byId = new Map(jobs.map((j) => [j.id, j]));
  assert.deepEqual(byId.get('integration-tests')?.needs, ['verify']);
  assert.deepEqual(byId.get('verify-production')?.needs, ['deploy-us', 'deploy-eu']);
  assert.equal(byId.get('deploy-staging')?.environment, 'staging');
  assert.equal(byId.get('deploy-us')?.environment, 'production-us');
  assert.equal(byId.get('deploy-eu')?.environment, 'production-eu');
  assert.equal(byId.get('verify')?.name, 'Lint, typecheck and unit tests');
  assert.deepEqual(sync.parseWorkflow('not: [valid'), []);
});

test('lays jobs out by their needs graph, parallel deploys side by side', () => {
  const plan = sync.planStages(
    [
      job(1, 'Lint, typecheck and unit tests'),
      job(2, 'Integration tests'),
      job(3, 'Deploy staging'),
      job(4, 'Deploy production-us'),
      job(5, 'Deploy production-eu', 'failure'),
      job(6, 'Verify production', 'skipped'),
      job(7, 'Check production (US)'),
      job(8, 'Check production (EU)'),
    ],
    sync.parseWorkflow(DEPLOY_WORKFLOW),
  );
  const at = (id: number) => plan.get(id)!;
  assert.deepEqual([at(1).sequence, at(2).sequence, at(3).sequence], [0, 1, 2]);
  assert.equal(at(4).sequence, 3);
  assert.equal(at(5).sequence, 3);
  assert.notEqual(at(4).lane, at(5).lane);
  assert.deepEqual(at(6).dependsOn.sort(), ['deploy-eu', 'deploy-us']);
  assert.equal(at(5).environment, 'production-eu');
  assert.equal(at(5).kind, 'deploy');
  assert.equal(at(1).kind, 'test');
  assert.equal(at(6).kind, 'verify');
  // Matrix instances keep their values in the key and share the base job's level.
  assert.equal(at(7).key, 'check-production-us');
  assert.equal(at(8).key, 'check-production-eu');
  assert.equal(at(7).sequence, 0);
});

test('infers stage kinds from job names', () => {
  assert.equal(sync.stageKind('Lint', null), 'build');
  assert.equal(sync.stageKind('CodeQL analysis', null), 'scan');
  assert.equal(sync.stageKind('Typecheck', null), 'build');
  assert.equal(sync.stageKind('Unit tests', null), 'test');
  assert.equal(sync.stageKind('Build storefronts', null), 'build');
  assert.equal(sync.stageKind('Publish image', null), 'package');
  assert.equal(sync.stageKind('Integration tests', null), 'test');
  assert.equal(sync.stageKind('Anything at all', 'production-us'), 'deploy');
});

test('maps GitHub run and job states', () => {
  assert.equal(sync.runStatus({ status: 'completed', conclusion: 'failure' }), 'failed');
  assert.equal(sync.runStatus({ status: 'completed', conclusion: 'timed_out' }), 'failed');
  assert.equal(sync.runStatus({ status: 'completed', conclusion: 'cancelled' }), 'cancelled');
  assert.equal(sync.runStatus({ status: 'in_progress', conclusion: null }), 'running');
  assert.equal(sync.runStatus({ status: 'waiting', conclusion: null }), 'blocked');
  assert.equal(sync.stageStatus({ status: 'completed', conclusion: 'skipped' }), 'skipped');
  assert.equal(sync.stageStatus({ status: 'queued', conclusion: null }), 'queued');
});

test('cleans a raw job log and keeps its end', () => {
  const raw = [
    '2026-11-13T05:38:01.1234567Z ##[group]Run npm ci',
    '2026-11-13T05:38:09.0000000Z \u001b[31mnpm error\u001b[39m code ERESOLVE',
    '2026-11-13T05:38:09.1000000Z ##[error]Process completed with exit code 1.',
  ].join('\r\n');
  const log = sync.cleanLog(raw);
  assert.equal(
    log,
    '##[group]Run npm ci\nnpm error code ERESOLVE\n##[error]Process completed with exit code 1.',
  );
  assert.equal(sync.exitCodeFrom(log), 1);
  const long = sync.cleanLog('x'.repeat(60_000) + '\nthe end');
  assert.ok(long.endsWith('the end'));
  assert.ok(long.startsWith('['));
});

test('finds failing tests in Vitest and Jest output', () => {
  const vitest = [
    ' FAIL  |unit| packages/pricing/test/discounts.test.ts > applyDiscounts > gives ten percent off a line of three or more',
    'AssertionError: expected [] to deeply equal [ …(1) ]',
    ' FAIL  |integration| services/api/test/api.test.ts [ services/api/test/api.test.ts ]',
    '      Tests  5 failed | 45 passed (50)',
  ].join('\n');
  assert.deepEqual(sync.failingTestsFrom(vitest), [
    {
      name: 'applyDiscounts > gives ten percent off a line of three or more',
      file: 'packages/pricing/test/discounts.test.ts',
      suite: 'applyDiscounts',
    },
  ]);
  assert.deepEqual(sync.testCountsFrom(vitest), { failed: 5, passed: 45 });
  const jest = '  ● Cart › applies the coupon once\n\nTests:       1 failed, 41 passed, 42 total';
  assert.equal(sync.failingTestsFrom(jest)[0]?.name, 'Cart › applies the coupon once');
  assert.deepEqual(sync.testCountsFrom(jest), { failed: 1, passed: 41 });
});

test('turns public annotations into the same evidence when the log is withheld', () => {
  const log = sync.annotationLog([
    {
      path: '.github',
      start_line: 1,
      annotation_level: 'failure',
      title: null,
      message: 'Process completed with exit code 1.',
    },
    {
      path: 'packages/pricing/test/coupons.test.ts',
      start_line: 22,
      annotation_level: 'failure',
      title:
        '[unit] packages/pricing/test/coupons.test.ts > coupon codes > issues unique codes for a newsletter-sized campaign',
      message: 'AssertionError: expected 2599 to be 2600',
    },
    {
      path: '.github',
      start_line: 1,
      annotation_level: 'notice',
      title: null,
      message: 'ubuntu-latest will migrate',
    },
  ]);
  assert.match(log, /AssertionError: expected 2599 to be 2600/);
  assert.doesNotMatch(log, /ubuntu-latest/);
  assert.equal(
    sync.failingTestsFrom(log)[0]?.name,
    'coupon codes > issues unique codes for a newsletter-sized campaign',
  );
});

test('flake statistics separate a cross-branch flake from a one-branch regression', () => {
  const flaky = { name: 'coupon codes > unique', file: 'coupons.test.ts', suite: 'coupon codes' };
  const regression = {
    name: 'applyDiscounts > three or more',
    file: 'discounts.test.ts',
    suite: 'applyDiscounts',
  };
  const at = (n: number) => `2026-11-13T05:${String(n).padStart(2, '0')}:00Z`;
  const observations = [
    { runId: 'r1', stageKey: 'unit-tests', branch: 'main', at: at(1), failed: [flaky] },
    { runId: 'r2', stageKey: 'unit-tests', branch: 'feature/a', at: at(2), failed: [] },
    { runId: 'r3', stageKey: 'unit-tests', branch: 'feature/b', at: at(3), failed: [regression] },
    { runId: 'r4', stageKey: 'unit-tests', branch: 'chore/c', at: at(4), failed: [flaky] },
    { runId: 'r5', stageKey: 'unit-tests', branch: 'feature/d', at: at(5), failed: [] },
  ];
  const stats = sync.flakeStats(observations);
  assert.equal(stats.get(flaky.name)?.distinctBranches, 2);
  assert.equal(stats.get(flaky.name)?.runCount, 5);
  assert.equal(stats.get(flaky.name)?.flakeRate, 0.4);
  assert.equal(stats.get(regression.name)?.distinctBranches, 1);
  assert.equal(stats.get(regression.name)?.firstFailure, true);
  // As of the third run the second flake had not happened yet.
  assert.equal(sync.flakeStats(observations, at(3)).get(flaky.name)?.distinctBranches, 1);
});

test('infers services and HTTP routes from an indexed file', () => {
  assert.equal(serviceOf('services/api/src/routes.ts'), 'api');
  assert.equal(serviceOf('apps/web/src/App.tsx'), 'web');
  assert.equal(serviceOf('packages/money/src/index.ts'), undefined);
  const source = `
    new Router()
      .on('GET', '/api/products', list)
      .on('POST', '/api/orders', create);
    app.get('/health', ok);
    const value = headers.get('content-type');
  `;
  assert.deepEqual(endpointsIn(source), ['GET /api/products', 'POST /api/orders', 'GET /health']);
});

test("resolves workspace package imports to the repository's own files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codelens-workspace-'));
  await fs.mkdir(path.join(root, 'packages/money/src'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'shop', workspaces: ['packages/*'] }),
  );
  await fs.writeFile(
    path.join(root, 'packages/money/package.json'),
    JSON.stringify({ name: '@shop/money', exports: { '.': './src/index.ts' } }),
  );
  const packages = workspacePackages(root);
  const known = new Set([
    'packages/money/src/index.ts',
    'packages/money/src/format.ts',
    'services/api/src/main.ts',
  ]);
  assert.equal(
    resolveLocalImport('services/api/src/main.ts', '@shop/money', known, packages),
    'packages/money/src/index.ts',
  );
  assert.equal(
    resolveLocalImport('services/api/src/main.ts', '@shop/money/src/format', known, packages),
    'packages/money/src/format.ts',
  );
  assert.equal(
    resolveLocalImport('packages/money/src/index.ts', './format.ts', known, packages),
    'packages/money/src/format.ts',
  );
  assert.equal(resolveLocalImport('services/api/src/main.ts', 'node:fs', known, packages), undefined);
  assert.equal(resolveLocalImport('services/api/src/main.ts', '@other/thing', known, packages), undefined);
});
