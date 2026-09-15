import { Hono } from 'hono';
import {
  getDb,
  schema,
  eq,
  and,
  isNull,
  sql,
  inArray,
  rehearsalRuns,
  rehearsalAttempts,
  releaseFindings,
  repositoryIntegrations,
  repositoryInvestigations,
} from '@codelens/db';
import { github, repoPath } from '../services/github-client';
import { requireUser, fail } from '../services/identity';
import { getRepository, refreshBranches, startIndex } from '../services/repository-sync';
export const repositoryRoutes = new Hono();
const db = getDb();
repositoryRoutes.post('/repositories', async (c) => {
  const userId = requireUser(c),
    body = await c.req.json();
  const fullName = String(body.fullName ?? '')
    .trim()
    .replace(/^https:\/\/github.com\//, '')
    .replace(/\.git\/?$|\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) throw fail('Enter a GitHub owner/repository or repository URL.');
  const [owner, name] = fullName.split('/');
  const existing = (
    await db
      .select()
      .from(schema.repositories)
      .where(and(eq(schema.repositories.fullName, fullName), eq(schema.repositories.userId, userId)))
  )[0];
  if (existing) return c.json({ data: existing });
  const remote = await github(repoPath({ owner, name }), userId);
  if (remote.size > 100000) throw fail('Choose a repository under the 100 MB indexing limit.');
  const repository = {
    id: crypto.randomUUID(),
    owner: remote.owner.login,
    name: remote.name,
    fullName: remote.full_name,
    url: remote.clone_url,
    defaultBranch: remote.default_branch,
    language: remote.language,
    description: remote.description,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.insert(schema.repositories).values(repository);
  return c.json({ data: repository }, 201);
});
repositoryRoutes.get('/repositories/:id/branches', async (c) =>
  c.json({ data: await refreshBranches(await getRepository(c.req.param('id'))) }),
);
for (const action of ['analyze', 'sync'])
  repositoryRoutes.post(`/repositories/:id/${action}`, async (c) => {
    requireUser(c);
    const repo = await getRepository(c.req.param('id'));
    if (repo.id === 'taskforge') throw fail('Use the prepared example revisions.');
    const body = await c.req.json().catch(() => ({}));
    return c.json(await startIndex(repo, body.branch), 202);
  });
repositoryRoutes.patch('/repositories/:id', async (c) => {
  requireUser(c);
  const repo = await getRepository(c.req.param('id')),
    body = await c.req.json();
  if (repo.id === 'taskforge') throw fail('The shared example metadata is managed by the fixture.', 403);
  if (body.defaultBranch !== undefined)
    throw fail(
      'The default branch is managed on GitHub. Select an indexing branch in the repository workspace.',
    );
  if (typeof body.description !== 'string' || body.description.length > 2000)
    throw fail('Notes must be under 2,000 characters.');
  await db
    .update(schema.repositories)
    .set({ description: body.description, updatedAt: new Date().toISOString() })
    .where(eq(schema.repositories.id, repo.id));
  return c.json({ data: await getRepository(repo.id) });
});
repositoryRoutes.delete('/repositories/:id', async (c) => {
  requireUser(c);
  const repo = await getRepository(c.req.param('id'));
  if (repo.id === 'taskforge')
    throw fail('The shared example is available to everyone and cannot be removed.');
  await db.transaction(async (tx) => {
    const active = (
      await tx.select().from(schema.codeAnalysisRuns).where(eq(schema.codeAnalysisRuns.repositoryId, repo.id))
    ).some(
      (r) => ['pending', 'processing'].includes(r.status) && Date.parse(r.startedAt) > Date.now() - 600000,
    );
    const runs = await tx.select().from(rehearsalRuns).where(eq(rehearsalRuns.repositoryId, repo.id));
    if (active || runs.some((r) => !['completed', 'failed', 'cancelled'].includes(r.status)))
      throw fail('Wait for active indexing or rehearsals to finish before deleting.', 409);
    await tx.delete(releaseFindings).where(eq(releaseFindings.repositoryId, repo.id));
    if (runs.length)
      await tx.delete(rehearsalAttempts).where(
        inArray(
          rehearsalAttempts.runId,
          runs.map((r) => r.id),
        ),
      );
    await tx.delete(rehearsalRuns).where(eq(rehearsalRuns.repositoryId, repo.id));
    await tx.delete(repositoryInvestigations).where(eq(repositoryInvestigations.repositoryId, repo.id));
    await tx.delete(repositoryIntegrations).where(eq(repositoryIntegrations.repositoryId, repo.id));
    for (const table of [
      schema.repositoryEdges,
      schema.repositoryFiles,
      schema.codeFindings,
      schema.githubWebhookEvents,
    ])
      await tx.delete(table).where(eq(table.repositoryId, repo.id));
    await tx.delete(schema.codeAnalysisRuns).where(eq(schema.codeAnalysisRuns.repositoryId, repo.id));
    await tx.delete(schema.repositories).where(eq(schema.repositories.id, repo.id));
  });
  return c.json({ data: { deleted: true, id: repo.id } });
});
