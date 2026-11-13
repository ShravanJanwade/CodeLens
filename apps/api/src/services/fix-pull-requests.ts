// ============================================================
// Fix pull requests
// ------------------------------------------------------------
// Turns two diagnoses into a reviewed change instead of advice:
//
//  - config drift: the environment that failed is missing keys a
//    healthy sibling sets, so add them with the sibling's values;
//  - a known flaky test: skip it, with a note saying why, so it stops
//    blocking unrelated work until someone fixes the flake.
//
// Plans are pure reads and are shown as a diff first. Opening the
// pull request re-plans on the server against the current head of
// the default branch, so what merges is exactly what was previewed,
// or the request fails because the branch moved.
// ============================================================

import { createHash } from 'node:crypto';
import { getDb, schema, pipelineStages, environments, flakyTests, and, eq } from '@codelens/db';
import { isKnownFlake } from '@codelens/shared';
import { connection, fail } from './identity';
import { github, repoPath } from './github-client';
import { openPullRequest } from './pull-requests';

type Repository = typeof schema.repositories.$inferSelect;
type RunRow = typeof import('@codelens/db').pipelineRuns.$inferSelect;

export type FixKind = 'config-drift' | 'quarantine-test';

export interface FileChange {
  path: string;
  before: string;
  after: string;
}

export interface FixPlan {
  kind: FixKind;
  title: string;
  summary: string;
  body: string;
  branch: string;
  baseBranch: string;
  baseSha: string;
  target: string;
  environment: string | null;
  changes: FileChange[];
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 10);

/** Reads with the person's token when they have one, else the sync token for the public live example. */
async function readerFor(repository: Repository, userId?: string | null) {
  const linked = userId ? await connection(userId) : undefined;
  const override =
    linked || repository.userId ? undefined : process.env.GITHUB_SYNC_TOKEN?.trim() || undefined;
  const who = linked ? userId! : null;
  return {
    json: (path: string) => github(path, who, undefined, override),
    async file(path: string, ref: string): Promise<string | null> {
      try {
        const data = await github(
          `${repoPath(repository)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
          who,
          undefined,
          override,
        );
        if (!data || Array.isArray(data) || typeof data.content !== 'string') return null;
        return Buffer.from(data.content, 'base64').toString('utf8');
      } catch (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
    },
  };
}

type Reader = Awaited<ReturnType<typeof readerFor>>;

async function headOf(repository: Repository, reader: Reader) {
  const ref = await reader.json(
    `${repoPath(repository)}/git/ref/heads/${encodeURIComponent(repository.defaultBranch)}`,
  );
  return String(ref.object.sha);
}

function json(raw: string | null | undefined): Record<string, unknown> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ---- Config drift ---------------------------------------------------

/** Adds `missing` keys to a JSON document, each after the key that precedes it in `peer`. */
export function addKeys(
  text: string,
  peer: Record<string, unknown>,
  missing: string[],
): { after: string; added: Record<string, unknown> } {
  const mine = JSON.parse(text) as Record<string, unknown>;
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  ';
  const keys = Object.keys(mine);
  const peerKeys = Object.keys(peer);
  const added: Record<string, unknown> = {};
  for (const key of missing) {
    if (key in mine || !(key in peer)) continue;
    const before = peerKeys
      .slice(0, peerKeys.indexOf(key))
      .reverse()
      .find((k) => keys.includes(k));
    keys.splice(before ? keys.indexOf(before) + 1 : keys.length, 0, key);
    added[key] = peer[key];
  }
  const merged: Record<string, unknown> = {};
  for (const key of keys) merged[key] = key in mine ? mine[key] : peer[key];
  return { after: JSON.stringify(merged, null, indent) + (text.endsWith('\n') ? '\n' : ''), added };
}

async function brokenStageOf(run: RunRow) {
  if (!run.failedStage) throw fail('This run has no failed stage to fix.', 409);
  const stage = (
    await getDb()
      .select()
      .from(pipelineStages)
      .where(and(eq(pipelineStages.runId, run.id), eq(pipelineStages.stageKey, run.failedStage)))
      .limit(1)
  )[0];
  if (!stage) throw fail('The failed stage of this run is missing.', 404);
  return stage;
}

export async function planConfigDriftFix(
  repository: Repository,
  run: RunRow,
  userId?: string | null,
  links: { codelens?: string } = {},
): Promise<FixPlan> {
  const stage = await brokenStageOf(run);
  const drift = (
    json(stage.summary).evidence as { configDrift?: { key: string; expected: string }[] } | undefined
  )?.configDrift;
  if (!drift?.length) throw fail('CodeLens found no missing configuration in this run.', 409);
  const env = stage.environmentId
    ? (await getDb().select().from(environments).where(eq(environments.id, stage.environmentId)).limit(1))[0]
    : undefined;
  if (!env) throw fail('The failed stage did not deploy to a known environment.', 409);

  const reader = await readerFor(repository, userId);
  const baseSha = await headOf(repository, reader);
  const settings = json(await reader.file('.codelens.json', baseSha));
  const template = typeof settings.deployConfig === 'string' ? settings.deployConfig : null;
  if (!template?.includes('{environment}'))
    throw fail(
      '.codelens.json no longer names per-environment config files, so CodeLens cannot place the fix.',
      409,
    );
  const path = template.replace('{environment}', env.name);
  const before = await reader.file(path, baseSha);
  if (before === null) throw fail(`${path} does not exist on ${repository.defaultBranch}.`, 409);

  // Each missing key comes from the sibling that deployed successfully with it.
  const peers = new Map<string, string[]>();
  for (const item of drift) {
    const peer = /as in ([\w.-]+)/.exec(item.expected)?.[1];
    if (peer) peers.set(peer, [...(peers.get(peer) ?? []), item.key]);
  }
  let after = before;
  const rows: { key: string; value: unknown; from: string }[] = [];
  for (const [peer, keys] of peers) {
    const peerText = await reader.file(template.replace('{environment}', peer), baseSha);
    if (!peerText) continue;
    const result = addKeys(after, JSON.parse(peerText) as Record<string, unknown>, keys);
    after = result.after;
    for (const [key, value] of Object.entries(result.added)) rows.push({ key, value, from: peer });
  }
  if (!rows.length || after === before)
    throw fail(`${env.name} already has these settings on ${repository.defaultBranch}. Nothing to fix.`, 409);

  const keys = rows.map((r) => r.key);
  const title = `Add ${keys.join(', ')} to ${env.name} deploy settings`;
  const runLabel = `#${run.displayNumber ?? run.runNumber}`;
  const body = [
    `CodeLens diagnosed ${run.externalUrl ? `[run ${runLabel}](${run.externalUrl})` : `run ${runLabel}`} as **config drift**: \`${env.name}\` is missing ${keys.map((k) => `\`${k}\``).join(', ')}, which the environments that deployed the same build successfully all set.`,
    '',
    'This copies the values those environments use:',
    '',
    '| Setting | Value | Copied from |',
    '| --- | --- | --- |',
    ...rows.map((r) => `| \`${r.key}\` | \`${JSON.stringify(r.value)}\` | ${r.from} |`),
    '',
    `Merging it ships through the normal pipeline.${links.codelens ? ` [Diagnosis in CodeLens](${links.codelens})` : ''}`,
  ].join('\n');
  return {
    kind: 'config-drift',
    title,
    summary: `Adds ${keys.join(', ')} to ${path}, copied from ${[...new Set(rows.map((r) => r.from))].join(' and ')}.`,
    body,
    branch: `codelens/fix-${env.name}-${digest(path + after)}`,
    baseBranch: repository.defaultBranch,
    baseSha,
    target: env.name,
    environment: env.name,
    changes: [{ path, before, after }],
  };
}

// ---- Quarantine a flaky test ------------------------------------------

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Marks the one declaration of `title` in `text` as skipped, with a comment saying why. */
export function quarantine(text: string, title: string, note: string): string {
  const pattern = new RegExp(
    `^([ \\t]*)(it|test)((?:\\.(?:only|concurrent|sequential))?)\\s*\\(\\s*(['"\`])${escapeRegExp(title)}\\4`,
    'gm',
  );
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) {
    if (new RegExp(`\\b(?:it|test)\\.skip\\s*\\(\\s*(['"\`])${escapeRegExp(title)}\\1`).test(text))
      throw fail('This test is already skipped on the default branch.', 409);
    throw fail('CodeLens could not find exactly where this test is declared.', 409);
  }
  if (matches.length > 1) throw fail('This test name is declared more than once in its file.', 409);
  const [match] = matches;
  const [whole, indent, fn, modifier] = match;
  const replaced = whole.replace(`${fn}${modifier}`, `${fn}.skip`);
  return `${text.slice(0, match.index)}${indent}// ${note}\n${replaced}${text.slice(match.index! + whole.length)}`;
}

export async function planQuarantineFix(
  repository: Repository,
  testName: string,
  userId?: string | null,
  links: { codelens?: string } = {},
): Promise<FixPlan> {
  const flake = (
    await getDb()
      .select()
      .from(flakyTests)
      .where(and(eq(flakyTests.repositoryId, repository.id), eq(flakyTests.testName, testName)))
      .limit(1)
  )[0];
  if (!flake) throw fail('That test has no failure history in CodeLens.', 404);
  if (!isKnownFlake(flake))
    throw fail(
      'Only a known flaky test can be quarantined. This one has not failed across enough runs and branches yet.',
      409,
    );
  const reader = await readerFor(repository, userId);
  const baseSha = await headOf(repository, reader);
  const before = await reader.file(flake.filePath, baseSha);
  if (before === null) throw fail(`${flake.filePath} does not exist on ${repository.defaultBranch}.`, 409);
  const title = testName.split(' > ').pop()!;
  const rate = `${Math.round(flake.flakeRate * 100)}%`;
  const note = `Quarantined by CodeLens: failed ${flake.failCount} of ${flake.runCount} runs (${rate}) on ${flake.distinctBranches} branches. Fix the flake, then remove .skip.`;
  const after = quarantine(before, title, note);
  const body = [
    `\`${testName}\` fails intermittently: ${flake.failCount} of the last ${flake.runCount} runs (${rate}), on ${flake.distinctBranches} unrelated branches. Each of those failures blocked a change that had nothing to do with it.`,
    '',
    'This skips the test and leaves a note beside it, so it stops blocking work until the flake is fixed. The test stays in the file: removing `.skip` brings it back.',
    '',
    links.codelens ? `[Failure history in CodeLens](${links.codelens})` : '',
  ]
    .join('\n')
    .trim();
  return {
    kind: 'quarantine-test',
    title: `Quarantine flaky test "${title}"`,
    summary: `Skips "${title}" in ${flake.filePath} with a note explaining why.`,
    body,
    branch: `codelens/quarantine-${digest(flake.filePath + after)}`,
    baseBranch: repository.defaultBranch,
    baseSha,
    target: testName,
    environment: null,
    changes: [{ path: flake.filePath, before, after }],
  };
}

export async function openFix(repository: Repository, userId: string, plan: FixPlan) {
  const marker = `CodeLens fix ${digest(JSON.stringify(plan.changes.map((c) => [c.path, c.after])))}`;
  return openPullRequest(repository, userId, {
    baseBranch: plan.baseBranch,
    expectedHead: plan.baseSha,
    branch: plan.branch,
    title: plan.title,
    body: plan.body,
    commitMessage: plan.title,
    marker,
    files: plan.changes.map((c) => ({ path: c.path, content: c.after })),
  });
}
