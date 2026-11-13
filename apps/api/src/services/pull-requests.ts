// ============================================================
// Pull requests from CodeLens
// ------------------------------------------------------------
// One way to put a reviewed change on GitHub, shared by the change
// publisher and the fix pull requests: a new branch from an exact
// base commit, one commit with the reviewed files, and a pull
// request. Retrying is safe: an existing pull request for the branch
// is returned, and a branch that already carries the same change is
// reused rather than duplicated.
// ============================================================

import { fail } from './identity';
import { github, repoPath } from './github-client';

export interface PullRequestFile {
  path: string;
  content: string;
}

export interface PullRequestInput {
  baseBranch: string;
  /** The base branch head the change was reviewed against. */
  expectedHead: string;
  branch: string;
  title: string;
  body: string;
  commitMessage: string;
  /** Text the commit message carries so a retry can recognise its own branch. */
  marker: string;
  files: PullRequestFile[];
  draft?: boolean;
}

export async function openPullRequest(
  repo: { owner: string; name: string },
  userId: string,
  input: PullRequestInput,
): Promise<{ url: string; number: number | null; branch: string; reused: boolean }> {
  const prefix = repoPath(repo);
  const existingPr = await github(
    `${prefix}/pulls?state=all&head=${encodeURIComponent(repo.owner + ':' + input.branch)}`,
    userId,
  );
  if (existingPr?.length)
    return {
      url: existingPr[0].html_url,
      number: existingPr[0].number ?? null,
      branch: input.branch,
      reused: true,
    };
  const base = await github(`${prefix}/git/ref/heads/${encodeURIComponent(input.baseBranch)}`, userId);
  if (base.object.sha !== input.expectedHead)
    throw fail(
      'The base branch changed on GitHub. Refresh it and review the changes again before publishing.',
      409,
    );
  const commit = await github(`${prefix}/git/commits/${base.object.sha}`, userId);
  let ref: any;
  try {
    ref = await github(`${prefix}/git/ref/heads/${encodeURIComponent(input.branch)}`, userId);
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
          const tree = await github(`${prefix}/git/trees/${treeSha}`, userId);
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
    for (const file of input.files)
      entries.push({ path: file.path, mode: await fileMode(file.path), type: 'blob', content: file.content });
    const tree = await github(`${prefix}/git/trees`, userId, {
      method: 'POST',
      body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }),
    });
    const next = await github(`${prefix}/git/commits`, userId, {
      method: 'POST',
      body: JSON.stringify({
        message: `${input.commitMessage}\n\n${input.marker}`,
        tree: tree.sha,
        parents: [base.object.sha],
      }),
    });
    await github(`${prefix}/git/refs`, userId, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: next.sha }),
    });
  } else {
    const existing = await github(`${prefix}/git/commits/${ref.object.sha}`, userId);
    if (!String(existing.message ?? '').includes(input.marker))
      throw fail('The generated branch already contains unrelated work.', 409);
  }
  const pr = await github(`${prefix}/pulls`, userId, {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      head: input.branch,
      base: input.baseBranch,
      body: input.body,
      draft: input.draft ?? false,
    }),
  });
  return { url: pr.html_url, number: pr.number ?? null, branch: input.branch, reused: false };
}
