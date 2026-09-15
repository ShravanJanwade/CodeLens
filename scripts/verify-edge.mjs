import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin = 'http://127.0.0.1:8787';
const { id, report } = JSON.parse(fs.readFileSync('apps/edge/.wrangler/verification.json', 'utf8'));
async function get(path) {
  const response = await fetch(`${origin}/api/v1${path}`);
  assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`);
  return response.json();
}
const fixture = await get('/fixture');
assert.equal(fixture.data.repositoryId, 'taskforge');
const repositories = await get('/repositories');
assert.equal(repositories.data.length, 1);
const repo = await get('/repositories/taskforge');
assert.equal(repo.data.files.length, 4);
const source = await get(
  `/repositories/taskforge/file?revision=${fixture.data.revisions.baseline}&path=src%2Fapp.ts`,
);
assert.ok(source.data.content.includes('startFixture'));
assert.equal((await fetch(`${origin}/api/v1/runner/${id}`, { method: 'POST', body: '{}' })).status, 401);
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer local-verification-only' };
const posted = await fetch(`${origin}/api/v1/runner/${id}`, {
  method: 'POST',
  headers,
  body: JSON.stringify(report),
});
assert.equal(posted.status, 200, await posted.text());
const committed = await get(`/repositories/taskforge/rehearsals/${id}`);
assert.equal(committed.data.status, 'completed');
assert.equal(committed.data.attempts.length, report.attempts.length);
const repeated = await fetch(`${origin}/api/v1/runner/${id}`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ ...report, status: 'failed', attempts: [] }),
});
assert.equal(repeated.status, 200);
assert.equal((await get(`/repositories/taskforge/rehearsals/${id}`)).data.status, 'completed');
assert.equal((await fetch(`${origin}/api/v1/repositories/another/rehearsals/${id}`)).status, 404);
const downloaded = await get(`/repositories/taskforge/rehearsals/${id}/report`);
assert.equal(downloaded.id, id);
assert.ok(downloaded.attempts.every((a) => a.status !== 'completed' || a.evidence));
const findings = await get('/repositories/taskforge/findings');
assert.ok(findings.data.length > 0);
console.log(
  JSON.stringify({
    passed: 10,
    checks: [
      'fixture catalog',
      'repository catalog',
      'source inspection',
      'callback authentication',
      'checkpoint import',
      'immutable completed results',
      'repository isolation',
      'report download',
      'finding retrieval',
      'actual D1 persistence',
    ],
    runId: id,
  }),
);
