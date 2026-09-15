import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRun, workerTick, runDetail, cancelRun } from './runner';
import { prepareFixture } from './fixture';
import { snapshot } from '../services/snapshots';

// All public workflow input is validated. No input is interpolated into a shell command.
const candidate = process.env.CANDIDATE ?? 'defective';
if (!['baseline', 'defective', 'corrected'].includes(candidate)) throw new Error('Unsupported candidate');
const publicId = process.env.PUBLIC_RUN_ID ?? '';
if (publicId && !/^[a-f0-9-]{36}$/.test(publicId)) throw new Error('Invalid public run ID');
const callback = process.env.REHEARSAL_CALLBACK_URL;
const token = process.env.REHEARSAL_CALLBACK_TOKEN;
if (publicId && (!callback || !token || new URL(callback).protocol !== 'https:'))
  throw new Error('Public CI requires an HTTPS callback and server-side token');
const fixture = await prepareFixture();
const run = await createRun('taskforge', {
  baseline: 'baseline',
  candidate,
  correction: 'corrected',
  idempotencyKey: publicId || crypto.randomUUID(),
});
const sources: Array<{ revision: string; path: string; content: string }> = [];
for (const revision of new Set(
  [run.baseline, run.candidate, run.correction].filter((value): value is string => !!value),
)) {
  const index = await snapshot('taskforge', revision);
  sources.push(...index.files.map((f) => ({ revision, path: f.path, content: f.content })));
}
let checkpointing = false;
async function checkpoint() {
  if (!publicId || !callback || !token || checkpointing) return;
  checkpointing = true;
  try {
    const endpoint = `${callback.replace(/\/$/, '')}/api/v1/runner/${publicId}`;
    const status = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!status.ok) throw new Error(`Control plane returned ${status.status}`);
    const control = (await status.json()) as { status: string };
    if (control.status === 'cancelling' || control.status === 'cancelled') await cancelRun(run.id);
    const current = await runDetail(run.id);
    if (!current) return;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...current,
        status:
          current.status === 'queued'
            ? 'preparing'
            : current.status === 'cancelling'
              ? 'testing'
              : current.status,
        sources,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Checkpoint rejected (${response.status})`);
  } finally {
    checkpointing = false;
  }
}
const timer = setInterval(
  () =>
    void checkpoint().catch((error) =>
      console.error(error instanceof Error ? error.message : 'Checkpoint failed'),
    ),
  2000,
);
try {
  await checkpoint();
  await workerTick();
  const result = await runDetail(run.id);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const destination = path.join(root, 'apps/web/public/evidence');
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(
    path.join(destination, 'taskforge-recorded.json'),
    JSON.stringify({ format: 'codelens-report-v1', recorded: true, ...result, sources }, null, 2),
  );
  // Wait for an in-flight callback, then deliver a bounded final checkpoint.
  while (checkpointing) await new Promise((resolve) => setTimeout(resolve, 100));
  let uploaded = !publicId;
  for (let attempt = 0; attempt < 3 && !uploaded; attempt++) {
    try {
      await checkpoint();
      uploaded = true;
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Final checkpoint failed');
    }
  }
  if (!uploaded) throw new Error('Final checkpoint failed; evidence remains in the CI artifact.');
  console.log(
    JSON.stringify({
      status: result?.status,
      runId: run.id,
      publicRunId: publicId || null,
      engine: result?.attempts.find((a) => a.stage === 'baseline')?.evidence.engine,
    }),
  );
  if (result?.status !== 'completed' && result?.status !== 'cancelled') process.exitCode = 1;
} finally {
  clearInterval(timer);
}
