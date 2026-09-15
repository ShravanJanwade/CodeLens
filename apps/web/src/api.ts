/**
 * Use a same-origin API by default. This works with Vite's development proxy
 * and with a reverse proxy/static deployment without baking localhost into the
 * production bundle. Set VITE_API_URL when the API is hosted separately.
 */
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
// Accept either an API host (http://localhost:4000) or a fully-qualified API
// prefix (https://example.com/api/v1). The old behavior appended the prefix
// twice for the latter, producing hard-to-diagnose 404s after deployment.
export const API_BASE = configuredApiUrl
  ? configuredApiUrl.endsWith('/api/v1')
    ? configuredApiUrl
    : `${configuredApiUrl}/api/v1`
  : '/api/v1';

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  }
  return response;
}

export async function fetchDashboard() {
  const res = await request('/dashboard');
  return res.json();
}

export async function fetchRepositories() {
  const res = await request('/repositories');
  return res.json();
}

export async function fetchServices() {
  const res = await request('/services');
  return res.json();
}

export async function fetchServiceDetail(id: string) {
  const res = await request(`/services/${encodeURIComponent(id)}`);
  return res.json();
}

export async function fetchIncidents(page = 1) {
  const res = await request(`/incidents?page=${page}`);
  return res.json();
}

export async function fetchIncidentDetail(id: string) {
  const res = await request(`/incidents/${encodeURIComponent(id)}`);
  return res.json();
}

export async function approveRemediation(
  id: string,
  decision: 'approved' | 'rejected',
  accessToken?: string,
) {
  const res = await request(`/incidents/${encodeURIComponent(id)}/approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ decision }),
  });
  return res.json();
}

/** Approval for deterministic public demo scenarios only; production actions require authentication. */
export async function approveDemoRemediation(id: string) {
  const res = await request(`/demo/incidents/${encodeURIComponent(id)}/approve`, { method: 'POST' });
  return res.json();
}

export async function fetchAgents() {
  const res = await request('/agents/runs');
  const data = await res.json();

  // Fetch details for the top 5 runs
  const detailedRuns = await Promise.all(
    (data.data || []).slice(0, 5).map(async (run: any) => {
      const detailRes = await fetch(`${API_BASE}/agents/runs/${encodeURIComponent(run.id)}`);
      if (!detailRes.ok) return run;
      const detail = await detailRes.json();
      return detail.data;
    }),
  );

  return { data: detailedRuns };
}

export async function addRepository(url: string) {
  const res = await request('/repositories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: url }),
  });
  return res.json();
}

export async function analyzeRepository(id: string, branch?: string) {
  const res = await request(`/repositories/${encodeURIComponent(id)}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch }),
  });
  return res.json();
}

export async function syncRepository(id: string) {
  const res = await request(`/repositories/${encodeURIComponent(id)}/sync`, { method: 'POST' });
  return res.json();
}

export async function updateRepository(
  id: string,
  updates: { description?: string; defaultBranch?: string },
) {
  const res = await request(`/repositories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteRepository(id: string) {
  const res = await request(`/repositories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.json();
}

export async function fetchRepositoryPipeline(id: string) {
  const res = await request(`/repositories/${encodeURIComponent(id)}/pipeline`);
  return res.json();
}

export async function triagePipelineLog(id: string, log: string) {
  const res = await request(`/repositories/${encodeURIComponent(id)}/pipeline/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ log }),
  });
  return res.json();
}

export async function fetchRepositoryDetail(id: string) {
  const res = await request(`/repositories/${encodeURIComponent(id)}`);
  return res.json();
}

export async function fetchRepositoryFile(id: string, filePath: string) {
  const res = await request(
    `/repositories/${encodeURIComponent(id)}/file?path=${encodeURIComponent(filePath)}`,
  );
  return res.json();
}

export async function chatWithRepo(id: string, message: string, filePath?: string) {
  const res = await request(`/repositories/${encodeURIComponent(id)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, ...(filePath ? { filePath } : {}) }),
  });
  return res.json();
}

export async function fetchEvaluations() {
  const res = await request('/evaluations');
  return res.json();
}

export async function fetchConfig() {
  const res = await request('/config');
  return res.json();
}
