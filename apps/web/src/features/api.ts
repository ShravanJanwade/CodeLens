import { API_BASE } from '../api';
export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    signal: init?.signal ?? AbortSignal.timeout(90_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body)
    throw Object.assign(
      new Error(
        body?.error?.message ?? `API request failed (${response.status}). Check your local API connection.`,
      ),
      { status: response.status },
    );
  return body;
}
export const repositoryPath = (id: string) => `/repositories/${encodeURIComponent(id)}`;
