import { Hono } from 'hono';
import { and, desc, eq } from '@codelens/db';
import { getDb, rehearsalRuns, releaseFindings } from '@codelens/db';
import { createRun, runDetail, cancelRun, budgets } from './runner';
import { prepareFixture, FIXTURE_ID } from './fixture';

export const releaseRoutes = new Hono();
releaseRoutes.get('/fixture', async (c) => {
  const fixture = await prepareFixture();
  return c.json({ data: { repositoryId: FIXTURE_ID, revisions: fixture.revisions, budgets } });
});
releaseRoutes.get('/repositories/:id/rehearsals', async (c) =>
  c.json({
    data: (
      await getDb()
        .select()
        .from(rehearsalRuns)
        .where(eq(rehearsalRuns.repositoryId, c.req.param('id')))
        .orderBy(desc(rehearsalRuns.createdAt))
    ).map((r) => ({ ...r, config: JSON.parse(r.config) })),
  }),
);
releaseRoutes.post('/repositories/:id/rehearsals', async (c) => {
  try {
    const input = await c.req.json();
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return c.json({ error: { message: 'Expected an object' } }, 400);
    return c.json({ data: await createRun(c.req.param('id'), input) }, 202);
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : 'Cannot create rehearsal' } },
      400,
    );
  }
});
releaseRoutes.get('/repositories/:id/findings', async (c) =>
  c.json({
    data: (
      await getDb()
        .select()
        .from(releaseFindings)
        .where(eq(releaseFindings.repositoryId, c.req.param('id')))
        .orderBy(desc(releaseFindings.createdAt))
    ).map((f) => ({ ...f, evidenceIds: JSON.parse(f.evidenceIds) })),
  }),
);
releaseRoutes.get('/repositories/:id/rehearsals/:run', async (c) => {
  const run = await runDetail(c.req.param('run'));
  if (!run || run.repositoryId !== c.req.param('id'))
    return c.json({ error: { message: 'Run not found' } }, 404);
  return c.json({ data: run });
});
releaseRoutes.post('/repositories/:id/rehearsals/:run/cancel', async (c) => {
  const run = await runDetail(c.req.param('run'));
  if (!run || run.repositoryId !== c.req.param('id'))
    return c.json({ error: { message: 'Run not found' } }, 404);
  await cancelRun(run.id);
  return c.json({ data: { requested: true } });
});
releaseRoutes.post('/repositories/:id/findings/:finding/confirm', async (c) => {
  const result = await getDb()
    .update(releaseFindings)
    .set({ status: 'confirmed' })
    .where(
      and(
        eq(releaseFindings.id, c.req.param('finding')),
        eq(releaseFindings.repositoryId, c.req.param('id')),
      ),
    )
    .returning();
  return result.length
    ? c.json({ data: result[0] })
    : c.json({ error: { message: 'Finding not found' } }, 404);
});
releaseRoutes.get('/repositories/:id/rehearsals/:run/report', async (c) => {
  const run = await runDetail(c.req.param('run'));
  if (!run || run.repositoryId !== c.req.param('id'))
    return c.json({ error: { message: 'Run not found' } }, 404);
  c.header('Content-Disposition', `attachment; filename="codelens-${run.id}.json"`);
  return c.json({
    format: 'codelens-report-v1',
    recorded: false,
    generatedAt: new Date().toISOString(),
    ...run,
  });
});
