import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq, and } from '@codelens/db';
import { getDb, schema } from '@codelens/db';
import { variants } from '@codelens/taskforge';
import { analyzeRepository } from '../services/analyzer';

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const FIXTURE_ID = 'taskforge';
let preparing: ReturnType<typeof prepare> | undefined;

async function prepare() {
  const sourceDir = path.join(root, 'examples/taskforge/src');
  const names = ['app.ts', 'storage.ts', 'serve.ts'];
  const contents = await Promise.all(names.map((name) => fs.readFile(path.join(sourceDir, name), 'utf8')));
  const digest = createHash('sha256').update(contents.join('\n')).digest('hex');
  const directory = path.join(root, 'data', 'fixtures', digest);
  await fs.mkdir(path.join(directory, 'src'), { recursive: true });
  const git = (args: string[]) =>
    execute('git', args, {
      cwd: directory,
      timeout: 30_000,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'CodeLens fixture',
        GIT_AUTHOR_EMAIL: 'fixture@codelens.local',
        GIT_COMMITTER_NAME: 'CodeLens fixture',
        GIT_COMMITTER_EMAIL: 'fixture@codelens.local',
        GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      },
    });
  let revisions: Record<string, string>;
  try {
    revisions = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  } catch {
    await git(['init', '--initial-branch=main']);
    await git(['config', 'core.autocrlf', 'false']);
    for (let i = 0; i < names.length; i++)
      await fs.writeFile(path.join(directory, 'src', names[i]), contents[i]);
    revisions = {};
    for (const variant of variants) {
      await fs.writeFile(
        path.join(directory, 'src', 'revision.ts'),
        `export const variant = '${variant}';\n`,
      );
      await git(['add', 'src']);
      await git(['commit', '--allow-empty', '-m', `Prepared ${variant} version`]);
      revisions[variant] = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    }
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(revisions));
  }
  const db = getDb();
  const timestamp = new Date().toISOString();
  await db
    .insert(schema.repositories)
    .values({
      id: FIXTURE_ID,
      name: 'TaskForge',
      owner: 'examples',
      fullName: 'examples/taskforge',
      defaultBranch: 'main',
      language: 'TypeScript',
      description:
        'Prepared issue-tracker example. Explore indexed source, compare releases, and verify a supplied correction.',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing();
  for (const variant of variants) {
    const completed = await db
      .select()
      .from(schema.codeAnalysisRuns)
      .where(
        and(
          eq(schema.codeAnalysisRuns.repositoryId, FIXTURE_ID),
          eq(schema.codeAnalysisRuns.commitSha, revisions[variant]),
          eq(schema.codeAnalysisRuns.status, 'completed'),
        ),
      );
    if (completed.length) continue;
    const id = randomUUID();
    await db
      .insert(schema.codeAnalysisRuns)
      .values({ id, repositoryId: FIXTURE_ID, branch: variant, status: 'pending', startedAt: timestamp });
    await analyzeRepository(FIXTURE_ID, id, '', { directory, revision: revisions[variant] });
  }
  return {
    directory,
    revisions,
    digest,
    sourcePath: 'src/app.ts',
    sourceLine:
      contents[0].split('\n').findIndex((line) => line.includes('export async function startFixture')) + 1,
  };
}
export function prepareFixture() {
  return (preparing ??= prepare().catch((error) => {
    preparing = undefined;
    throw error;
  }));
}
