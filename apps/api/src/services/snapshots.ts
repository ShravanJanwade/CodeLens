import { and, desc, eq } from '@codelens/db';
import { getDb, schema } from '@codelens/db';

export async function snapshot(repositoryId: string, revision?: string, branch?: string) {
  const db = getDb();
  const runs = await db
    .select()
    .from(schema.codeAnalysisRuns)
    .where(eq(schema.codeAnalysisRuns.repositoryId, repositoryId))
    .orderBy(desc(schema.codeAnalysisRuns.startedAt));
  const selected = runs.find(
    (r) =>
      r.status === 'completed' &&
      (!revision || r.commitSha === revision || r.id === revision) &&
      (!branch || r.branch === branch),
  );
  if (!selected) return { runs, selected: null, files: [], edges: [], findings: [] };
  const [files, edges, findings] = await Promise.all([
    db
      .select()
      .from(schema.repositoryFiles)
      .where(
        and(
          eq(schema.repositoryFiles.repositoryId, repositoryId),
          eq(schema.repositoryFiles.analysisRunId, selected.id),
        ),
      ),
    db.select().from(schema.repositoryEdges).where(eq(schema.repositoryEdges.analysisRunId, selected.id)),
    db.select().from(schema.codeFindings).where(eq(schema.codeFindings.analysisRunId, selected.id)),
  ]);
  return { runs, selected, files, edges, findings };
}

export function selectSources(
  files: Awaited<ReturnType<typeof snapshot>>['files'],
  question: string,
  requestedPath?: string,
) {
  const terms = question.toLowerCase().match(/[a-z_$][\w$-]{2,}/g) ?? [];
  return files
    .filter((f) => !requestedPath || f.path === requestedPath)
    .map((file) => ({
      file,
      score: terms.reduce(
        (n, term) => n + (`${file.path}\n${file.content}`.toLowerCase().split(term).length - 1),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ file }) => {
      const lines = file.content.split('\n');
      const match = lines.findIndex((line) => terms.some((term) => line.toLowerCase().includes(term)));
      const start = Math.max(0, match - 8),
        end = Math.min(lines.length, start + 90);
      return {
        path: file.path,
        summary: file.summary,
        startLine: start + 1,
        endLine: end,
        content: lines
          .slice(start, end)
          .map((line, i) => `${start + i + 1}: ${line}`)
          .join('\n')
          .slice(0, 9000),
      };
    });
}

export function validateCitations(
  answer: string,
  sources: Array<{ path: string; startLine: number; endLine: number }>,
) {
  const references = [...answer.matchAll(/([\w./-]+\.[a-zA-Z0-9]+):(\d+)/g)];
  return (
    references.length > 0 &&
    references.every(([, path, line]) =>
      sources.some(
        (source) =>
          source.path === path && Number(line) >= source.startLine && Number(line) <= source.endLine,
      ),
    )
  );
}

export function selectedCodeSources(
  files: Awaited<ReturnType<typeof snapshot>>['files'],
  selection: { path: string; startLine?: number; endLine?: number },
) {
  const file = files.find((f) => f.path === selection.path);
  if (!file) throw new Error('This file is not in the selected indexed revision.');
  const lines = file.content.split('\n');
  const start = selection.startLine ?? 1,
    end = selection.endLine ?? lines.length;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length)
    throw new Error('Select a valid line range from this file.');
  const content = lines
    .slice(start - 1, end)
    .map((line, i) => `${start + i}: ${line}`)
    .join('\n');
  if (content.length > 40000)
    throw new Error('This file exceeds the AI context limit. Select a smaller section of code.');
  return [{ path: file.path, summary: file.summary, startLine: start, endLine: end, content }];
}
