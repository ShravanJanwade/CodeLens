import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'codelens-verification-'));
process.env.DATABASE_URL = path.join(testDirectory, 'test.db');
process.env.AI_PROVIDER = 'demo';
// This suite asserts SQLite fixture behavior and must not inherit a user's optional PostgreSQL target.
process.env.TASKFORGE_DATABASE_URL = '';
process.env.PLAYWRIGHT_JOURNEYS = 'false';
process.env.CODELENS_TEST = 'true';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
await promisify(execFile)(
  process.execPath,
  ['--import', 'tsx', path.join(root, 'packages/db/src/migrate.ts')],
  { cwd: path.join(root, 'apps/api'), env: process.env },
);
const { getDb, schema, eq, and, rehearsalRuns, rehearsalAttempts } = await import('@codelens/db');
const { prepareFixture } = await import('./fixture');
const { createRun, workerTick, runDetail, cancelRun } = await import('./runner');
const { measure, compare, percentile } = await import('./measure');
const { snapshot, selectSources, selectedCodeSources, validateCitations } =
  await import('../services/snapshots');
const { parseSource } = await import('../services/source-parser');
const { analyzeRepository } = await import('../services/analyzer');
const { app } = await import('../index');
const db = getDb();
const fixture = await prepareFixture();

test('AI selection uses exact indexed file lines and rejects missing or invalid context', async () => {
  const indexed = await snapshot('taskforge', fixture.revisions.baseline);
  const file = indexed.files.find((f) => f.path === 'src/app.ts')!;
  const sources = selectedCodeSources(indexed.files, { path: file.path, startLine: 2, endLine: 4 });
  assert.equal(
    sources[0].content,
    file.content
      .split('\n')
      .slice(1, 4)
      .map((line, i) => `${i + 2}: ${line}`)
      .join('\n'),
  );
  assert.equal(
    selectedCodeSources(indexed.files, { path: file.path })[0].endLine,
    file.content.split('\n').length,
  );
  assert.throws(() => selectedCodeSources(indexed.files, { path: 'missing.ts' }), /not in/);
  assert.throws(
    () => selectedCodeSources(indexed.files, { path: file.path, startLine: 0, endLine: 4 }),
    /valid line/,
  );
  assert.throws(
    () => selectedCodeSources(indexed.files, { path: file.path, startLine: 1, endLine: 999999 }),
    /valid line/,
  );
  const response = await app.request('/api/v1/repositories/taskforge/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Explain this code',
      revision: fixture.revisions.baseline,
      selection: { path: file.path, startLine: 2, endLine: 4 },
    }),
  });
  assert.equal(response.status, 200);
  const result = (await response.json()) as any;
  assert.equal(result.data.provider, 'demo');
  assert.equal(result.data.sources[0].startLine, 2);
  assert.equal(result.data.sources[0].endLine, 4);
  assert.ok(result.data.fallbackReason);
  const invalid = await app.request('/api/v1/repositories/taskforge/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Explain', selection: { path: 'missing.ts' } }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(validateCitations('README.md:2', [{ path: 'README.md', startLine: 1, endLine: 4 }]), true);
});

test('compiler parsing ignores fake declarations in comments and resolves imports', () => {
  const result = parseSource(
    '// function invented() {}\nimport {readFile} from "node:fs";\nexport function actual() { return 1; }',
    'test.ts',
  );
  assert.equal(result.method, 'TypeScript compiler AST');
  assert.equal(
    result.symbols.some((s) => s.name === 'invented'),
    false,
  );
  assert.equal(result.symbols.find((s) => s.name === 'actual')?.line, 3);
  assert.deepEqual(result.imports, ['node:fs']);
  assert.equal(
    validateCitations('See src/app.ts:7', [{ path: 'src/app.ts', startLine: 1, endLine: 10 }]),
    true,
  );
  assert.equal(
    validateCitations('See invented.ts:7', [{ path: 'src/app.ts', startLine: 1, endLine: 10 }]),
    false,
  );
  assert.equal(
    validateCitations('See src/app.ts:70', [{ path: 'src/app.ts', startLine: 1, endLine: 10 }]),
    false,
  );
});
test('revision snapshots are immutable, repeatable, and source citations resolve', async () => {
  const before = await snapshot('taskforge', fixture.revisions.baseline);
  assert.match(before.selected!.commitSha!, /^[a-f0-9]{40}$/);
  assert.ok(before.files.length > 0);
  const candidate = await snapshot('taskforge', fixture.revisions.defective);
  assert.notEqual(candidate.selected?.commitSha, before.selected?.commitSha);
  assert.match(before.files.find((f) => f.path === 'src/revision.ts')!.content, /'baseline'/);
  assert.match(candidate.files.find((f) => f.path === 'src/revision.ts')!.content, /'defective'/);
  const id = randomUUID();
  await db.insert(schema.codeAnalysisRuns).values({
    id,
    repositoryId: 'taskforge',
    branch: 'baseline',
    status: 'pending',
    startedAt: new Date().toISOString(),
  });
  await analyzeRepository('taskforge', id, '', {
    directory: fixture.directory,
    revision: fixture.revisions.baseline,
  });
  const after = await snapshot('taskforge', fixture.revisions.baseline);
  assert.equal(after.files.length, before.files.length);
  assert.deepEqual(
    after.files.map((f) => f.contentHash),
    before.files.map((f) => f.contentHash),
  );
  assert.equal(
    (await snapshot('taskforge', fixture.revisions.defective)).files.length,
    candidate.files.length,
  );
  const sources = selectSources(after.files, 'project membership');
  for (const source of sources) {
    const file = after.files.find((f) => f.path === source.path)!;
    assert.ok(file);
    assert.ok(source.startLine >= 1 && source.endLine <= file.content.split('\n').length);
  }
  const response = await app.request('/api/v1/repositories/taskforge/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Where is membership checked?', revision: fixture.revisions.baseline }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as any;
  assert.equal(body.data.revision, fixture.revisions.baseline);
  assert.ok(body.data.sources.every((s: any) => after.files.some((f) => f.path === s.path)));
  assert.equal(body.data.fallback, true);
});
test('actual HTTP/database measurements detect functional/query regressions and reevaluate correction', async () => {
  const baseline = await measure('baseline');
  const defective = await measure('defective');
  const corrected = await measure('corrected');
  assert.ok(baseline.checks.filter((c) => !c.name.includes('latency')).every((c) => c.outcome === 'passed'));
  assert.equal(defective.checks.find((c) => c.name.startsWith('Non-member'))?.outcome, 'failed');
  assert.equal(defective.checks.find((c) => c.name === 'Issue listing query budget')?.actual, '22');
  assert.equal(corrected.checks.find((c) => c.name.startsWith('Non-member'))?.outcome, 'passed');
  assert.equal(corrected.checks.find((c) => c.name === 'Issue listing query budget')?.actual, '2');
  assert.equal(
    compare(baseline, baseline).find((c) => c.name === 'p95 latency regression')?.outcome,
    'passed',
  );
  assert.ok(defective.repetitions.every((r) => r.durationMs > 0 && r.throughput > 0 && r.requests === 16));
  assert.ok(defective.traces.some((t) => t.queries.length === 22));
  const heldout = await measure('corrected', { pageSize: 10 });
  assert.ok(heldout.checks.filter((c) => !c.name.includes('latency')).every((c) => c.outcome === 'passed'));
  console.log('Measured queries/request:', {
    baseline: baseline.repetitions[0].maxQueries,
    defective: defective.repetitions[0].maxQueries,
    corrected: corrected.repetitions[0].maxQueries,
  });
});
test('mixed timing results remain inconclusive; percentile uses observations', async () => {
  assert.equal(percentile([1, 2, 3, 4, 100], 0.95), 100);
  const base = { checks: [], repetitions: [{ p95Ms: 10 }, { p95Ms: 10 }] } as any;
  const mixed = { checks: [], repetitions: [{ p95Ms: 20 }, { p95Ms: 9 }] } as any;
  assert.equal(compare(base, mixed).at(-1)?.outcome, 'inconclusive');
});
test('idempotency, interrupted recovery and result commits survive retry', async () => {
  const input = {
    baseline: 'baseline',
    candidate: 'defective',
    correction: 'corrected',
    idempotencyKey: randomUUID(),
  };
  const run = await createRun('taskforge', input);
  assert.equal((await createRun('taskforge', input)).id, run.id);
  await assert.rejects(
    createRun('taskforge', { ...input, candidate: 'baseline' }),
    /different configuration/,
  );
  await workerTick('baseline');
  const interrupted = await runDetail(run.id);
  assert.equal(interrupted?.status, 'interrupted');
  const baseline = interrupted!.attempts.find((a) => a.stage === 'baseline');
  assert.equal(baseline?.status, 'completed');
  await workerTick();
  const completed = await runDetail(run.id);
  assert.equal(completed?.status, 'completed');
  assert.equal(completed!.attempts.filter((a) => a.stage === 'baseline').length, 1);
  assert.equal(completed!.attempts.find((a) => a.stage === 'baseline')?.id, baseline?.id);
  assert.ok(completed!.findings.length >= 2);
  assert.ok(
    completed!.findings.every((f) =>
      f.evidenceIds.every((id: string) =>
        completed!.attempts.some((a) => a.id === id && a.status === 'completed'),
      ),
    ),
  );
  await workerTick();
  assert.equal((await runDetail(run.id))!.attempts.length, completed!.attempts.length);
});
test('expired lease reruns incomplete stage; cancellation preserves evidence and cleans environments', async () => {
  const run = await createRun('taskforge', {
    baseline: 'baseline',
    candidate: 'baseline',
    correction: null,
    idempotencyKey: randomUUID(),
  });
  await db
    .update(rehearsalRuns)
    .set({ owner: 'dead-worker', leaseUntil: Date.now() - 100, status: 'testing' })
    .where(eq(rehearsalRuns.id, run.id));
  await db.insert(rehearsalAttempts).values({
    id: randomUUID(),
    runId: run.id,
    stage: 'baseline',
    attempt: 1,
    status: 'running',
    startedAt: new Date().toISOString(),
  });
  await workerTick('baseline');
  const recovered = await runDetail(run.id);
  assert.equal(recovered!.attempts.find((a) => a.attempt === 1)?.status, 'interrupted');
  assert.equal(recovered!.attempts.find((a) => a.attempt === 2)?.status, 'completed');
  await cancelRun(run.id);
  await workerTick();
  assert.equal((await runDetail(run.id))!.status, 'cancelled');
  assert.equal((await runDetail(run.id))!.attempts.filter((a) => a.status === 'completed').length, 1);
  const queued = await createRun('taskforge', {
    baseline: 'baseline',
    candidate: 'baseline',
    correction: null,
    idempotencyKey: randomUUID(),
  });
  await cancelRun(queued.id);
  await workerTick();
  assert.equal((await runDetail(queued.id))?.status, 'cancelled');
  const { startFixture } = await import('@codelens/taskforge');
  const fixtureApp = await startFixture('baseline');
  const url = fixtureApp.url;
  await fixtureApp.close();
  await assert.rejects(fetch(url, { signal: AbortSignal.timeout(1000) }));
});
test('public executor rejects arbitrary commands, targets and mismatched repository/run IDs', async () => {
  await assert.rejects(
    createRun('another-repository', {
      baseline: 'baseline',
      candidate: 'baseline',
      idempotencyKey: randomUUID(),
    }),
    /Only the prepared/,
  );
  await assert.rejects(
    createRun('taskforge', {
      baseline: 'baseline',
      candidate: 'baseline',
      idempotencyKey: randomUUID(),
      command: 'echo unsafe',
    }),
    /Unknown configuration/,
  );
  await assert.rejects(
    createRun('taskforge', {
      baseline: 'https://example.com',
      candidate: 'baseline',
      idempotencyKey: randomUUID(),
    }),
    /Select supported/,
  );
  const run = (await db.select().from(rehearsalRuns))[0];
  assert.equal((await app.request(`/api/v1/repositories/another/rehearsals/${run.id}`)).status, 404);
});

test('active cancellation reaches a terminal state without unfinished committed measurements', async () => {
  const run = await createRun('taskforge', {
    baseline: 'baseline',
    candidate: 'defective',
    correction: null,
    idempotencyKey: randomUUID(),
  });
  const executing = workerTick();
  for (let i = 0; i < 100; i++) {
    const current = await runDetail(run.id);
    if (current?.status !== 'queued') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await cancelRun(run.id);
  await executing;
  const result = await runDetail(run.id);
  assert.equal(result?.status, 'cancelled');
  assert.ok(result!.attempts.every((a) => a.status !== 'running'));
});

test('daily creation quota is enforced in persisted metadata', async () => {
  const count = (await db.select().from(rehearsalRuns)).filter(
    (r) => r.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
  ).length;
  for (let i = count; i < 10; i++) {
    const run = await createRun('taskforge', {
      baseline: 'baseline',
      candidate: 'baseline',
      correction: null,
      idempotencyKey: randomUUID(),
    });
    await cancelRun(run.id);
    await workerTick();
  }
  await assert.rejects(
    createRun('taskforge', {
      baseline: 'baseline',
      candidate: 'baseline',
      correction: null,
      idempotencyKey: randomUUID(),
    }),
    /Daily rehearsal quota/,
  );
});
test('owned repository source, questions and findings are isolated from anonymous users', async () => {
  const timestamp = new Date().toISOString();
  await db.insert(schema.users).values({
    id: 'owner-test',
    email: 'owner@example.test',
    name: 'Owner',
    passwordHash: 'not-a-real-password',
    role: 'user',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(schema.repositories).values({
    id: 'private-test',
    userId: 'owner-test',
    name: 'Private',
    owner: 'owner',
    fullName: 'owner/private',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  for (const route of [
    '/api/v1/repositories/private-test',
    '/api/v1/repositories/private-test/file?path=secret.ts',
    '/api/v1/repositories/private-test/findings',
  ])
    assert.equal((await app.request(route)).status, 404);
  const list = (await (await app.request('/api/v1/repositories')).json()) as any;
  assert.equal(
    list.data.some((r: any) => r.id === 'private-test'),
    false,
  );
  const forged = await app.request('/api/v1/repositories/private-test', {
    headers: { Authorization: 'Bearer invalid' },
  });
  assert.equal(forged.status, 401);
});
