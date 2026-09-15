import { getDb, schema, eq, and, sql } from '@codelens/db';
import { github, repoPath } from './github-client';
import { fail } from './identity';
import { analyzeRepository } from './analyzer';
export async function getRepository(id: string) {
  const row = (await getDb().select().from(schema.repositories).where(eq(schema.repositories.id, id)))[0];
  if (!row) throw fail('Repository not found', 404);
  return row;
}
export async function refreshBranches(repo: Awaited<ReturnType<typeof getRepository>>) {
  if (repo.id === 'taskforge') throw fail('The example uses prepared revisions.');
  const remote = await github(repoPath(repo), repo.userId);
  if (remote.size > 100000) throw fail('Repository exceeds the 100 MB indexing limit.');
  const branches: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await github(`${repoPath(repo)}/branches?per_page=100&page=${page}`, repo.userId);
    branches.push(...rows);
    if (rows.length < 100) break;
  }
  await getDb()
    .update(schema.repositories)
    .set({
      defaultBranch: remote.default_branch,
      language: remote.language,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.repositories.id, repo.id));
  return {
    defaultBranch: remote.default_branch,
    branches: branches.map((b) => ({ name: b.name, sha: b.commit.sha, protected: b.protected })),
    truncated: branches.length >= 1000,
    syncedAt: new Date().toISOString(),
  };
}
export async function startIndex(repo: Awaited<ReturnType<typeof getRepository>>, requested?: string) {
  const metadata = await github(repoPath(repo), repo.userId);
  if (metadata.size > 100000) throw fail('Repository exceeds the 100 MB indexing limit.');
  const branch = requested || metadata.default_branch;
  if (typeof branch !== 'string' || !branch || branch.length > 255) throw fail('Select a valid branch');
  // Validate the exact branch each time. A deleted selection is reported instead of silently indexing another branch.
  const remote = await github(`${repoPath(repo)}/branches/${encodeURIComponent(branch)}`, repo.userId);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    if (!(await tx.select().from(schema.repositories).where(eq(schema.repositories.id, repo.id))).length)
      throw fail('Repository was removed before indexing started.', 404);
    await tx
      .update(schema.codeAnalysisRuns)
      .set({
        status: 'failed',
        error: 'Index worker stopped before completion. Retry the current GitHub branch.',
        completedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(schema.codeAnalysisRuns.repositoryId, repo.id),
          sql`${schema.codeAnalysisRuns.status} IN ('pending','processing')`,
          sql`${schema.codeAnalysisRuns.startedAt} < ${new Date(Date.now() - 600000).toISOString()}`,
        ),
      );
    const active = (
      await tx
        .select()
        .from(schema.codeAnalysisRuns)
        .where(
          and(
            eq(schema.codeAnalysisRuns.repositoryId, repo.id),
            sql`${schema.codeAnalysisRuns.status} IN ('pending','processing')`,
          ),
        )
    )[0];
    if (active) {
      if (active.branch !== branch)
        throw fail(`Indexing ${active.branch} is already running. Wait for it to finish.`, 409);
      return { run: active, created: false };
    }
    await tx
      .update(schema.repositories)
      .set({ defaultBranch: metadata.default_branch, updatedAt: new Date().toISOString() })
      .where(eq(schema.repositories.id, repo.id));
    const run = {
      id: crypto.randomUUID(),
      repositoryId: repo.id,
      status: 'pending' as const,
      branch,
      startedAt: new Date().toISOString(),
    };
    await tx.insert(schema.codeAnalysisRuns).values(run);
    return { run, created: true };
  });
  if (result.created)
    void analyzeRepository(repo.id, result.run.id, `https://github.com/${repo.fullName}.git`).catch(
      console.error,
    );
  return { data: result.run, deduplicated: !result.created, remoteHead: remote.commit.sha };
}
