// ============================================================
// Delivery pipeline API integration tests
// ============================================================
// Runs against a throwaway database seeded by the real demo seed, so
// these exercise the same query paths and the same classifier output
// the public demo renders.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelens-pipeline-'));
process.env.DATABASE_URL = path.join(directory, 'test.db');
process.env.CODELENS_TEST = 'true';
process.env.AI_PROVIDER = 'demo';
process.env.APP_ORIGIN = 'http://localhost:3000';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const run = (script: string) =>
  promisify(execFile)(process.execPath, ['--import', 'tsx', path.join(root, script)], {
    cwd: path.join(root, 'apps/api'),
    env: process.env,
  });

await run('packages/db/src/migrate.ts');
await run('packages/db/src/seed-demo.ts');

const { app } = await import('../index');

const REPO = 'demo-commerce-platform';
const base = `http://localhost/api/v1/repositories/${REPO}`;

async function get<T = any>(url: string): Promise<{ status: number; body: T }> {
  const response = await app.request(url);
  const body = (await response.json().catch(() => null)) as T;
  return { status: response.status, body };
}

// ---- Overview ---------------------------------------------------

test('delivery overview composes environments, pipelines, runs and stats in one request', async () => {
  const { status, body } = await get(`${base}/delivery-overview`);
  assert.equal(status, 200);

  const data = body.data;
  assert.equal(data.repository.id, REPO);

  // Production spans three regions; that is what makes the region
  // question answerable at all.
  const production = data.environments.filter((e: any) => e.tier === 'production');
  assert.equal(production.length, 3);
  assert.deepEqual(production.map((e: any) => e.region).sort(), ['ap-southeast-2', 'eu-west-1', 'us-east-1']);

  // Stats are derived, not stored: a success rate of exactly 0 or 1
  // across 40 seeded runs would mean the derivation is broken.
  assert.ok(data.stats.successRate > 0 && data.stats.successRate < 1);
  assert.ok(data.stats.diagnosedFailures >= 5);
  assert.ok(data.stats.p50DurationMs > 0);
  assert.ok(data.stats.p95DurationMs >= data.stats.p50DurationMs);
});

test('every seeded failure carries a classified root cause', async () => {
  const { body } = await get(`${base}/pipeline-runs?status=failed`);
  assert.ok(body.data.length >= 5);
  for (const run of body.data) {
    assert.ok(run.diagnosis, `run #${run.runNumber} has no diagnosis`);
    assert.ok(run.diagnosis.confidence > 0 && run.diagnosis.confidence <= 1);
    assert.ok(run.diagnosis.categoryLabel, 'category must have a human label');
  }
  // The demo is only interesting if it covers distinct causes.
  const categories = new Set(body.data.map((r: any) => r.diagnosis.category));
  assert.ok(categories.size >= 5, `expected varied causes, got ${[...categories].join(', ')}`);
});

// ---- Run detail -------------------------------------------------

test('the hero run exposes a DAG where two regions succeeded and one failed', async () => {
  const { status, body } = await get(`${base}/pipeline-runs/2184`);
  assert.equal(status, 200);

  const { run, stages, diagnosis, deployments } = body.data;
  assert.equal(run.status, 'failed');
  assert.equal(run.branch, 'main');

  const deployStages = stages.filter((s: any) => s.kind === 'deploy' && s.environment?.tier === 'production');
  assert.equal(deployStages.length, 3);
  assert.equal(deployStages.filter((s: any) => s.status === 'success').length, 2);
  assert.equal(deployStages.filter((s: any) => s.status === 'failed').length, 1);

  // Parallel deploys must share a DAG level; otherwise the flow view
  // draws them as a sequence and the whole comparison is lost.
  assert.equal(new Set(deployStages.map((s: any) => s.sequence)).size, 1);
  assert.equal(new Set(deployStages.map((s: any) => s.lane)).size, 3);

  // Nothing downstream of the break ran.
  const verify = stages.find((s: any) => s.kind === 'verify');
  assert.equal(verify.status, 'skipped');

  assert.equal(diagnosis.category, 'config-drift');
  assert.equal(diagnosis.exonerated, true);
  assert.ok(diagnosis.signals.length >= 3);
  for (const signal of diagnosis.signals) {
    assert.ok(['log', 'history', 'topology', 'diff', 'metrics'].includes(signal.source));
  }

  const rolledBack = deployments.find((d: any) => d.status === 'rolled-back');
  assert.ok(rolledBack, 'the failed region should record a rollback');
  assert.equal(rolledBack.environment.region, 'ap-southeast-2');
});

test('dependsOn always references stages that exist in the same run', async () => {
  const { body } = await get(`${base}/pipeline-runs/2184`);
  const keys = new Set(body.data.stages.map((s: any) => s.key));
  for (const stage of body.data.stages) {
    for (const dependency of stage.dependsOn) {
      assert.ok(keys.has(dependency), `${stage.key} depends on missing ${dependency}`);
    }
  }
});

test('rediagnose recomputes the verdict live and reports what it used', async () => {
  const { status, body } = await get(`${base}/pipeline-runs/2184/rediagnose`);
  assert.equal(status, 200);
  assert.equal(body.data.category, 'config-drift');
  assert.ok(body.data.elapsedMs >= 0);
  assert.equal(body.data.evidenceUsed.siblingRegions, 3);
  assert.ok(body.data.evidenceUsed.logBytes > 0);
});

test('rediagnose declines on a run that did not fail', async () => {
  const { body } = await get(`${base}/pipeline-runs/2180/rediagnose`);
  assert.equal(body.data, null);
  assert.match(body.reason, /did not fail/i);
});

// ---- Filters ----------------------------------------------------

test('run filters narrow results while facets stay stable', async () => {
  const all = await get(`${base}/pipeline-runs`);
  const onMain = await get(`${base}/pipeline-runs?branch=main`);

  assert.ok(onMain.body.data.length < all.body.data.length);
  for (const run of onMain.body.data) assert.equal(run.branch, 'main');

  // Facets come from the unfiltered set, so the filter bar does not
  // collapse as you use it.
  assert.deepEqual(onMain.body.facets.branches, all.body.facets.branches);

  const flakes = await get(`${base}/pipeline-runs?category=flaky-test`);
  assert.ok(flakes.body.data.length >= 1);
  for (const run of flakes.body.data) assert.equal(run.diagnosis.category, 'flaky-test');
});

// ---- Blast radius -----------------------------------------------

test('blast radius walks the reversed import graph across service boundaries', async () => {
  const { status, body } = await get(
    `${base}/blast-radius?files=${encodeURIComponent('packages/core/src/money.ts')}`,
  );
  assert.equal(status, 200);

  const data = body.data;
  assert.ok(data.impacted.length > 20, `expected wide impact, got ${data.impacted.length}`);
  assert.ok(data.services.length >= 3);
  assert.ok(data.endpoints.length > 0);
  assert.equal(data.risk.band, 'critical');
  assert.ok(data.risk.reasons.length >= 3, 'the score must be decomposable');

  // Depth 0 is the diff itself, and layers must be contiguous.
  assert.equal(data.layers[0].depth, 0);
  assert.deepEqual(data.layers[0].paths, ['packages/core/src/money.ts']);
  data.layers.forEach((layer: any, index: number) => assert.equal(layer.depth, index));

  // Every impacted file records a shortest path back to the diff.
  for (const file of data.impacted) {
    assert.equal(file.via[0], 'packages/core/src/money.ts');
    assert.equal(file.via.length, file.depth + 1);
  }
});

test('blast radius respects the depth ceiling', async () => {
  const deep = await get(`${base}/blast-radius?files=packages/core/src/money.ts&depth=4`);
  const shallow = await get(`${base}/blast-radius?files=packages/core/src/money.ts&depth=1`);
  assert.ok(shallow.body.data.impacted.length < deep.body.data.impacted.length);
  assert.ok(Math.max(...shallow.body.data.impacted.map((f: any) => f.depth)) <= 1);
});

test('blast radius reports unknown paths instead of silently dropping them', async () => {
  const { body } = await get(`${base}/blast-radius?files=does/not/exist.ts,packages/core/src/money.ts`);
  assert.deepEqual(body.data.unknown, ['does/not/exist.ts']);
});

test('blast radius rejects an empty file list', async () => {
  const { status } = await get(`${base}/blast-radius?files=`);
  assert.equal(status, 400);
});

// ---- Graph & flakes ---------------------------------------------

test('the graph reports fan-in so hubs can be ranked', async () => {
  const { body } = await get(`${base}/graph`);
  assert.ok(body.data.nodes.length > 40);
  assert.ok(body.data.edges.length > 80);

  const money = body.data.nodes.find((n: any) => n.path === 'packages/core/src/money.ts');
  assert.ok(money.importedBy >= 5, 'the shared money helper should be a hub');
  // Fan-in must agree with the edge list it was derived from.
  const counted = body.data.edges.filter((e: any) => e.target === money.path).length;
  assert.equal(money.importedBy, counted);
});

test('flaky tests expose the cross-branch spread the classifier depends on', async () => {
  const { body } = await get(`${base}/flaky-tests`);
  assert.ok(body.data.length >= 3);
  for (const row of body.data) {
    assert.ok(row.flakeRate > 0 && row.flakeRate < 1);
    assert.equal(row.flakeRate, Math.round((row.failCount / row.runCount) * 10000) / 10000);
    assert.ok(row.distinctBranches >= 1);
  }
  assert.ok(body.stats.estimatedWastedMs > 0);
});

// ---- Boundaries -------------------------------------------------

test('unknown repositories and runs return 404 rather than leaking a shape', async () => {
  assert.equal((await get('http://localhost/api/v1/repositories/nope/delivery-overview')).status, 404);
  assert.equal((await get(`${base}/pipeline-runs/999999`)).status, 404);
});

test('the demo workspace is readable without authentication', async () => {
  // Anyone following a link will not sign in first, so anonymous read
  // access to the demo repository is a product requirement, not an
  // oversight -- pin it.
  for (const url of [
    `${base}/delivery-overview`,
    `${base}/pipeline-runs`,
    `${base}/pipeline-runs/2184`,
    `${base}/graph`,
    `${base}/flaky-tests`,
  ]) {
    assert.equal((await get(url)).status, 200, `${url} must be public`);
  }
});
