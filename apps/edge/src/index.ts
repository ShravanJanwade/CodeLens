interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GITHUB_REPOSITORY: string;
  GITHUB_REF: string;
  GITHUB_DISPATCH_TOKEN?: string;
  REHEARSAL_CALLBACK_TOKEN?: string;
}
const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (message: string, status = 400) => json({ error: { message } }, status);
const terminal = ['completed', 'failed', 'cancelled', 'interrupted'];
const timestamp = () => new Date().toISOString();
const variants = ['baseline', 'defective', 'corrected'];
const budgets = { dailyRuns: 10, queue: 3, maxRuntimeMs: 120000, maxAttempts: 2, concurrency: 1 };
const runRow = (r: any) => ({
  id: r.id,
  repositoryId: r.repository_id,
  idempotencyKey: r.idempotency_key,
  baseline: r.baseline,
  candidate: r.candidate,
  correction: r.correction,
  status: r.status,
  config: JSON.parse(r.config),
  error: r.error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
async function detail(env: Env, id: string) {
  const row = await env.DB.prepare('SELECT * FROM rehearsal_runs WHERE id=?').bind(id).first();
  if (!row) return null;
  const attempts = await env.DB.prepare('SELECT * FROM rehearsal_attempts WHERE run_id=? ORDER BY started_at')
    .bind(id)
    .all<any>();
  const findings = await env.DB.prepare('SELECT * FROM release_findings WHERE run_id=?').bind(id).all<any>();
  return {
    ...runRow(row),
    attempts: attempts.results.map((a) => ({
      id: a.id,
      runId: id,
      stage: a.stage,
      attempt: a.attempt,
      status: a.status,
      evidence: a.evidence ? JSON.parse(a.evidence) : null,
      error: a.error,
      startedAt: a.started_at,
      completedAt: a.completed_at,
    })),
    findings: findings.results.map((f) => ({
      id: f.id,
      runId: id,
      repositoryId: 'taskforge',
      revision: f.revision,
      title: f.title,
      status: f.status,
      evidenceIds: JSON.parse(f.evidence_ids),
      explanation: f.explanation,
      endpoint: f.endpoint,
      sourcePath: f.source_path,
      sourceLine: f.source_line,
      createdAt: f.created_at,
    })),
    budgets,
  };
}
async function catalog(request: Request, env: Env) {
  const url = new URL('/evidence/taskforge-catalog.json', request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok) throw new Error('Recorded fixture catalog missing from static build');
  return response.json() as Promise<any>;
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    route = url.pathname.replace(/^\/api\/v1/, '');
  if (!url.pathname.startsWith('/api/v1/')) return env.ASSETS.fetch(request);
  if (route === '/auth/status')
    return json({
      data: {
        user: null,
        github: null,
        githubOAuthAvailable: false,
        authenticationAvailable: false,
        callbackUrl: null,
      },
    });
  if (route === '/health' || route === '/config')
    return json({ status: 'ok', provider: 'demo', demoMode: true, limits: budgets, services: { api: true } });
  if (route.startsWith('/runner/')) {
    // This token is available only to the trusted CI workflow, never to the browser or fixture.
    if (
      !env.REHEARSAL_CALLBACK_TOKEN ||
      request.headers.get('authorization') !== `Bearer ${env.REHEARSAL_CALLBACK_TOKEN}`
    )
      return fail('Unauthorized runner', 401);
    const id = route.slice('/runner/'.length);
    const existing = await env.DB.prepare('SELECT * FROM rehearsal_runs WHERE id=?').bind(id).first<any>();
    if (!existing) return fail('Run not found', 404);
    if (request.method === 'GET') return json({ status: existing.status });
    if (request.method !== 'POST') return fail('Method not allowed', 405);
    if (Number(request.headers.get('content-length') ?? 0) > 2_000_000) return fail('Report too large', 413);
    const text = await request.text();
    if (text.length > 2_000_000) return fail('Report too large', 413);
    const body = JSON.parse(text);
    if (terminal.includes(existing.status))
      return json({ data: { deduplicated: true, status: existing.status } });
    if (
      ![
        'preparing',
        'testing',
        'investigating',
        'verifying',
        'completed',
        'failed',
        'interrupted',
        'cancelled',
      ].includes(body.status) ||
      !Array.isArray(body.attempts) ||
      body.attempts.length > 40
    )
      return fail('Invalid checkpoint');
    if (
      body.baseline !== existing.baseline ||
      body.candidate !== existing.candidate ||
      body.correction !== existing.correction
    )
      return fail('Build revision mismatch', 409);
    const status =
      existing.status === 'cancelling' && body.status !== 'cancelled' ? 'cancelling' : body.status;
    const writes = [];
    for (const a of body.attempts) {
      if (
        typeof a.id !== 'string' ||
        typeof a.stage !== 'string' ||
        !Number.isInteger(a.attempt) ||
        a.attempt < 1 ||
        a.attempt > 2
      )
        return fail('Invalid attempt');
      writes.push(
        env.DB.prepare(
          "INSERT INTO rehearsal_attempts(id,run_id,stage,attempt,status,evidence,error,started_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id,stage,attempt) DO UPDATE SET status=excluded.status,evidence=excluded.evidence,error=excluded.error,completed_at=excluded.completed_at WHERE rehearsal_attempts.status!='completed'",
        ).bind(
          a.id,
          id,
          a.stage,
          a.attempt,
          a.status,
          a.evidence ? JSON.stringify(a.evidence) : null,
          a.error ?? null,
          a.startedAt,
          a.completedAt ?? null,
        ),
      );
    }
    for (const f of (body.findings ?? []).slice(0, 20))
      writes.push(
        env.DB.prepare(
          'INSERT OR IGNORE INTO release_findings(id,run_id,repository_id,revision,endpoint,signature,title,status,evidence_ids,explanation,source_path,source_line,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        ).bind(
          f.id,
          id,
          'taskforge',
          f.revision,
          f.endpoint,
          f.signature,
          f.title,
          f.status,
          JSON.stringify(f.evidenceIds),
          f.explanation,
          f.sourcePath ?? null,
          f.sourceLine ?? null,
          f.createdAt,
        ),
      );
    for (const source of (body.sources ?? []).slice(0, 30)) {
      if (![body.baseline, body.candidate, body.correction].includes(source.revision))
        return fail('Invalid source revision');
      writes.push(
        env.DB.prepare(
          'INSERT OR IGNORE INTO code_analysis_runs(id,repository_id,commit_sha) VALUES(?,?,?)',
        ).bind(source.revision, 'taskforge', source.revision),
      );
      writes.push(
        env.DB.prepare(
          'INSERT OR IGNORE INTO repository_files(id,repository_id,analysis_run_id,path,content) VALUES(?,?,?,?,?)',
        ).bind(
          source.revision + ':' + source.path,
          'taskforge',
          source.revision,
          source.path,
          source.content,
        ),
      );
    }
    writes.push(
      env.DB.prepare('UPDATE rehearsal_runs SET status=?,error=?,updated_at=? WHERE id=?').bind(
        status,
        body.error ?? null,
        timestamp(),
        id,
      ),
    );
    await env.DB.batch(writes);
    return json({ data: { status } });
  }
  if (
    route === '/fixture' ||
    route === '/repositories' ||
    route === '/repositories/taskforge' ||
    route === '/repositories/taskforge/file' ||
    route === '/repositories/taskforge/chat'
  ) {
    const data = await catalog(request, env);
    if (route === '/fixture')
      return json({ data: { repositoryId: 'taskforge', revisions: data.revisions, budgets } });
    if (route === '/repositories')
      return request.method === 'GET'
        ? json({ data: [data.repository] })
        : fail('Public hosting supports the prepared fixture. Connect repositories locally.', 403);
    const revision = url.searchParams.get('revision') || data.revisions.baseline;
    const index = data.snapshots.find((s: any) => s.revision === revision);
    if (route.endsWith('/file')) {
      const file = index?.files.find((f: any) => f.path === url.searchParams.get('path'));
      if (file) return json({ data: { ...file, revision } });
      const historical = await env.DB.prepare(
        'SELECT content,path FROM repository_files WHERE analysis_run_id=? AND path=?',
      )
        .bind(revision, url.searchParams.get('path'))
        .first();
      return historical
        ? json({ data: { ...historical, revision, language: 'TypeScript', symbols: [], imports: [] } })
        : fail('Indexed file not found', 404);
    }
    if (route.endsWith('/chat')) {
      const input = (await request.json()) as any;
      const selected = data.snapshots.find((s: any) => s.revision === input.revision);
      if (typeof input.message !== 'string' || input.message.length > 500 || !selected)
        return fail('Select an indexed revision and a question under 500 characters');
      const files = selected.files
        .filter((f: any) => !input.filePath || input.filePath === f.path)
        .slice(0, 4);
      return json({
        data: {
          fallback: true,
          revision: input.revision,
          message:
            'Deterministic source retrieval in the hosted demo. Inspect the cited files at this revision. Runtime behavior requires the recorded or fresh rehearsal evidence; these sources alone do not establish performance.',
          sources: files.map((f: any) => ({
            path: f.path,
            revision: input.revision,
            startLine: 1,
            endLine: Math.min(90, f.content.split('\n').length),
          })),
        },
      });
    }
    if (!index) {
      const archived = await env.DB.prepare(
        'SELECT id,path,content FROM repository_files WHERE analysis_run_id=?',
      )
        .bind(revision)
        .all<any>();
      if (!archived.results.length) return fail('Revision not found', 404);
      const run = {
        id: revision,
        branch: 'recorded',
        commitSha: revision,
        status: 'completed',
        progress: 100,
        filesProcessed: archived.results.length,
        totalFiles: archived.results.length,
        symbolsIndexed: 0,
        coverage: JSON.stringify({
          summary:
            'Historical source retained with runtime evidence. Symbol and dependency extraction are unavailable for this archived view.',
        }),
        startedAt: '',
        error: null,
      };
      return json({
        data: {
          ...data.repository,
          analysisRuns: [run, ...data.snapshots.map((s: any) => s.run)],
          snapshot: run,
          files: archived.results.map(({ content, ...file }: any) => ({
            ...file,
            language: 'TypeScript',
            imports: [],
            symbols: [],
            summary: 'Archived source',
          })),
          dependencyGraph: [],
          findings: [],
        },
      });
    }
    return json({
      data: {
        ...data.repository,
        analysisRuns: data.snapshots.map((s: any) => s.run),
        snapshot: index.run,
        files: index.files.map(({ content, ...f }: any) => f),
        dependencyGraph: index.edges,
        findings: index.findings,
      },
    });
  }
  if (route === '/repositories/taskforge/findings') {
    const rows = await env.DB.prepare('SELECT DISTINCT run_id FROM release_findings').all<any>();
    const runs = await Promise.all(rows.results.map((r) => detail(env, r.run_id)));
    return json({ data: runs.flatMap((r) => r?.findings ?? []), canConfirm: false });
  }
  if (route === '/repositories/taskforge/rehearsals') {
    if (request.method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT * FROM rehearsal_runs ORDER BY created_at DESC LIMIT 50',
      ).all();
      return json({ data: rows.results.map(runRow) });
    }
    if (request.method !== 'POST') return fail('Method not allowed', 405);
    if (
      !env.GITHUB_DISPATCH_TOKEN ||
      !env.REHEARSAL_CALLBACK_TOKEN ||
      env.GITHUB_REPOSITORY.startsWith('REPLACE')
    )
      return fail('Fresh hosted runs are not configured. Explore the recorded investigation.', 503);
    const input = (await request.json()) as any;
    if (
      Object.keys(input).some(
        (k) => !['baseline', 'candidate', 'correction', 'idempotencyKey'].includes(k),
      ) ||
      input.baseline !== 'baseline' ||
      input.correction !== 'corrected' ||
      !variants.includes(input.candidate) ||
      typeof input.idempotencyKey !== 'string' ||
      !/^[\w-]{8,100}$/.test(input.idempotencyKey)
    )
      return fail(
        'Hosted runs require baseline → allowlisted candidate → corrected. No arbitrary commands or targets.',
      );
    const existing = await env.DB.prepare(
      'SELECT * FROM rehearsal_runs WHERE repository_id=? AND idempotency_key=?',
    )
      .bind('taskforge', input.idempotencyKey)
      .first<any>();
    if (existing) {
      if (JSON.parse(existing.config).candidate !== input.candidate)
        return fail('Idempotency key already used for another configuration', 409);
      return json({ data: runRow(existing) });
    }
    const data = await catalog(request, env),
      id = crypto.randomUUID(),
      time = timestamp();
    const config = {
      baseline: 'baseline',
      candidate: input.candidate,
      correction: 'corrected',
      digest: data.digest,
      testVersion: 'taskforge-journeys-v1',
      workloadVersion: 'closed-loop-v1',
      toolVersions: { runner: 'GitHub Actions / Node 22' },
      objective: 'Lowest tested passing worker count; held-out page size 10.',
    };
    const insert = await env.DB.prepare(
      "INSERT INTO rehearsal_runs(id,repository_id,idempotency_key,baseline,candidate,correction,status,config,created_at,updated_at) SELECT ?,'taskforge',?,?,?,?,'queued',?,?,? WHERE (SELECT COUNT(*) FROM rehearsal_runs WHERE substr(created_at,1,10)=?)<10 AND (SELECT COUNT(*) FROM rehearsal_runs WHERE status NOT IN ('completed','failed','cancelled','interrupted'))<3",
    )
      .bind(
        id,
        input.idempotencyKey,
        data.revisions.baseline,
        data.revisions[input.candidate],
        data.revisions.corrected,
        JSON.stringify(config),
        time,
        time,
        time.slice(0, 10),
      )
      .run();
    if (!insert.meta.changes)
      return fail('Daily run quota or queue capacity reached. Try later or explore recorded evidence.', 429);
    const dispatched = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/release-rehearsal.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'CodeLens',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: env.GITHUB_REF,
          inputs: { public_run_id: id, candidate: input.candidate },
        }),
        signal: AbortSignal.timeout(10000),
      },
    ).catch(() => null);
    if (!dispatched?.ok) {
      await env.DB.prepare(
        "UPDATE rehearsal_runs SET status='failed',error='CI dispatch failed or its response was lost. No automatic duplicate dispatch.',updated_at=? WHERE id=?",
      )
        .bind(timestamp(), id)
        .run();
      return fail('Could not dispatch the trusted CI workflow. Recorded evidence remains available.', 503);
    }
    return json({ data: await detail(env, id) }, 202);
  }
  const match = route.match(/^\/repositories\/taskforge\/rehearsals\/([\w-]+)(?:\/(report|cancel))?$/);
  if (match) {
    const run = await detail(env, match[1]);
    if (!run) return fail('Run not found', 404);
    if (match[2] === 'cancel' && request.method === 'POST') {
      await env.DB.prepare(
        "UPDATE rehearsal_runs SET status='cancelling',updated_at=? WHERE id=? AND status NOT IN ('completed','failed','cancelled','interrupted')",
      )
        .bind(timestamp(), run.id)
        .run();
      return json({ data: { requested: true } });
    }
    if (request.method !== 'GET') return fail('Method not allowed', 405);
    if (match[2] === 'report')
      return new Response(JSON.stringify({ format: 'codelens-report-v1', recorded: false, ...run }), {
        headers: {
          'content-type': 'application/json',
          'content-disposition': `attachment; filename="codelens-${run.id}.json"`,
        },
      });
    return json({ data: run });
  }
  return fail(
    'This hosted demo supports the prepared repository and bounded release rehearsals. Use the local application for additional tools.',
    404,
  );
}
export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handle(request, env);
    } catch {
      return fail(
        'Metadata service unavailable or its free quota is exhausted. Recorded evidence remains available.',
        503,
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    const stale = new Date(Date.now() - 15 * 60_000).toISOString();
    await env.DB.prepare(
      "UPDATE rehearsal_runs SET status=CASE WHEN status='cancelling' THEN 'cancelled' ELSE 'interrupted' END,error='CI worker did not deliver a checkpoint within 15 minutes',updated_at=? WHERE status NOT IN ('completed','failed','cancelled','interrupted') AND updated_at<?",
    )
      .bind(timestamp(), stale)
      .run();
    const retention = new Date(Date.now() - 7 * 86400_000).toISOString();
    await env.DB.prepare(
      "DELETE FROM rehearsal_attempts WHERE run_id IN (SELECT id FROM rehearsal_runs WHERE status IN ('completed','failed','cancelled','interrupted') AND created_at<?) AND stage!='report'",
    )
      .bind(retention)
      .run();
  },
};
