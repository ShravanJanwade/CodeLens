import { Hono } from 'hono';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { getDb, schema, eq, desc, repositoryIntegrations, repositoryInvestigations } from '@codelens/db';
import { github, repoPath } from '../services/github-client';
import { getRepository, startIndex } from '../services/repository-sync';
import { requireUser, fail, connection, seal, unseal, hash, appOrigin } from '../services/identity';
import { deliveryEvidence } from '../services/delivery';
export const deliveryRoutes = new Hono();
const db = getDb();
deliveryRoutes.get('/repositories/:id/commits', async (c) => {
  const repo = await getRepository(c.req.param('id'));
  const branch = c.req.query('branch') || repo.defaultBranch;
  const commits = await github(
    `${repoPath(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=20`,
    repo.userId,
  );
  return c.json({
    data: commits.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message.split('\n')[0],
      date: commit.commit.committer?.date,
    })),
  });
});
deliveryRoutes.get('/repositories/:id/github-file', async (c) => {
  const repo = await getRepository(c.req.param('id')),
    path = c.req.query('path') ?? '',
    revision = c.req.query('revision') ?? '';
  if (
    !path ||
    path.length > 300 ||
    path.split('/').some((p) => !p || p === '..' || p === '.') ||
    !/^[a-f0-9]{40}$/.test(revision)
  )
    throw fail('Select a file and exact branch commit.');
  const file = await github(
    `${repoPath(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${revision}`,
    repo.userId,
  );
  if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 500000)
    throw fail('Only text files below 500 KB can be edited here.');
  const content = Buffer.from(file.content, 'base64').toString('utf8');
  if (content.includes('\0')) throw fail('Binary files cannot be edited here.');
  return c.json({ data: { path, content, revision, sha: file.sha } });
});
deliveryRoutes.get('/repositories/:id/delivery', async (c) =>
  c.json({ data: await deliveryEvidence(await getRepository(c.req.param('id')), c.req.query('branch')) }),
);
deliveryRoutes.get('/repositories/:id/delivery/runs/:run/jobs', async (c) => {
  const repo = await getRepository(c.req.param('id')),
    run = c.req.param('run');
  if (!/^\d+$/.test(run)) throw fail('Invalid run');
  const result = await github(`${repoPath(repo)}/actions/runs/${run}/jobs?per_page=100`, repo.userId);
  return c.json({
    data: result.jobs.map((j: any) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      url: j.html_url,
      steps: j.steps.map((s: any) => ({
        name: s.name,
        status: s.status,
        conclusion: s.conclusion,
        number: s.number,
      })),
    })),
  });
});
deliveryRoutes.get('/repositories/:id/delivery/pulls/:number', async (c) => {
  const repo = await getRepository(c.req.param('id')),
    number = c.req.param('number');
  if (!/^\d+$/.test(number)) throw fail('Invalid pull request');
  const pr = await github(`${repoPath(repo)}/pulls/${number}`, repo.userId);
  return c.json({
    data: {
      number: pr.number,
      mergeable: pr.mergeable,
      mergeableState: pr.mergeable_state,
      url: pr.html_url,
      head: pr.head.ref,
      base: pr.base.ref,
      suggestion:
        pr.mergeable === false
          ? 'This PR has conflicts. Update its branch from the base branch in a local checkout, resolve each marked file, run tests, and push the reviewed resolution.'
          : pr.mergeable === null
            ? 'GitHub is calculating mergeability. Refresh shortly.'
            : 'No merge conflict reported. Branch protections and required checks still apply.',
    },
  });
});
deliveryRoutes.get('/repositories/:id/webhook', async (c) => {
  const repo = await getRepository(c.req.param('id'));
  const config = (
    await db.select().from(repositoryIntegrations).where(eq(repositoryIntegrations.repositoryId, repo.id))
  )[0];
  const events = await db
    .select()
    .from(schema.githubWebhookEvents)
    .where(eq(schema.githubWebhookEvents.repositoryId, repo.id))
    .orderBy(desc(schema.githubWebhookEvents.receivedAt))
    .limit(20);
  return c.json({
    data: {
      configured: !!config?.hookId,
      url: `${appOrigin()}/api/v1/integrations/github/webhook/${repo.id}`,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        action: e.action,
        receivedAt: e.receivedAt,
        verificationStatus: e.verificationStatus,
      })),
      publicUrlRequired: !appOrigin().startsWith('https://'),
    },
  });
});
deliveryRoutes.post('/repositories/:id/webhook', async (c) => {
  const user = requireUser(c),
    repo = await getRepository(c.req.param('id'));
  if (!(await connection(user))) throw fail('Connect GitHub first.');
  if (!appOrigin().startsWith('https://'))
    throw fail(
      'GitHub needs a public HTTPS callback. Set APP_ORIGIN to your deployed CodeLens URL before enabling the webhook.',
    );
  const url = `${appOrigin()}/api/v1/integrations/github/webhook/${repo.id}`;
  let config = (
    await db.select().from(repositoryIntegrations).where(eq(repositoryIntegrations.repositoryId, repo.id))
  )[0];
  const secret = config?.webhookSecret ? unseal(config.webhookSecret) : randomBytes(32).toString('hex');
  if (!config)
    await db
      .insert(repositoryIntegrations)
      .values({ repositoryId: repo.id, webhookSecret: seal(secret), updatedAt: new Date().toISOString() });
  const hooks = await github(`${repoPath(repo)}/hooks?per_page=100`, user);
  const existing = hooks.find((h: any) => h.config?.url === url);
  const body = {
    active: true,
    events: ['push', 'pull_request', 'workflow_run', 'deployment', 'deployment_status', 'check_run'],
    config: { url, content_type: 'json', secret, insecure_ssl: '0' },
  };
  const hook = await github(`${repoPath(repo)}/hooks${existing ? `/${existing.id}` : ''}`, user, {
    method: existing ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  });
  await db
    .update(repositoryIntegrations)
    .set({ hookId: hook.id, updatedAt: new Date().toISOString() })
    .where(eq(repositoryIntegrations.repositoryId, repo.id));
  return c.json({ data: { configured: true, id: hook.id, url } });
});
deliveryRoutes.post('/integrations/github/webhook/:id', async (c) => {
  const repo = await getRepository(c.req.param('id')),
    config = (
      await db.select().from(repositoryIntegrations).where(eq(repositoryIntegrations.repositoryId, repo.id))
    )[0];
  if (!config?.webhookSecret) throw fail('Webhook is not configured', 404);
  const raw = await c.req.text();
  if (Buffer.byteLength(raw) > 1000000) throw fail('Webhook exceeds 1 MB', 413);
  const expected = Buffer.from(
      `sha256=${createHmac('sha256', unseal(config.webhookSecret)).update(raw).digest('hex')}`,
    ),
    actual = Buffer.from(c.req.header('x-hub-signature-256') ?? '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw fail('Invalid webhook signature', 401);
  const body = JSON.parse(raw),
    delivery = c.req.header('x-github-delivery'),
    event = c.req.header('x-github-event') ?? 'unknown';
  if (!delivery || String(body.repository?.full_name ?? '').toLowerCase() !== repo.fullName.toLowerCase())
    throw fail('Webhook repository identity mismatch');
  const inserted = await db
    .insert(schema.githubWebhookEvents)
    .values({
      id: crypto.randomUUID(),
      repositoryId: repo.id,
      deliveryId: delivery,
      eventType: event,
      action: body.action,
      payload: raw,
      verificationStatus: 'verified',
      receivedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return c.json({ data: { deduplicated: true } });
  // A source-only refresh never executes repository code. Index only push branches, never a fork PR ref.
  if (event === 'push' && !body.deleted && typeof body.ref === 'string' && body.ref.startsWith('refs/heads/'))
    void startIndex(repo, body.ref.slice(11)).catch(() =>
      console.warn('Webhook source refresh unavailable; event retained for manual retry.'),
    );
  return c.json({ data: { received: true } }, 202);
});
deliveryRoutes.get('/repositories/:id/investigations', async (c) =>
  c.json({
    data: (
      await db
        .select()
        .from(repositoryInvestigations)
        .where(eq(repositoryInvestigations.repositoryId, c.req.param('id')))
        .orderBy(desc(repositoryInvestigations.createdAt))
    ).map((r) => ({ ...r, evidence: JSON.parse(r.evidence) })),
  }),
);
deliveryRoutes.post('/repositories/:id/investigations', async (c) => {
  requireUser(c);
  const repo = await getRepository(c.req.param('id')),
    body = await c.req.json();
  for (const ref of [body.baseline, body.candidate])
    if (typeof ref !== 'string' || !ref || ref.length > 255) throw fail('Select both revisions.');
  const [base, head] = await Promise.all([
    github(`${repoPath(repo)}/commits/${encodeURIComponent(body.baseline)}`, repo.userId),
    github(`${repoPath(repo)}/commits/${encodeURIComponent(body.candidate)}`, repo.userId),
  ]);
  const comparison = await github(`${repoPath(repo)}/compare/${base.sha}...${head.sha}`, repo.userId);
  const delivery = await deliveryEvidence(repo);
  const relevant = delivery.workflows.data.filter((r: any) => r.sha === head.sha);
  const evidence = {
    kind: 'source-and-ci',
    baseline: base.sha,
    candidate: head.sha,
    url: comparison.html_url,
    comparison: {
      status: comparison.status,
      aheadBy: comparison.ahead_by,
      behindBy: comparison.behind_by,
      totalCommits: comparison.total_commits,
      files: (comparison.files ?? []).slice(0, 100).map((f: any) => ({
        path: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch?.slice(0, 15000),
        url: f.blob_url,
      })),
    },
    workflows: relevant,
    delivery,
    checks: [
      {
        name: 'Candidate CI evidence',
        outcome: relevant.length
          ? relevant.some((r: any) => ['failure', 'timed_out'].includes(r.conclusion))
            ? 'failed'
            : relevant.every((r: any) => r.conclusion === 'success')
              ? 'passed'
              : 'inconclusive'
          : 'inconclusive',
        detail: relevant.length
          ? `${relevant.length} workflow runs match the exact candidate commit.`
          : 'No workflow run matches this candidate SHA. Run its pipeline and refresh the investigation.',
      },
    ],
    limitations: [
      'Source and GitHub CI evidence only. No application performance or behavioral test is inferred from a source diff.',
      'Security alerts and deployments are captured repository-wide and may concern another revision.',
      'Diff output is bounded to 100 files; binary/large patches may be absent.',
    ],
  };
  const record = {
    id: crypto.randomUUID(),
    repositoryId: repo.id,
    baseline: base.sha,
    candidate: head.sha,
    status: 'completed',
    evidence: JSON.stringify(evidence),
    createdAt: new Date().toISOString(),
  };
  await db.transaction(async (tx) => {
    if (!(await tx.select().from(schema.repositories).where(eq(schema.repositories.id, repo.id))).length)
      throw fail('Repository was removed before evidence could be saved.', 404);
    await tx.insert(repositoryInvestigations).values(record);
  });
  return c.json({ data: { ...record, evidence } }, 201);
});
deliveryRoutes.post('/repositories/:id/changes/publish', async (c) => {
  const user = requireUser(c),
    repo = await getRepository(c.req.param('id')),
    body = await c.req.json();
  if (!(await connection(user))) throw fail('Connect GitHub with repository permissions first.');
  if (
    body.confirm !== true ||
    typeof body.title !== 'string' ||
    !body.title.trim() ||
    body.title.length > 150 ||
    typeof body.baseBranch !== 'string' ||
    body.baseBranch.length > 255 ||
    !body.baseBranch ||
    !/^[a-f0-9]{40}$/.test(body.expectedHead ?? '') ||
    !/^[-\w]{10,70}$/.test(body.requestId ?? '')
  )
    throw fail('Review the title, base branch, and exact commit before publishing.');
  if (!Array.isArray(body.files) || !body.files.length || body.files.length > 10)
    throw fail('Publish 1–10 reviewed text files at a time.');
  let size = 0;
  const paths = new Set();
  for (const f of body.files) {
    if (
      typeof f.path !== 'string' ||
      !f.path ||
      f.path.length > 300 ||
      f.path.startsWith('/') ||
      /[\\\x00-\x1f]/.test(f.path) ||
      f.path.split('/').some((p: string) => p === '..' || p === '.' || p === '') ||
      f.path.startsWith('.git/') ||
      typeof f.content !== 'string' ||
      paths.has(f.path)
    )
      throw fail('Invalid or duplicate file path.');
    paths.add(f.path);
    size += Buffer.byteLength(f.content);
  }
  if (size > 500000) throw fail('Keep reviewed changes below 500 KB.');
  const prefix = repoPath(repo),
    digest = hash(JSON.stringify(body.files)).slice(0, 12),
    branch = `codelens/change-${body.requestId}-${digest}`;
  const existingPr = await github(
    `${prefix}/pulls?state=all&head=${encodeURIComponent(repo.owner + ':' + branch)}`,
    user,
  );
  if (existingPr.length) return c.json({ data: { url: existingPr[0].html_url, branch, reused: true } });
  const base = await github(`${prefix}/git/ref/heads/${encodeURIComponent(body.baseBranch)}`, user);
  if (base.object.sha !== body.expectedHead)
    throw fail(
      'The base branch changed on GitHub. Refresh it and review the changes again before publishing.',
      409,
    );
  const commit = await github(`${prefix}/git/commits/${base.object.sha}`, user);
  let ref: any;
  try {
    ref = await github(`${prefix}/git/ref/heads/${encodeURIComponent(branch)}`, user);
  } catch (e) {
    if ((e as any).status !== 404) throw e;
  }
  if (!ref) {
    // Walk only the reviewed paths; preserve executable bits and refuse symlink/submodule replacements.
    const trees = new Map<string, any[]>();
    const fileMode = async (filePath: string) => {
      let treeSha = commit.tree.sha;
      const segments = filePath.split('/');
      for (let i = 0; i < segments.length; i++) {
        if (!trees.has(treeSha)) {
          const tree = await github(`${prefix}/git/trees/${treeSha}`, user);
          if (tree.truncated || !Array.isArray(tree.tree))
            throw fail('GitHub could not provide the full directory for review.');
          trees.set(treeSha, tree.tree);
        }
        const entry = trees.get(treeSha)!.find((item: any) => item.path === segments[i]);
        if (!entry) return '100644';
        if (i === segments.length - 1) {
          if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode))
            throw fail(
              'Only regular source files can be replaced. Symlinks, directories and submodules require a local checkout.',
            );
          return entry.mode;
        }
        if (entry.type !== 'tree') throw fail('A parent path is not a directory.');
        treeSha = entry.sha;
      }
      return '100644';
    };
    const entries = [];
    for (const file of body.files)
      entries.push({ path: file.path, mode: await fileMode(file.path), type: 'blob', content: file.content });
    const tree = await github(`${prefix}/git/trees`, user, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: entries,
      }),
    });
    const next = await github(`${prefix}/git/commits`, user, {
      method: 'POST',
      body: JSON.stringify({
        message: `${body.title}\n\nCodeLens reviewed change ${body.requestId} (${digest})`,
        tree: tree.sha,
        parents: [base.object.sha],
      }),
    });
    await github(`${prefix}/git/refs`, user, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: next.sha }),
    });
  } else {
    const existing = await github(`${prefix}/git/commits/${ref.object.sha}`, user);
    if (!existing.message.includes(`CodeLens reviewed change ${body.requestId} (${digest})`))
      throw fail('The generated branch already contains unrelated work.', 409);
  }
  const pr = await github(`${prefix}/pulls`, user, {
    method: 'POST',
    body: JSON.stringify({
      title: body.title,
      head: branch,
      base: body.baseBranch,
      body: 'Reviewed changes prepared in CodeLens. Inspect the diff and required CI checks before merging.',
      draft: true,
    }),
  });
  return c.json({ data: { url: pr.html_url, branch, number: pr.number } }, 201);
});
