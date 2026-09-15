import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelens-accounts-'));
process.env.DATABASE_URL = path.join(directory, 'test.db');
process.env.CODELENS_TEST = 'true';
process.env.AI_PROVIDER = 'demo';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.GITHUB_CLIENT_ID = 'test-client';
process.env.GITHUB_CLIENT_SECRET = 'test-secret';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
await promisify(execFile)(
  process.execPath,
  ['--import', 'tsx', path.join(root, 'packages/db/src/migrate.ts')],
  { cwd: path.join(root, 'apps/api'), env: process.env },
);
const { app } = await import('../index');
const { getDb, schema, eq, githubConnections, repositoryIntegrations, repositoryInvestigations } =
  await import('@codelens/db');
const { seal, unseal } = await import('../services/identity');
const db = getDb(),
  shaA = 'a'.repeat(40),
  shaB = 'b'.repeat(40);
const requests: Array<{ url: string; method: string; body: any; headers: Headers }> = [];
let createdPr: any = null;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input)),
    method = init?.method ?? 'GET',
    body = init?.body ? JSON.parse(String(init.body)) : null;
  requests.push({ url: url.toString(), method, body, headers: new Headers(init?.headers) });
  const reply = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.hostname === 'github.com')
    return reply({ access_token: 'test-github-token', scope: 'repo,workflow,read:user,user:email' });
  const p = decodeURIComponent(url.pathname);
  if (p === '/user')
    return reply({
      id: 765,
      login: 'owner',
      name: 'GitHub Owner',
      avatar_url: 'https://avatars.githubusercontent.com/u/765',
    });
  if (p === '/user/emails') return reply([{ email: 'owner@example.test', verified: true, primary: true }]);
  if (p === '/user/repos')
    return reply([{ full_name: 'owner/project', name: 'project', default_branch: 'trunk', private: true }]);
  if (p === '/repos/owner/project')
    return reply({
      owner: { login: 'owner' },
      name: 'project',
      full_name: 'owner/project',
      clone_url: 'https://github.com/owner/project.git',
      default_branch: 'trunk',
      size: 50,
      private: true,
      language: 'TypeScript',
      description: 'Test repository',
    });
  if (p.endsWith('/branches'))
    return reply([
      { name: 'trunk', commit: { sha: shaA }, protected: true },
      { name: 'feature', commit: { sha: shaB }, protected: false },
    ]);
  if (p.endsWith('/branches/trunk')) return reply({ name: 'trunk', commit: { sha: shaA } });
  if (p.endsWith('/branches/removed')) return reply({ message: 'Not Found' }, 404);
  if (p.endsWith('/commits/trunk')) return reply({ sha: shaA });
  if (p.endsWith('/commits/feature')) return reply({ sha: shaB });
  if (p.includes('/compare/'))
    return reply({
      html_url: 'https://github.com/owner/project/compare/trunk...feature',
      status: 'ahead',
      total_commits: 1,
      ahead_by: 1,
      behind_by: 0,
      files: [
        {
          filename: 'src/app.ts',
          status: 'modified',
          additions: 1,
          deletions: 1,
          patch: '-old\n+new',
          blob_url: 'https://github.com/owner/project/blob/' + shaB + '/src/app.ts',
        },
      ],
    });
  if (p.endsWith('/actions/runs'))
    return reply({
      workflow_runs: [
        {
          id: 123,
          name: 'CI',
          head_branch: 'feature',
          head_sha: shaB,
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/owner/project/actions/runs/123',
          created_at: new Date().toISOString(),
        },
      ],
    });
  if (p.endsWith('/deployments')) return reply([]);
  if (p.endsWith('/dependabot/alerts'))
    return reply([
      {
        number: 1,
        security_advisory: { summary: 'Vulnerable dependency', severity: 'high' },
        dependency: { manifest_path: 'package.json', package: { name: 'example' } },
        security_vulnerability: { first_patched_version: { identifier: '2.0.1' } },
        html_url: 'https://github.com/owner/project/security/dependabot/1',
      },
    ]);
  if (p.endsWith('/code-scanning/alerts')) return reply({ message: 'Resource not accessible' }, 403);
  if (p.endsWith('/secret-scanning/alerts'))
    return reply([
      {
        number: 2,
        secret: 'DO-NOT-RETURN-THIS-SECRET',
        secret_type_display_name: 'Example key',
        html_url: 'https://github.com/owner/project/security/secret-scanning/2',
      },
    ]);
  if (p.endsWith('/pulls') && method === 'GET') return reply(createdPr ? [createdPr] : []);
  if (p.endsWith('/pulls') && method === 'POST') {
    createdPr = { number: 9, html_url: 'https://github.com/owner/project/pull/9' };
    return reply(createdPr, 201);
  }
  if (p.endsWith('/git/ref/heads/trunk')) return reply({ object: { sha: shaA } });
  if (p.includes('/git/ref/heads/codelens/')) return reply({ message: 'Not Found' }, 404);
  if (p.endsWith('/git/commits/' + shaA)) return reply({ sha: shaA, tree: { sha: 'c'.repeat(40) } });
  if (p.endsWith('/git/trees/' + 'c'.repeat(40)))
    return reply({ tree: [{ path: 'src', type: 'tree', mode: '040000', sha: 'e'.repeat(40) }] });
  if (p.endsWith('/git/trees/' + 'e'.repeat(40)))
    return reply({ tree: [{ path: 'app.ts', type: 'blob', mode: '100755', sha: 'f'.repeat(40) }] });
  if (p.endsWith('/git/trees') || p.endsWith('/git/commits') || p.endsWith('/git/refs'))
    return reply({ sha: 'd'.repeat(40) }, 201);
  return reply({ message: `Unmocked ${p}` }, 404);
};
async function request(
  route: string,
  method = 'GET',
  body?: any,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  return app.request('/api/v1' + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
let cookie = '',
  userId = '',
  repoId = '';
test('email registration, cookie sessions, CSRF protection and owner isolation', async () => {
  const register = await request('/auth/register', 'POST', {
    name: 'Owner',
    email: 'owner@example.test',
    password: 'long-test-password-123!',
  });
  assert.equal(register.status, 201);
  cookie = register.headers.get('set-cookie')!.split(';')[0];
  assert.match(register.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(register.headers.get('set-cookie')!, /SameSite=Lax/);
  userId = ((await register.json()) as any).data.user.id;
  assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 200);
  for (const route of ['/services', '/incidents', '/agents', '/evaluations', '/dashboard']) {
    assert.equal((await request(route)).status, 401, `${route} requires a session`);
  }
  assert.equal((await request('/services', 'GET', undefined, cookie)).status, 200);
  assert.equal(
    (await request('/auth/logout', 'POST', {}, cookie, { Origin: 'https://evil.example' })).status,
    403,
  );
  assert.equal((await request('/repositories', 'POST', { fullName: 'owner/project' })).status, 401);
  const connected = await request('/repositories', 'POST', { fullName: 'owner/project' }, cookie);
  assert.equal(connected.status, 201);
  repoId = ((await connected.json()) as any).data.id;
  assert.equal((await request(`/repositories/${repoId}`)).status, 404);
  assert.equal((await request('/repositories')).status, 200);
  assert.equal(((await (await request('/repositories')).json()) as any).data.length, 0);
  const other = await request('/auth/register', 'POST', {
    name: 'Other',
    email: 'other@example.test',
    password: 'another-long-password!',
  });
  const otherCookie = other.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await request(`/repositories/${repoId}`, 'DELETE', undefined, otherCookie)).status, 404);
});
test('OAuth uses PKCE, binds one-time state to the session, and stores encrypted credentials', async () => {
  const start = await request('/auth/github/start?purpose=connect', 'GET', undefined, cookie);
  assert.equal(start.status, 302);
  const target = new URL(start.headers.get('location')!);
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(target.searchParams.get('code_challenge'));
  const state = target.searchParams.get('state')!,
    oauthCookie = start.headers.get('set-cookie')!.split(';')[0];
  const invalid = await request(`/auth/github/callback?state=${state}&code=test`, 'GET', undefined, cookie);
  assert.match(invalid.headers.get('location')!, /oauth_state/);
  const result = await request(
    `/auth/github/callback?state=${state}&code=test`,
    'GET',
    undefined,
    `${cookie}; ${oauthCookie}`,
  );
  assert.equal(result.status, 302);
  assert.match(result.headers.get('location')!, /account\?connected=true/);
  const saved = (await db.select().from(githubConnections).where(eq(githubConnections.userId, userId)))[0];
  assert.notEqual(saved.token, 'test-github-token');
  assert.equal(unseal(saved.token), 'test-github-token');
  assert.ok(
    !(await (
      await request('/auth/status', 'GET', undefined, cookie)
    )
      .text()
      .then((t) => t.includes('test-github-token'))),
  );
  const replay = await request(
    `/auth/github/callback?state=${state}&code=test`,
    'GET',
    undefined,
    `${cookie}; ${oauthCookie}`,
  );
  assert.match(replay.headers.get('location')!, /oauth_expired/);
  assert.ok(requests.find((r) => r.url.includes('access_token'))?.body.code_verifier);
  assert.ok(
    requests
      .filter((r) => r.url.startsWith('https://api.github.com'))
      .every((r) => !r.url.includes('test-github-token')),
  );
});
test('GitHub branch refresh replaces stale metadata and rejects deleted selections', async () => {
  await db
    .update(schema.repositories)
    .set({ defaultBranch: 'nonexistent' })
    .where(eq(schema.repositories.id, repoId));
  const branches = await request(`/repositories/${repoId}/branches`, 'GET', undefined, cookie);
  assert.equal(branches.status, 200);
  assert.equal(((await branches.json()) as any).data.defaultBranch, 'trunk');
  assert.equal(
    (await db.select().from(schema.repositories).where(eq(schema.repositories.id, repoId)))[0].defaultBranch,
    'trunk',
  );
  assert.equal(
    (await request(`/repositories/${repoId}/analyze`, 'POST', { branch: 'removed' }, cookie)).status,
    404,
  );
  assert.equal((await db.select().from(schema.codeAnalysisRuns)).length, 0);
  const activeId = crypto.randomUUID();
  await db.insert(schema.codeAnalysisRuns).values({
    id: activeId,
    repositoryId: repoId,
    branch: 'trunk',
    status: 'pending',
    startedAt: new Date().toISOString(),
  });
  const repeated = await request(`/repositories/${repoId}/analyze`, 'POST', {}, cookie);
  assert.equal(repeated.status, 202);
  assert.equal(((await repeated.json()) as any).data.id, activeId);
  await db
    .update(schema.codeAnalysisRuns)
    .set({ status: 'completed', commitSha: shaA })
    .where(eq(schema.codeAnalysisRuns.id, activeId));
  const matching = await request(`/repositories/${repoId}?branch=trunk`, 'GET', undefined, cookie);
  assert.equal(((await matching.json()) as any).data.snapshot.commitSha, shaA);
  const otherBranch = await request(`/repositories/${repoId}?branch=feature`, 'GET', undefined, cookie);
  const otherData = ((await otherBranch.json()) as any).data;
  assert.equal(otherData.snapshot, null, 'an unindexed branch must not display another branch snapshot');
  assert.equal(otherData.files.length, 0);
  await db.insert(schema.codeAnalysisRuns).values({
    id: crypto.randomUUID(),
    repositoryId: repoId,
    branch: 'feature',
    status: 'completed',
    commitSha: shaB,
    startedAt: new Date(Date.now() + 1000).toISOString(),
  });
  const defaultView = await request(`/repositories/${repoId}`, 'GET', undefined, cookie);
  assert.equal(
    ((await defaultView.json()) as any).data.snapshot.commitSha,
    shaA,
    'opening a repository must show its default branch, even if another branch was indexed more recently',
  );
  const historical = await request(`/repositories/${repoId}?revision=${shaB}`, 'GET', undefined, cookie);
  assert.equal(
    ((await historical.json()) as any).data.snapshot.commitSha,
    shaB,
    'explicit historical revisions remain accessible',
  );
});
test('CI and investigation reports preserve exact revision evidence and unknown permissions', async () => {
  const response = await request(
    `/repositories/${repoId}/investigations`,
    'POST',
    { baseline: 'trunk', candidate: 'feature' },
    cookie,
  );
  assert.equal(response.status, 201);
  const report = ((await response.json()) as any).data;
  assert.equal(report.baseline, shaA);
  assert.equal(report.candidate, shaB);
  assert.equal(report.evidence.checks[0].outcome, 'failed');
  assert.ok(report.evidence.delivery.codeScanning.error);
  assert.ok(!JSON.stringify(report).includes('DO-NOT-RETURN-THIS-SECRET'));
  assert.equal(report.evidence.delivery.recommendations.length, 3);
  assert.equal((await db.select().from(repositoryInvestigations)).length, 1);
});
test('reviewed publishing rejects stale bases and reuses an existing draft on retry', async () => {
  const body = {
    requestId: crypto.randomUUID(),
    title: 'Fix the observed issue',
    baseBranch: 'trunk',
    expectedHead: shaB,
    files: [{ path: 'src/app.ts', content: 'export const fixed = true;' }],
    confirm: true,
  };
  assert.equal((await request(`/repositories/${repoId}/changes/publish`, 'POST', body, cookie)).status, 409);
  body.expectedHead = shaA;
  const posted = await request(`/repositories/${repoId}/changes/publish`, 'POST', body, cookie);
  assert.equal(posted.status, 201);
  assert.equal(
    requests.find((r) => r.method === 'POST' && r.url.endsWith('/git/trees'))?.body.tree[0].mode,
    '100755',
  );
  const repeated = await request(`/repositories/${repoId}/changes/publish`, 'POST', body, cookie);
  assert.equal(repeated.status, 200);
  assert.equal(((await repeated.json()) as any).data.reused, true);
  const writes = requests.filter((r) => r.method === 'POST' && r.url.endsWith('/pulls'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.draft, true);
  assert.equal(
    requests.some((r) => r.method === 'PATCH' && r.url.includes('/git/refs')),
    false,
  );
  assert.equal(
    (
      await request(
        `/repositories/${repoId}/changes/publish`,
        'POST',
        { ...body, files: [{ path: '../escape', content: 'bad' }] },
        cookie,
      )
    ).status,
    400,
  );
});
test('signed webhooks reject mismatches and deduplicate committed deliveries', async () => {
  const secret = 'test-webhook-secret';
  await db
    .insert(repositoryIntegrations)
    .values({ repositoryId: repoId, webhookSecret: seal(secret), updatedAt: new Date().toISOString() });
  const body = { repository: { full_name: 'owner/project' }, action: 'completed' },
    raw = JSON.stringify(body),
    headers = {
      'x-github-event': 'workflow_run',
      'x-github-delivery': crypto.randomUUID(),
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
    };
  assert.equal((await request(`/integrations/github/webhook/${repoId}`, 'POST', body)).status, 401);
  assert.equal(
    (await request(`/integrations/github/webhook/${repoId}`, 'POST', body, undefined, headers)).status,
    202,
  );
  const repeated = await request(`/integrations/github/webhook/${repoId}`, 'POST', body, undefined, headers);
  assert.equal(((await repeated.json()) as any).data.deduplicated, true);
  assert.equal((await db.select().from(schema.githubWebhookEvents)).length, 1);
});
test('repository deletion removes owned snapshots, saved investigations and webhook evidence', async () => {
  const response = await request(`/repositories/${repoId}`, 'DELETE', undefined, cookie);
  assert.equal(response.status, 200);
  assert.equal((await db.select().from(schema.repositories)).length, 0);
  assert.equal((await db.select().from(repositoryInvestigations)).length, 0);
  assert.equal((await db.select().from(schema.codeAnalysisRuns)).length, 0);
  assert.equal((await db.select().from(schema.githubWebhookEvents)).length, 0);
});
test('logout revokes the server session; password login restores access', async () => {
  assert.equal((await request('/auth/logout', 'POST', {}, cookie)).status, 200);
  assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 401);
  assert.equal(
    (await request('/auth/login', 'POST', { email: 'owner@example.test', password: 'incorrect' })).status,
    401,
  );
  const login = await request('/auth/login', 'POST', {
    email: 'owner@example.test',
    password: 'long-test-password-123!',
  });
  assert.equal(login.status, 200);
  assert.ok(login.headers.get('set-cookie'));
});
test('disconnecting repository access preserves GitHub sign-in identity', async () => {
  const login = await request('/auth/login', 'POST', {
    email: 'owner@example.test',
    password: 'long-test-password-123!',
  });
  const current = login.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await request('/integrations/github', 'DELETE', undefined, current)).status, 200);
  const saved = (await db.select().from(githubConnections).where(eq(githubConnections.userId, userId)))[0];
  assert.equal(saved.githubId, '765');
  assert.equal(saved.token, '');
  assert.equal(
    ((await (await request('/auth/status', 'GET', undefined, current)).json()) as any).data.github,
    null,
  );
  const start = await request('/auth/github/start');
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const result = await request(
    `/auth/github/callback?state=${state}&code=again`,
    'GET',
    undefined,
    start.headers.get('set-cookie')!.split(';')[0],
  );
  assert.match(result.headers.get('location')!, /\/repositories$/);
  assert.equal((await db.select().from(schema.users)).length, 2);
  assert.equal((await request('/index', 'POST', { owner: 'owner', repo: 'project' })).status, 401);
});
