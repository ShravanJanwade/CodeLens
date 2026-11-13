// ============================================================
// GitHub Actions ingestion against a whole repository
// ============================================================
// A fake GitHubAccess serves a release workflow with a bake stage and
// three runs: a release a reviewer rejected for one region, a manual
// redeploy of that region at an older commit, and a release that is
// still baking. Checks what the sync stores for each.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelens-sync-'));
process.env.DATABASE_URL = path.join(directory, 'test.db');
process.env.CODELENS_TEST = 'true';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
await promisify(execFile)(
  process.execPath,
  ['--import', 'tsx', path.join(root, 'packages/db/src/migrate.ts')],
  {
    cwd: path.join(root, 'apps/api'),
    env: process.env,
  },
);

const db = await import('@codelens/db');
const sync = await import('./actions-sync');

const REPO = 'sync-test';
const head = '1'.repeat(40);
const old = '2'.repeat(40);
const now = Date.now();
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

const workflow = `name: Deploy
on: { push: { branches: [main] }, workflow_dispatch: { inputs: { target: { type: choice, options: [all, production-eu] }, ref: { type: string } } } }
jobs:
  deploy-staging:
    name: Deploy staging
    environment: staging
  bake:
    name: Bake in staging
    needs: deploy-staging
  deploy-us:
    name: Deploy production-us
    needs: [deploy-staging, bake]
    environment: production-us
  deploy-eu:
    name: Deploy production-eu
    needs: [deploy-staging, bake]
    environment: production-eu
`;

const step = (name: string, conclusion: string | null = 'success') => ({
  name,
  status: conclusion ? 'completed' : 'in_progress',
  conclusion,
  number: 1,
});
const job = (id: number, name: string, status: string, conclusion: string | null, steps = [step('Run')]) => ({
  id,
  name,
  status,
  conclusion,
  started_at: at(20),
  completed_at: conclusion ? at(10) : null,
  labels: ['ubuntu-latest'],
  steps,
});
const run = (id: number, extra: Record<string, unknown>) => ({
  id,
  name: 'Deploy',
  run_number: id - 900,
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  head_branch: 'main',
  head_sha: head,
  path: '.github/workflows/deploy.yml',
  workflow_id: 1,
  html_url: `https://github.com/owner/sync/actions/runs/${id}`,
  created_at: at(30),
  updated_at: at(5),
  run_started_at: at(30),
  actor: { login: 'maintainer' },
  head_commit: { message: 'Ship the spring menu\n\nDetails', author: { name: 'Maintainer' } },
  ...extra,
});

const runs = [
  run(903, {
    status: 'in_progress',
    conclusion: null,
    created_at: at(4),
    run_started_at: at(4),
    updated_at: at(1),
  }),
  run(902, {
    event: 'workflow_dispatch',
    display_title: `Deploy production-eu at ${old}`,
    created_at: at(8),
    run_started_at: at(8),
  }),
  run(901, { conclusion: 'failure', created_at: at(30), run_started_at: at(30) }),
];
const jobs: Record<number, unknown[]> = {
  901: [
    job(1, 'Deploy staging', 'completed', 'success'),
    job(2, 'Bake in staging', 'completed', 'success'),
    job(3, 'Deploy production-us', 'completed', 'success'),
    { ...job(4, 'Deploy production-eu', 'completed', 'failure', []), started_at: null },
  ],
  902: [
    job(5, 'Deploy staging', 'completed', 'skipped', []),
    job(6, 'Bake in staging', 'completed', 'skipped', []),
    job(7, 'Deploy production-us', 'completed', 'skipped', []),
    job(8, 'Deploy production-eu', 'completed', 'success'),
  ],
  903: [
    job(9, 'Deploy staging', 'completed', 'success'),
    job(10, 'Bake in staging', 'in_progress', null, [step('Watch staging', null)]),
    job(11, 'Deploy production-us', 'queued', null, []),
    job(12, 'Deploy production-eu', 'queued', null, []),
  ],
};

const files: Record<string, string> = {
  '.codelens.json': JSON.stringify({ deployConfig: 'config/deploy/{environment}.json' }),
  'config/deploy/staging.json': JSON.stringify({ htmlCacheSeconds: 0, bakeMinutes: 3 }),
  '.github/workflows/deploy.yml': workflow,
};

const access = {
  authenticated: true,
  async json<T>(p: string): Promise<T> {
    const reply = (value: unknown) => value as T;
    if (p === '/repos/owner/sync')
      return reply({ default_branch: 'main', language: 'TypeScript', description: null });
    if (p.startsWith('/repos/owner/sync/actions/workflows'))
      return reply({ workflows: [{ id: 1, name: 'Deploy', path: '.github/workflows/deploy.yml' }] });
    if (p.startsWith('/repos/owner/sync/actions/runs?')) return reply({ workflow_runs: runs });
    const jobsMatch = /\/actions\/runs\/(\d+)\/jobs/.exec(p);
    if (jobsMatch) return reply({ jobs: jobs[Number(jobsMatch[1])] ?? [] });
    if (p === '/repos/owner/sync/actions/runs/901/approvals')
      return reply([
        {
          state: 'approved',
          user: { login: 'maintainer' },
          environments: [{ name: 'production-us' }],
        },
        {
          state: 'rejected',
          comment: 'Not during the sale',
          user: { login: 'maintainer' },
          environments: [{ name: 'production-eu' }],
        },
      ]);
    if (p === `/repos/owner/sync/commits/${old}`)
      return reply({ commit: { message: 'Last good release\n\nbody' }, files: [] });
    if (p.startsWith('/repos/owner/sync/commits/')) return reply({ files: [] });
    if (p.includes('/deployments')) return reply([]);
    if (p.includes('/annotations')) return reply([]);
    throw new Error(`unmocked ${p}`);
  },
  async text() {
    return null;
  },
  async file(_fullName: string, filePath: string) {
    return files[filePath] ?? null;
  },
};

const stamp = new Date().toISOString();
await db.getDb().insert(db.schema.repositories).values({
  id: REPO,
  name: 'sync',
  owner: 'owner',
  fullName: 'owner/sync',
  defaultBranch: 'main',
  createdAt: stamp,
  updatedAt: stamp,
});
const repository = (
  await db.getDb().select().from(db.schema.repositories).where(db.eq(db.schema.repositories.id, REPO))
)[0];
const result = await sync.syncRepository(repository, access);

const runRow = async (id: number) =>
  (
    await db
      .getDb()
      .select()
      .from(db.pipelineRuns)
      .where(db.eq(db.pipelineRuns.id, `${REPO}:run:${id}`))
  )[0];
const stagesOf = async (id: number) =>
  db
    .getDb()
    .select()
    .from(db.pipelineStages)
    .where(db.eq(db.pipelineStages.runId, `${REPO}:run:${id}`));

test('a deploy a reviewer rejected is a decision, not a failure to diagnose', async () => {
  const row = await runRow(901);
  assert.equal(row.status, 'cancelled');
  assert.equal(row.failedStage, null);
  const eu = (await stagesOf(901)).find((s) => s.stageKey === 'deploy-eu')!;
  assert.equal(eu.status, 'cancelled');
  assert.equal(eu.log, 'Deployment to production-eu was rejected by @maintainer: Not during the sale');
  const diagnoses = await db
    .getDb()
    .select()
    .from(db.pipelineDiagnoses)
    .where(db.eq(db.pipelineDiagnoses.runId, `${REPO}:run:901`));
  assert.equal(diagnoses.length, 0);
});

test('a bake stage is verification, and knows its length from the staging settings', async () => {
  const bake = (await stagesOf(901)).find((s) => s.name === 'Bake in staging')!;
  assert.equal(bake.kind, 'verify');
  assert.equal(JSON.parse(bake.summary).bakeMinutes, 3);
});

test('a redeploy records the commit it shipped and the environment it targeted', async () => {
  const row = await runRow(902);
  assert.equal(row.deployTarget, 'production-eu');
  assert.equal(row.commitSha, old);
  assert.equal(row.commitMessage, 'Last good release');
  const deploys = await db
    .getDb()
    .select()
    .from(db.environmentDeployments)
    .where(db.eq(db.environmentDeployments.runId, `${REPO}:run:902`));
  assert.deepEqual(
    deploys.map((d) => [d.environmentId, d.commitSha]),
    [[`${REPO}:env:production-eu`, old]],
  );
});

test('a release still baking is active and has not touched production yet', async () => {
  const row = await runRow(903);
  assert.equal(row.status, 'running');
  assert.equal(result.activeRuns, 1);
  const deploys = await db
    .getDb()
    .select()
    .from(db.environmentDeployments)
    .where(db.eq(db.environmentDeployments.runId, `${REPO}:run:903`));
  assert.deepEqual(
    deploys.map((d) => d.environmentId),
    [`${REPO}:env:staging`],
  );
});
