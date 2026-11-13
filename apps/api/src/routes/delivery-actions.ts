// ============================================================
// Pipeline action routes
// ------------------------------------------------------------
// Reads (access, gates, releases, fix previews, the action log) are
// open to anyone who can read the repository in CodeLens. Writes need
// a signed-in person whose GitHub account can write to the repository;
// services/delivery-actions.ts checks that with GitHub on every call.
// ============================================================

import { Hono } from 'hono';
import { getDb, schema, eq } from '@codelens/db';
import { appOrigin, fail, requireUser } from '../services/identity';
import {
  accessFor,
  pendingGates,
  recentActions,
  recordFix,
  redeploy,
  releasesOf,
  rerun,
  review,
  runOf,
  type RerunMode,
} from '../services/delivery-actions';
import {
  openFix,
  planConfigDriftFix,
  planQuarantineFix,
  type FixKind,
  type FixPlan,
} from '../services/fix-pull-requests';

export const deliveryActionRoutes = new Hono();

async function repositoryOf(id: string) {
  const row = (
    await getDb().select().from(schema.repositories).where(eq(schema.repositories.id, id)).limit(1)
  )[0];
  if (!row) throw fail('Repository not found.', 404);
  return row;
}

const userOf = (c: { get: (key: never) => unknown }) =>
  (c.get('userId' as never) as string | undefined) ?? null;

async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('Expected a JSON object.');
  return value as Record<string, unknown>;
}

const runLink = (repositoryId: string, runNumber: number) =>
  `${appOrigin()}/r/${encodeURIComponent(repositoryId)}/runs/${runNumber}`;

deliveryActionRoutes.get('/repositories/:id/actions/access', async (c) => {
  const repository = await repositoryOf(c.req.param('id'));
  return c.json({ data: await accessFor(userOf(c), repository) });
});

deliveryActionRoutes.get('/repositories/:id/actions', async (c) => {
  const repository = await repositoryOf(c.req.param('id'));
  return c.json({ data: await recentActions(repository.id) });
});

deliveryActionRoutes.post('/repositories/:id/actions/rerun', async (c) => {
  const userId = requireUser(c);
  const repository = await repositoryOf(c.req.param('id'));
  const input = await body(c);
  const mode = input.mode as RerunMode;
  if (!['failed', 'all', 'job'].includes(mode)) throw fail('Choose what to re-run.');
  if (mode === 'job' && typeof input.stageKey !== 'string') throw fail('Choose the stage to re-run.');
  const result = await rerun(repository, userId, {
    runNumber: Number(input.runNumber),
    mode,
    stageKey: typeof input.stageKey === 'string' ? input.stageKey : undefined,
  });
  return c.json({ data: { message: result.message, url: result.url, action: result.action } }, 202);
});

deliveryActionRoutes.get('/repositories/:id/environments/:environment/releases', async (c) => {
  const repository = await repositoryOf(c.req.param('id'));
  const { environment, releases } = await releasesOf(repository, c.req.param('environment'));
  return c.json({
    data: {
      environment: {
        name: environment.name,
        tier: environment.tier,
        region: environment.region,
        regionLabel: environment.regionLabel,
        currentCommitSha: environment.currentCommitSha,
      },
      releases,
    },
  });
});

deliveryActionRoutes.post('/repositories/:id/actions/redeploy', async (c) => {
  const userId = requireUser(c);
  const repository = await repositoryOf(c.req.param('id'));
  const input = await body(c);
  if (typeof input.environment !== 'string' || typeof input.commitSha !== 'string')
    throw fail('Choose an environment and the commit to deploy.');
  const result = await redeploy(repository, userId, {
    environment: input.environment,
    commitSha: input.commitSha,
  });
  return c.json({ data: { message: result.message, url: result.url, action: result.action } }, 202);
});

deliveryActionRoutes.get('/repositories/:id/pipeline-runs/:runNumber/gates', async (c) => {
  const repository = await repositoryOf(c.req.param('id'));
  const run = await runOf(repository, Number(c.req.param('runNumber')));
  return c.json({ data: await pendingGates(repository, run, userOf(c)) });
});

deliveryActionRoutes.post('/repositories/:id/actions/review', async (c) => {
  const userId = requireUser(c);
  const repository = await repositoryOf(c.req.param('id'));
  const input = await body(c);
  if (input.decision !== 'approved' && input.decision !== 'rejected') throw fail('Approve or reject.');
  const environments = Array.isArray(input.environments)
    ? input.environments.filter((e): e is string => typeof e === 'string').slice(0, 20)
    : [];
  const result = await review(repository, userId, {
    runNumber: Number(input.runNumber),
    environments,
    decision: input.decision,
    comment: typeof input.comment === 'string' ? input.comment : undefined,
  });
  return c.json({ data: { message: result.message, url: result.url, action: result.action } }, 202);
});

async function planFor(
  repository: typeof schema.repositories.$inferSelect,
  input: Record<string, unknown>,
  userId: string | null,
): Promise<{ plan: FixPlan; runId: string | null }> {
  const kind = input.kind as FixKind;
  if (kind === 'config-drift') {
    const run = await runOf(repository, Number(input.runNumber));
    const plan = await planConfigDriftFix(repository, run, userId, {
      codelens: runLink(repository.id, run.runNumber),
    });
    return { plan, runId: run.id };
  }
  if (kind === 'quarantine-test') {
    if (typeof input.test !== 'string' || !input.test) throw fail('Choose the test to quarantine.');
    const plan = await planQuarantineFix(repository, input.test, userId, {
      codelens: `${appOrigin()}/r/${encodeURIComponent(repository.id)}/flakes`,
    });
    return { plan, runId: null };
  }
  throw fail('Unknown fix.');
}

const previewOf = (plan: FixPlan) => ({
  kind: plan.kind,
  title: plan.title,
  summary: plan.summary,
  body: plan.body,
  branch: plan.branch,
  baseBranch: plan.baseBranch,
  baseSha: plan.baseSha,
  changes: plan.changes,
});

/** The exact change a fix would make. Pure reads, so visitors can see it too. */
deliveryActionRoutes.get('/repositories/:id/fixes/preview', async (c) => {
  const repository = await repositoryOf(c.req.param('id'));
  const { plan } = await planFor(repository, c.req.query(), userOf(c));
  return c.json({ data: previewOf(plan) });
});

deliveryActionRoutes.post('/repositories/:id/actions/fix', async (c) => {
  const userId = requireUser(c);
  const repository = await repositoryOf(c.req.param('id'));
  const input = await body(c);
  const { plan, runId } = await planFor(repository, input, userId);
  // The person reviewed a diff against one base commit; refuse if main moved since.
  if (typeof input.baseSha === 'string' && input.baseSha !== plan.baseSha)
    throw fail(`${plan.baseBranch} changed since you previewed this fix. Review it again.`, 409);
  const result = await recordFix(
    repository,
    userId,
    {
      target: plan.target,
      runId,
      environment: plan.environment,
      detail: { kind: plan.kind, branch: plan.branch },
    },
    async () => {
      const pr = await openFix(repository, userId, plan);
      return {
        url: pr.url,
        number: pr.number,
        reused: pr.reused,
        message: pr.reused ? 'This fix already has a pull request.' : `Opened a pull request: ${plan.title}.`,
      };
    },
  );
  return c.json(
    { data: { message: result.message, url: result.url, reused: result.reused, action: result.action } },
    201,
  );
});
