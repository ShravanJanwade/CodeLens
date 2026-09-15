import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRun, workerTick, runDetail } from './runner';
import { prepareFixture } from './fixture';
import { snapshot } from '../services/snapshots';
import { getDb, schema, eq } from '@codelens/db';
const fixture = await prepareFixture();
const run = await createRun('taskforge', {
  baseline: 'baseline',
  candidate: 'defective',
  correction: 'corrected',
  idempotencyKey: `recorded-${fixture.digest.slice(0, 20)}`,
});
for (let i = 0; i < 5; i++) {
  const current = await runDetail(run.id);
  if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) break;
  await workerTick();
}
const result = await runDetail(run.id);
if (result?.status !== 'completed') throw new Error(`Recording failed: ${result?.status}: ${result?.error}`);
const sources = [];
const snapshots = [];
for (const revision of Object.values(fixture.revisions)) {
  const indexed = await snapshot('taskforge', revision);
  sources.push(...indexed.files.map((f) => ({ revision, path: f.path, content: f.content })));
  snapshots.push({
    revision,
    run: indexed.selected,
    files: indexed.files.map((f) => ({
      ...f,
      imports: JSON.parse(f.imports),
      symbols: JSON.parse(f.symbols),
    })),
    edges: indexed.edges,
    findings: indexed.findings,
  });
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const directory = path.join(root, 'apps/web/public/evidence');
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(
  path.join(directory, 'taskforge-recorded.json'),
  JSON.stringify({ format: 'codelens-report-v1', recorded: true, ...result, sources }, null, 2),
);
const repository = (
  await getDb().select().from(schema.repositories).where(eq(schema.repositories.id, 'taskforge'))
)[0];
await fs.writeFile(
  path.join(directory, 'taskforge-catalog.json'),
  JSON.stringify({ repository, revisions: fixture.revisions, digest: fixture.digest, snapshots }, null, 2),
);
console.log(
  JSON.stringify(
    {
      status: result.status,
      runId: result.id,
      checks: result.attempts.find((a) => a.stage === 'report')?.evidence.checks,
      recording: path.join(directory, 'taskforge-recorded.json'),
    },
    null,
    2,
  ),
);
