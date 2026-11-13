// ============================================================
// Pipeline actions: access, re-runs, redeploys, approvals, fixes
// ============================================================
// GitHub is mocked at fetch. Two people sign in: a maintainer whose
// token GitHub says can push, and a visitor who can only read. The
// repository has no CodeLens owner, like the public live example, so
// GitHub's answer is the only thing standing between a request and
// the pipeline.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelens-actions-'));
process.env.DATABASE_URL = path.join(directory, 'test.db');
process.env.CODELENS_TEST = 'true';
process.env.AI_PROVIDER = 'demo';
process.env.APP_ORIGIN = 'http://localhost:3000';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
await promisify(execFile)(
  process.execPath,
  ['--import', 'tsx', path.join(root, 'packages/db/src/migrate.ts')],
  {
    cwd: path.join(root, 'apps/api'),
    env: process.env,
  },
);

const { app } = await import('../index');
const db = await import('@codelens/db');
const { seal } = await import('../services/identity');
const { clearAccessCache, dispatchInputsOf } = await import('../services/delivery-actions');
const { addKeys, quarantine } = await import('../services/fix-pull-requests');
const { redeployOf } = await import('../services/actions-sync');

const REPO = 'live-test';
const shaMain = 'a'.repeat(40);
const shaGood = 'b'.repeat(40);
const shaBad = 'c'.repeat(40);
const now = new Date().toISOString();

const workflow = `name: Deploy
run-name: x
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      target:
        type: choice
        options: [all, staging, production-us, production-eu]
      ref:
        type: string
jobs:
  deploy-eu:
    environment: production-eu
    runs-on: ubuntu-latest
    steps: [{ run: echo }]
`;
const files: Record<string, string> = {
  '.codelens.json': JSON.stringify({ deployConfig: 'config/deploy/{environment}.json' }),
  'config/deploy/production-us.json':
    '{\n  "htmlCacheSeconds": 300,\n  "assetCacheSeconds": 86400,\n  "catalogCacheSeconds": 60\n}\n',
  'config/deploy/production-eu.json': '{\n  "htmlCacheSeconds": 300,\n  "assetCacheSeconds": 86400\n}\n',
  'packages/pricing/test/coupons.test.ts': [
    "describe('coupon codes', () => {",
    "  it('issues unique codes for a newsletter-sized campaign', () => {",
    '    expect(1).toBe(1);',
    '  });',
    '});',
    '',
  ].join('\n'),
  '.github/workflows/deploy.yml': workflow,
};

type Call = { method: string; path: string; body: any; token: string | null };
const calls: Call[] = [];
let pending = [
  {
    environment: { id: 11, name: 'production-us' },
    wait_timer: 0,
    wait_timer_started_at: null,
    current_user_can_approve: true,
    reviewers: [{ type: 'User', reviewer: { login: 'maintainer' } }],
  },
];
let createdPr: any = null;

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  const token = headers.get('authorization')?.replace(/^Bearer /, '') ?? null;
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const p = decodeURIComponent(url.pathname);
  calls.push({ method, path: p, body, token });
  const reply = (data: unknown, status = 200) =>
    new Response(data === undefined ? null : JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const repo = '/repos/owner/live';
  if (p === repo)
    return reply({
      full_name: 'owner/live',
      permissions:
        token === 'maintainer-token'
          ? { admin: false, maintain: false, push: true, triage: true, pull: true }
          : { pull: true },
    });
  if (p.startsWith(`${repo}/contents/`)) {
    const file = p.slice(`${repo}/contents/`.length);
    return files[file] !== undefined
      ? reply({ content: Buffer.from(files[file]).toString('base64'), encoding: 'base64' })
      : reply({ message: 'Not Found' }, 404);
  }
  if (p === `${repo}/actions/runs/500/rerun-failed-jobs` && method === 'POST') return reply(undefined, 201);
  if (p === `${repo}/actions/runs/500/rerun` && method === 'POST') return reply(undefined, 201);
  if (p === `${repo}/actions/jobs/9001/rerun` && method === 'POST') return reply(undefined, 201);
  if (p === `${repo}/actions/workflows/deploy.yml/dispatches` && method === 'POST')
    return reply(undefined, 204);
  if (p === `${repo}/actions/runs/501/pending_deployments`)
    return method === 'POST'
      ? reply([])
      : reply(
          token === 'maintainer-token'
            ? pending
            : pending.map((g) => ({ ...g, current_user_can_approve: false })),
        );
  if (p === `${repo}/git/ref/heads/main`) return reply({ object: { sha: shaMain } });
  if (p.startsWith(`${repo}/git/ref/heads/codelens/`)) return reply({ message: 'Not Found' }, 404);
  if (p === `${repo}/git/commits/${shaMain}`) return reply({ sha: shaMain, tree: { sha: 'd'.repeat(40) } });
  if (p.startsWith(`${repo}/git/trees/`) && method === 'GET') return reply({ tree: [] });
  if (p === `${repo}/git/trees` || p === `${repo}/git/commits` || p === `${repo}/git/refs`)
    return reply({ sha: 'e'.repeat(40) }, 201);
  if (p === `${repo}/pulls` && method === 'GET') return reply(createdPr ? [createdPr] : []);
  if (p === `${repo}/pulls` && method === 'POST') {
    createdPr = { number: 42, html_url: 'https://github.com/owner/live/pull/42' };
    return reply(createdPr, 201);
  }
  return reply({ message: `Unmocked ${method} ${p}` }, 404);
};

async function request(
  route: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  extra: Record<string, string> = {},
) {
  const response = await app.request('/api/v1' + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as any };
}

async function signUp(name: string, token: string) {
  const response = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email: `${name}@example.test`, password: 'a-long-test-password-123' }),
  });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const userId = ((await response.json()) as any).data.user.id;
  await db
    .getDb()
    .insert(db.githubConnections)
    .values({
      userId,
      githubId: `${name}-id`,
      login: name,
      token: seal(token),
      scopes: 'repo,workflow,read:user',
      updatedAt: now,
    });
  return cookie;
}

// ---- Fixture ----------------------------------------------------------

const d = db.getDb();
await d.insert(db.schema.repositories).values({
  id: REPO,
  name: 'live',
  owner: 'owner',
  fullName: 'owner/live',
  defaultBranch: 'main',
  createdAt: now,
  updatedAt: now,
});
await d.insert(db.pipelines).values({
  id: `${REPO}:wf:1`,
  repositoryId: REPO,
  name: 'Deploy',
  filePath: '.github/workflows/deploy.yml',
  createdAt: now,
});
for (const [name, region] of [
  ['production-us', 'westus2'],
  ['production-eu', 'francecentral'],
]) {
  await d.insert(db.environments).values({
    id: `${REPO}:env:${name}`,
    repositoryId: REPO,
    name,
    tier: 'production',
    region,
    regionLabel: region,
    provider: 'azure',
    cluster: 'static',
    currentCommitSha: shaGood,
    createdAt: now,
  });
}
const runRow = (
  runNumber: number,
  status: 'failed' | 'blocked' | 'success',
  sha: string,
  failedStage: string | null,
) => ({
  id: `${REPO}:run:${runNumber}`,
  repositoryId: REPO,
  pipelineId: `${REPO}:wf:1`,
  runNumber,
  displayNumber: runNumber - 490,
  externalUrl: `https://github.com/owner/live/actions/runs/${runNumber}`,
  branch: 'main',
  targetTier: 'production',
  commitSha: sha,
  commitMessage: `Run ${runNumber}`,
  commitAuthor: 'Maintainer',
  trigger: 'push' as const,
  status,
  startedAt: new Date(Date.now() - (600 - runNumber) * 60_000).toISOString(),
  completedAt: status === 'blocked' ? null : now,
  actor: 'maintainer',
  failedStage,
  createdAt: now,
});
await d
  .insert(db.pipelineRuns)
  .values([
    runRow(500, 'failed', shaBad, 'deploy-eu'),
    runRow(501, 'blocked', shaMain, null),
    runRow(502, 'success', shaGood, null),
  ]);
await d.insert(db.pipelineStages).values({
  id: `${REPO}:run:500:deploy-eu`,
  runId: `${REPO}:run:500`,
  stageKey: 'deploy-eu',
  name: 'Deploy production-eu',
  kind: 'deploy',
  sequence: 1,
  environmentId: `${REPO}:env:production-eu`,
  status: 'failed',
  summary: JSON.stringify({
    githubJobId: 9001,
    evidence: {
      configDrift: [{ key: 'catalogCacheSeconds', expected: 'set (as in production-us)', actual: 'absent' }],
    },
  }),
});
await d.insert(db.environmentDeployments).values({
  id: `${REPO}:run:502:deploy-eu:deploy`,
  environmentId: `${REPO}:env:production-eu`,
  runId: `${REPO}:run:502`,
  version: shaGood.slice(0, 7),
  commitSha: shaGood,
  strategy: 'recreate',
  status: 'live',
  healthCheck: 'passing',
  actor: 'maintainer',
  startedAt: now,
  completedAt: now,
});
await d.insert(db.flakyTests).values([
  {
    id: `${REPO}:flake:coupon`,
    repositoryId: REPO,
    testName: 'coupon codes > issues unique codes for a newsletter-sized campaign',
    filePath: 'packages/pricing/test/coupons.test.ts',
    suite: 'coupon codes',
    runCount: 28,
    failCount: 4,
    flakeRate: 4 / 28,
    distinctBranches: 3,
    firstSeenAt: now,
  },
  {
    id: `${REPO}:flake:tiers`,
    repositoryId: REPO,
    testName: 'applyDiscounts > gives fifteen percent off a line of six or more',
    filePath: 'packages/pricing/test/discounts.test.ts',
    suite: 'applyDiscounts',
    runCount: 20,
    failCount: 1,
    flakeRate: 0.05,
    distinctBranches: 1,
    firstSeenAt: now,
  },
]);

const maintainer = await signUp('maintainer', 'maintainer-token');
const visitor = await signUp('visitor', 'visitor-token');
const githubPosts = () => calls.filter((c) => c.method === 'POST' && c.path.startsWith('/repos/'));

// ---- Access -----------------------------------------------------------

test('only a signed-in maintainer, as GitHub sees them, can act', async () => {
  clearAccessCache();
  const anonymous = await request(`/repositories/${REPO}/actions/access`);
  assert.equal(anonymous.body.data.canAct, false);
  assert.match(anonymous.body.data.reason, /Sign in with GitHub/);

  const reader = await request(`/repositories/${REPO}/actions/access`, 'GET', undefined, visitor);
  assert.equal(reader.body.data.permission, 'read');
  assert.equal(reader.body.data.canAct, false);
  assert.match(reader.body.data.reason, /can't write/);

  const writer = await request(`/repositories/${REPO}/actions/access`, 'GET', undefined, maintainer);
  assert.equal(writer.body.data.permission, 'write');
  assert.equal(writer.body.data.canAct, true);
});

test('re-runs refuse visitors and cross-site requests, and go to GitHub as the maintainer', async () => {
  clearAccessCache();
  const before = githubPosts().length;
  assert.equal(
    (await request(`/repositories/${REPO}/actions/rerun`, 'POST', { runNumber: 500, mode: 'failed' })).status,
    401,
  );
  assert.equal(
    (
      await request(
        `/repositories/${REPO}/actions/rerun`,
        'POST',
        { runNumber: 500, mode: 'failed' },
        visitor,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/repositories/${REPO}/actions/rerun`,
        'POST',
        { runNumber: 500, mode: 'failed' },
        maintainer,
        {
          Origin: 'https://evil.example',
        },
      )
    ).status,
    403,
  );
  assert.equal(githubPosts().length, before, 'nothing reached GitHub');

  const failed = await request(
    `/repositories/${REPO}/actions/rerun`,
    'POST',
    { runNumber: 500, mode: 'failed' },
    maintainer,
  );
  assert.equal(failed.status, 202, JSON.stringify(failed.body));
  const call = githubPosts().at(-1)!;
  assert.equal(call.path, '/repos/owner/live/actions/runs/500/rerun-failed-jobs');
  assert.equal(call.token, 'maintainer-token');

  const job = await request(
    `/repositories/${REPO}/actions/rerun`,
    'POST',
    { runNumber: 500, mode: 'job', stageKey: 'deploy-eu' },
    maintainer,
  );
  assert.equal(job.status, 202);
  assert.equal(githubPosts().at(-1)!.path, '/repos/owner/live/actions/jobs/9001/rerun');

  const busy = await request(
    `/repositories/${REPO}/actions/rerun`,
    'POST',
    { runNumber: 501, mode: 'all' },
    maintainer,
  );
  assert.equal(busy.status, 409, 'a run still in progress cannot be re-run');
});

test('redeploy dispatches the deploy workflow for one environment at a known-good commit', async () => {
  clearAccessCache();
  const releases = await request(`/repositories/${REPO}/environments/production-eu/releases`);
  assert.equal(releases.status, 200);
  assert.equal(releases.body.data.releases[0].commitSha, shaGood);
  assert.equal(releases.body.data.releases[0].current, true);

  const unknown = await request(
    `/repositories/${REPO}/actions/redeploy`,
    'POST',
    { environment: 'production-eu', commitSha: shaBad },
    maintainer,
  );
  assert.equal(unknown.status, 409, 'only a commit that deployed there before');

  const ok = await request(
    `/repositories/${REPO}/actions/redeploy`,
    'POST',
    { environment: 'production-eu', commitSha: shaGood },
    maintainer,
  );
  assert.equal(ok.status, 202, JSON.stringify(ok.body));
  const dispatch = githubPosts().at(-1)!;
  assert.equal(dispatch.path, '/repos/owner/live/actions/workflows/deploy.yml/dispatches');
  assert.deepEqual(dispatch.body, { ref: 'main', inputs: { target: 'production-eu', ref: shaGood } });

  // A workflow without the inputs gets an explanation, not a GitHub 422.
  files['.github/workflows/deploy.yml'] = 'on: { workflow_dispatch: {} }\njobs: {}\n';
  const unsupported = await request(
    `/repositories/${REPO}/actions/redeploy`,
    'POST',
    { environment: 'production-eu', commitSha: shaGood },
    maintainer,
  );
  assert.equal(unsupported.status, 422);
  assert.match(unsupported.body.error.message, /"target" and "ref" inputs/);
  files['.github/workflows/deploy.yml'] = workflow;
});

test('approval gates show who can approve and pass the decision to GitHub', async () => {
  clearAccessCache();
  const seen = await request(`/repositories/${REPO}/pipeline-runs/501/gates`, 'GET', undefined, visitor);
  assert.equal(seen.body.data[0].environment, 'production-us');
  assert.equal(seen.body.data[0].canApprove, false);

  const gates = await request(`/repositories/${REPO}/pipeline-runs/501/gates`, 'GET', undefined, maintainer);
  assert.equal(gates.body.data[0].canApprove, true);

  const approved = await request(
    `/repositories/${REPO}/actions/review`,
    'POST',
    { runNumber: 501, environments: ['production-us'], decision: 'approved' },
    maintainer,
  );
  assert.equal(approved.status, 202, JSON.stringify(approved.body));
  const post = githubPosts().at(-1)!;
  assert.equal(post.path, '/repos/owner/live/actions/runs/501/pending_deployments');
  assert.deepEqual(post.body.environment_ids, [11]);
  assert.equal(post.body.state, 'approved');

  pending = [{ ...pending[0], current_user_can_approve: false }];
  const refused = await request(
    `/repositories/${REPO}/actions/review`,
    'POST',
    { runNumber: 501, environments: ['production-us'], decision: 'approved' },
    maintainer,
  );
  assert.equal(refused.status, 403);
});

test('a config drift fix copies the missing key from the healthy sibling and opens a pull request', async () => {
  clearAccessCache();
  const preview = await request(`/repositories/${REPO}/fixes/preview?kind=config-drift&runNumber=500`);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const change = preview.body.data.changes[0];
  assert.equal(change.path, 'config/deploy/production-eu.json');
  assert.equal(
    change.after,
    '{\n  "htmlCacheSeconds": 300,\n  "assetCacheSeconds": 86400,\n  "catalogCacheSeconds": 60\n}\n',
  );
  assert.equal(preview.body.data.title, 'Add catalogCacheSeconds to production-eu deploy settings');

  const stale = await request(
    `/repositories/${REPO}/actions/fix`,
    'POST',
    { kind: 'config-drift', runNumber: 500, baseSha: 'f'.repeat(40) },
    maintainer,
  );
  assert.equal(stale.status, 409, 'main moved since the preview');

  const opened = await request(
    `/repositories/${REPO}/actions/fix`,
    'POST',
    { kind: 'config-drift', runNumber: 500, baseSha: shaMain },
    maintainer,
  );
  assert.equal(opened.status, 201, JSON.stringify(opened.body));
  assert.equal(opened.body.data.url, 'https://github.com/owner/live/pull/42');
  const pr = calls.filter((c) => c.path === '/repos/owner/live/pulls' && c.method === 'POST').at(-1)!;
  assert.equal(pr.body.base, 'main');
  assert.match(pr.body.head, /^codelens\/fix-production-eu-/);
  assert.match(pr.body.body, /catalogCacheSeconds/);
  createdPr = null;
});

test('a known flaky test can be quarantined; a one-off failure cannot', async () => {
  clearAccessCache();
  const preview = await request(
    `/repositories/${REPO}/fixes/preview?kind=quarantine-test&test=${encodeURIComponent('coupon codes > issues unique codes for a newsletter-sized campaign')}`,
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const after: string = preview.body.data.changes[0].after;
  assert.match(after, /\n {2}\/\/ Quarantined by CodeLens: failed 4 of 28 runs \(14%\) on 3 branches\./);
  assert.match(after, /\n {2}it\.skip\('issues unique codes for a newsletter-sized campaign'/);

  const oneOff = await request(
    `/repositories/${REPO}/fixes/preview?kind=quarantine-test&test=${encodeURIComponent('applyDiscounts > gives fifteen percent off a line of six or more')}`,
  );
  assert.equal(oneOff.status, 409);
});

test('the action log records who did what, including refusals by GitHub', async () => {
  const log = await request(`/repositories/${REPO}/actions`);
  assert.equal(log.status, 200);
  const kinds = log.body.data.map((a: any) => `${a.kind}:${a.outcome}`);
  for (const expected of [
    'rerun-failed:requested',
    'rerun-job:requested',
    'redeploy:requested',
    'approve:requested',
    'approve:failed',
    'fix-pr:requested',
  ])
    assert.ok(kinds.includes(expected), `${expected} in ${kinds.join(', ')}`);
  assert.ok(log.body.data.every((a: any) => a.githubLogin === 'maintainer'));
});

test('the flaky registry separates known flakes from tests that failed for a reason', async () => {
  const flakes = await request(`/repositories/${REPO}/flaky-tests`);
  assert.equal(flakes.status, 200);
  assert.equal(flakes.body.stats.total, 1);
  assert.equal(flakes.body.stats.otherFailing, 1);
  const byName = new Map(flakes.body.data.map((t: any) => [t.testName, t]));
  assert.equal(
    (byName.get('coupon codes > issues unique codes for a newsletter-sized campaign') as any).status,
    'flaky',
  );
  assert.equal(
    (byName.get('applyDiscounts > gives fifteen percent off a line of six or more') as any).reason,
    'Failed once',
  );
});

// ---- Pure helpers -------------------------------------------------------

test('addKeys keeps the file layout and places a key where its sibling has it', () => {
  const peer = { a: 1, b: 2, c: 3 };
  assert.equal(
    addKeys('{\n    "a": 1,\n    "c": 3\n}', peer, ['b']).after,
    '{\n    "a": 1,\n    "b": 2,\n    "c": 3\n}',
  );
  assert.equal(addKeys('{\n  "c": 3\n}\n', peer, ['a']).after, '{\n  "c": 3,\n  "a": 1\n}\n');
});

test('quarantine marks exactly one declaration and refuses ambiguity', () => {
  const text = "test('flaky', async () => {});\n";
  assert.equal(quarantine(text, 'flaky', 'note'), "// note\ntest.skip('flaky', async () => {});\n");
  assert.throws(() => quarantine("it.skip('flaky', () => {});", 'flaky', 'note'), /already skipped/);
  assert.throws(() => quarantine("it('flaky', a);\nit('flaky', b);", 'flaky', 'note'), /more than once/);
  assert.throws(() => quarantine("it('other', a);", 'flaky', 'note'), /could not find/);
});

test('a redeploy run is recognised by its title, and a full release is not', () => {
  assert.deepEqual(
    redeployOf({ event: 'workflow_dispatch', display_title: `Deploy production-eu at ${shaGood}` }),
    { target: 'production-eu', sha: shaGood },
  );
  assert.equal(redeployOf({ event: 'workflow_dispatch', display_title: `Deploy all at ${shaGood}` }), null);
  assert.equal(redeployOf({ event: 'push', display_title: `Deploy production-eu at ${shaGood}` }), null);
});

test('dispatch inputs are read from the workflow file', () => {
  assert.deepEqual(dispatchInputsOf(workflow), {
    target: ['all', 'staging', 'production-us', 'production-eu'],
    ref: true,
  });
  assert.equal(dispatchInputsOf('on: push\njobs: {}'), null);
});
