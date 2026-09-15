import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { randomUUID, pbkdf2Sync } from 'node:crypto';
import { createStorage } from './storage';

export const variants = ['baseline', 'defective', 'corrected'] as const;
export type Variant = (typeof variants)[number];
export interface Trace {
  id: string;
  endpoint: string;
  status: number;
  durationMs: number;
  queryCount: number;
  queryDurationMs: number;
  queries: Array<{ sql: string; durationMs: number }>;
  source: { path: string; symbol: string; mapping: 'explicit' };
}

// Prepared example: defective deliberately contains three real regressions.
// Expected labels belong to tests; the investigator receives measured traces only.
export async function startFixture(
  variant: Variant,
  options: { postgresUrl?: string; workers?: number } = {},
) {
  if (!variants.includes(variant)) throw new Error('Unsupported fixture version');
  const storage = await createStorage(options.postgresUrl);
  const traces: Trace[] = [];
  const reports = new Map<string, string>();
  const background = new Set<ReturnType<typeof setImmediate>>();
  const workers = options.workers ?? (variant === 'defective' ? 8 : 1);
  const server = createServer(async (req, res) => {
    const started = performance.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const trace: Trace = {
      id: randomUUID(),
      endpoint: url.pathname,
      status: 200,
      durationMs: 0,
      queryCount: 0,
      queryDurationMs: 0,
      queries: [],
      source: { path: 'src/app.ts', symbol: 'startFixture', mapping: 'explicit' },
    };
    const query = async (sql: string, args: (string | number)[] = []) => {
      const start = performance.now();
      const rows = await storage.query(sql, args);
      const durationMs = performance.now() - start;
      trace.queryCount++;
      trace.queryDurationMs += durationMs;
      trace.queries.push({ sql, durationMs });
      return rows;
    };
    const finish = (status: number, body: unknown) => {
      trace.status = status;
      trace.durationMs = performance.now() - started;
      traces.push(trace);
      res.writeHead(status, { 'content-type': 'application/json', 'x-trace-id': trace.id });
      res.end(JSON.stringify(body));
    };
    try {
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TaskForge · prepared example</title><style>body{max-width:800px;margin:60px auto;padding:20px;font:16px system-ui;background:#101820;color:#deece5}button{padding:12px 18px;margin:12px 8px 12px 0;border-radius:6px;border:1px solid #5b8d77;background:#245640;color:white}pre{white-space:pre-wrap;padding:20px;background:#1d2b35;border-radius:8px}</style><h1>TaskForge</h1><p>Prepared issue-tracker example · signed in as Ada</p><button id="issues">Load issues</button><button id="private">Open private project</button><pre role="status" id="result">Choose a project.</pre><script>async function load(project){const response=await fetch('/api/issues?project='+project+'&size=5',{headers:{'x-user-id':'1'}});const body=await response.json();document.getElementById('result').textContent=response.status===403?'Access denied':response.status===200?body.issues.map(i=>i.title+' · '+i.commentCount+' comments').join('\\n'):'Request failed';}document.getElementById('issues').onclick=()=>load(1);document.getElementById('private').onclick=()=>load(2);</script></html>`,
        );
        return;
      }
      if (url.pathname === '/health') return finish(200, { status: 'ok' });
      const user = Number(req.headers['x-user-id']);
      if (![1, 2].includes(user)) return finish(401, { error: 'Authentication required' });
      if (url.pathname === '/api/projects')
        return finish(
          200,
          await query(
            'SELECT p.* FROM projects p JOIN memberships m ON p.id=m.project_id WHERE m.user_id=?',
            [user],
          ),
        );
      if (url.pathname === '/api/issues') {
        const project = Number(url.searchParams.get('project') ?? 1);
        const membership = await query('SELECT user_id FROM memberships WHERE user_id=? AND project_id=?', [
          user,
          project,
        ]);
        if (!membership.length && variant !== 'defective')
          return finish(403, { error: 'Project membership required' });
        const size = Math.min(40, Math.max(1, Number(url.searchParams.get('size') ?? 20) || 20));
        const search = url.searchParams.get('search') ?? '';
        const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
        let issues: Record<string, any>[];
        if (variant === 'defective') {
          issues = await query(
            'SELECT id,title FROM issues WHERE project_id=? AND title LIKE ? ORDER BY id LIMIT ? OFFSET ?',
            [project, `%${search}%`, size, offset],
          );
          for (const issue of issues) {
            const rows = await query('SELECT COUNT(*) AS count FROM comments WHERE issue_id=?', [issue.id]);
            issue.commentCount = Number(rows[0].count);
          }
        } else {
          issues = await query(
            'SELECT i.id,i.title,COUNT(c.id) AS count FROM issues i LEFT JOIN comments c ON c.issue_id=i.id WHERE i.project_id=? AND i.title LIKE ? GROUP BY i.id,i.title ORDER BY i.id LIMIT ? OFFSET ?',
            [project, `%${search}%`, size, offset],
          );
          issues = issues.map(({ count, ...issue }) => ({ ...issue, commentCount: Number(count) }));
        }
        return finish(200, { issues });
      }
      if (url.pathname === '/api/reports' && req.method === 'POST') {
        const id = randomUUID();
        reports.set(id, 'queued');
        const job = setImmediate(() => {
          background.delete(job);
          reports.set(id, 'running');
          // CPU-bound background work shares the event loop: increasing workers causes contention.
          for (let i = 0; i < workers; i++) pbkdf2Sync('fixture-report', 'fixed-seed', 12_000, 32, 'sha256');
          reports.set(id, 'completed');
        });
        background.add(job);
        return finish(202, { id, status: 'queued' });
      }
      if (url.pathname.startsWith('/api/reports/')) {
        const status = reports.get(url.pathname.split('/').pop()!);
        return finish(status ? 200 : 404, { status: status ?? 'not_found' });
      }
      finish(404, { error: 'Not found' });
    } catch {
      finish(500, { error: 'Fixture request failed' });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    traces,
    engine: storage.engine,
    workers,
    async close() {
      for (const job of background) clearImmediate(job);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await storage.close();
    },
  };
}
