import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type {
  BenchmarkReport,
  BlastRadius,
  DeliveryOverview,
  FlakyTestRow,
  GraphPayload,
  LiveDiagnosis,
  RunDetail,
  RunSummary,
} from './types';

const repo = (id: string) => `/repositories/${encodeURIComponent(id)}`;

export function useDeliveryOverview(repositoryId: string) {
  return useQuery({
    queryKey: ['delivery-overview', repositoryId],
    queryFn: () => api<{ data: DeliveryOverview }>(`${repo(repositoryId)}/delivery-overview`),
    select: (r) => r.data,
    // A run in flight should visibly progress without a manual refresh.
    refetchInterval: (query) =>
      (query.state.data as { data?: DeliveryOverview } | undefined)?.data?.stats.activeRuns ? 15_000 : false,
  });
}

export interface RunFilters {
  branch?: string;
  status?: string;
  tier?: string;
  category?: string;
  limit?: number;
}

export function useRuns(repositoryId: string, filters: RunFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== 'all') params.set(key, String(value));
  }
  const qs = params.toString();

  return useQuery({
    queryKey: ['pipeline-runs', repositoryId, qs],
    queryFn: () =>
      api<{
        data: RunSummary[];
        facets: {
          branches: string[];
          statuses: string[];
          categories: { id: string; label: string }[];
        };
        total: number;
      }>(`${repo(repositoryId)}/pipeline-runs${qs ? `?${qs}` : ''}`),
    // Keep the table populated while a new filter loads, so the page
    // does not flash an empty state on every keystroke.
    placeholderData: (previous) => previous,
  });
}

export function useRunDetail(repositoryId: string, runNumber: number | undefined) {
  return useQuery({
    queryKey: ['pipeline-run', repositoryId, runNumber],
    queryFn: () => api<{ data: RunDetail }>(`${repo(repositoryId)}/pipeline-runs/${runNumber}`),
    select: (r) => r.data,
    enabled: Number.isFinite(runNumber),
    refetchInterval: (query) =>
      (query.state.data as { data?: RunDetail } | undefined)?.data?.run.status === 'running' ? 10_000 : false,
  });
}

/**
 * Re-runs the classifier server-side. Disabled by default and
 * triggered from a button: the point is to demonstrate that the
 * verdict is computed on demand, so it should not fire on mount.
 */
export function useLiveDiagnosis(repositoryId: string, runNumber: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['rediagnose', repositoryId, runNumber],
    queryFn: () =>
      api<{ data: LiveDiagnosis | null }>(`${repo(repositoryId)}/pipeline-runs/${runNumber}/rediagnose`),
    select: (r) => r.data,
    enabled: enabled && Number.isFinite(runNumber),
    gcTime: 0,
    staleTime: 0,
  });
}

export function useBlastRadius(repositoryId: string, files: string[], depth = 4) {
  const key = [...files].sort().join(',');
  return useQuery({
    queryKey: ['blast-radius', repositoryId, key, depth],
    queryFn: () =>
      api<{ data: BlastRadius }>(
        `${repo(repositoryId)}/blast-radius?files=${encodeURIComponent(key)}&depth=${depth}`,
      ),
    select: (r) => r.data,
    enabled: files.length > 0,
    placeholderData: (previous) => previous,
  });
}

export function useGraph(repositoryId: string) {
  return useQuery({
    queryKey: ['graph', repositoryId],
    queryFn: () => api<{ data: GraphPayload }>(`${repo(repositoryId)}/graph`),
    select: (r) => r.data,
    // The graph is an index artifact; it does not change between runs.
    staleTime: 10 * 60_000,
  });
}

export function useFlakyTests(repositoryId: string) {
  return useQuery({
    queryKey: ['flaky-tests', repositoryId],
    queryFn: () =>
      api<{
        data: FlakyTestRow[];
        stats: {
          total: number;
          quarantined: number;
          worstFlakeRate: number | null;
          estimatedWastedMs: number;
          medianPipelineMs: number;
        };
      }>(`${repo(repositoryId)}/flaky-tests`),
  });
}

export function useBenchmark() {
  return useQuery({
    queryKey: ['diagnosis-benchmark'],
    queryFn: () => api<{ data: BenchmarkReport | null; reason?: string }>('/diagnosis/benchmark'),
    staleTime: 30 * 60_000,
  });
}
