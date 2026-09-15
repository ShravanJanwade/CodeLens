import { githubToken, fail } from './identity';
export async function github(
  path: string,
  userId?: string | null,
  init?: RequestInit,
  tokenOverride?: string,
): Promise<any> {
  if (!path.startsWith('/') || path.startsWith('//')) throw fail('Invalid GitHub resource');
  const token = tokenOverride ?? (await githubToken(userId));
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CodeLens',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const status = response.status;
    throw fail(
      status === 404
        ? 'GitHub resource not found or your account does not have access.'
        : status === 401
          ? 'GitHub authorization expired. Reconnect your account.'
          : status === 403 || status === 429
            ? 'GitHub permission or rate limit prevents access. Review your connection permissions or try later.'
            : status === 422
              ? 'GitHub rejected this change. Refresh the branch and review the requested operation.'
              : 'GitHub is temporarily unavailable.',
      status === 401 ? 401 : status === 404 ? 404 : status === 403 || status === 429 ? 403 : 502,
    );
  }
  return response.status === 204 ? null : response.json();
}
export const repoPath = (repo: { owner: string; name: string }) =>
  `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
