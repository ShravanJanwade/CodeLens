// Pipeline actions: what the signed-in person may do, and the calls
// that do it. Every mutation goes to the CodeLens API, which checks
// with GitHub that this person can write to the repository and then
// acts with their own GitHub token.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useToast } from '../../components/overlay';
import type { ActionAccess, ActionRecord, ActionResult, FixPreview, PendingGate, Release } from './types';

const repo = (id: string) => `/repositories/${encodeURIComponent(id)}`;

export function useActionAccess(repositoryId: string) {
  return useQuery({
    queryKey: ['action-access', repositoryId],
    queryFn: () => api<{ data: ActionAccess }>(`${repo(repositoryId)}/actions/access`),
    select: (r) => r.data,
    staleTime: 60_000,
  });
}

/** Where a sign-in for actions should start, returning to this page afterwards. */
export function signInToActHref(): string {
  const next = `${window.location.pathname}${window.location.search}`;
  return `/api/v1/auth/github/start?purpose=connect&next=${encodeURIComponent(next)}`;
}

export function useActionLog(repositoryId: string) {
  return useQuery({
    queryKey: ['action-log', repositoryId],
    queryFn: () => api<{ data: ActionRecord[] }>(`${repo(repositoryId)}/actions`),
    select: (r) => r.data,
  });
}

export function useGates(repositoryId: string, runNumber: number | undefined, waiting: boolean) {
  return useQuery({
    queryKey: ['gates', repositoryId, runNumber],
    queryFn: () => api<{ data: PendingGate[] }>(`${repo(repositoryId)}/pipeline-runs/${runNumber}/gates`),
    select: (r) => r.data,
    enabled: waiting && Number.isFinite(runNumber),
    refetchInterval: waiting ? 15_000 : false,
  });
}

export function useReleases(repositoryId: string, environment: string | null) {
  return useQuery({
    queryKey: ['releases', repositoryId, environment],
    queryFn: () =>
      api<{ data: { releases: Release[] } }>(
        `${repo(repositoryId)}/environments/${encodeURIComponent(environment!)}/releases`,
      ),
    select: (r) => r.data.releases,
    enabled: Boolean(environment),
  });
}

export function useFixPreview(
  repositoryId: string,
  fix: { kind: FixPreview['kind']; runNumber?: number; test?: string } | null,
) {
  const params = new URLSearchParams();
  if (fix) {
    params.set('kind', fix.kind);
    if (fix.runNumber) params.set('runNumber', String(fix.runNumber));
    if (fix.test) params.set('test', fix.test);
  }
  return useQuery({
    queryKey: ['fix-preview', repositoryId, params.toString()],
    queryFn: () => api<{ data: FixPreview }>(`${repo(repositoryId)}/fixes/preview?${params}`),
    select: (r) => r.data,
    enabled: Boolean(fix),
    retry: false,
    staleTime: 0,
  });
}

/** One mutation shape for every action: post, refresh what it changed, say what happened. */
function useAction<TInput>(repositoryId: string, path: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: TInput) =>
      api<{ data: ActionResult }>(`${repo(repositoryId)}${path}`, {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: (result) => {
      toast({ tone: 'pass', title: result.message, href: result.url ?? undefined });
      for (const key of [
        'delivery-overview',
        'pipeline-run',
        'pipeline-runs',
        'action-log',
        'gates',
        'flaky-tests',
      ])
        void client.invalidateQueries({ queryKey: [key, repositoryId] });
    },
    onError: (error: Error) => {
      toast({ tone: 'fail', title: error.message });
      void client.invalidateQueries({ queryKey: ['action-log', repositoryId] });
    },
  });
}

export const useRerun = (repositoryId: string) =>
  useAction<{ runNumber: number; mode: 'failed' | 'all' | 'job'; stageKey?: string }>(
    repositoryId,
    '/actions/rerun',
  );

export const useRedeploy = (repositoryId: string) =>
  useAction<{ environment: string; commitSha: string }>(repositoryId, '/actions/redeploy');

export const useReview = (repositoryId: string) =>
  useAction<{
    runNumber: number;
    environments: string[];
    decision: 'approved' | 'rejected';
    comment?: string;
  }>(repositoryId, '/actions/review');

export const useOpenFix = (repositoryId: string) =>
  useAction<{ kind: FixPreview['kind']; runNumber?: number; test?: string; baseSha: string }>(
    repositoryId,
    '/actions/fix',
  );

export const ACTION_LABEL: Record<ActionRecord['kind'], string> = {
  'rerun-failed': 'Re-ran failed jobs',
  'rerun-all': 'Re-ran all jobs',
  'rerun-job': 'Re-ran a job',
  redeploy: 'Redeployed',
  approve: 'Approved',
  reject: 'Rejected',
  'fix-pr': 'Opened a fix',
};
