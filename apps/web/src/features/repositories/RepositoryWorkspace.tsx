import { useSearchParams, useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  Code2,
  Network,
  Sparkles,
  FlaskConical,
  ScanLine,
  ArrowLeft,
  RefreshCw,
  ArrowRight,
  FileCode2,
} from 'lucide-react';
import { api, repositoryPath } from '../api';
import { analyzeRepository } from '../../api';
import { Loading, ErrorState, PageHeading, Status, EmptyState } from '../../components/ui';
import type { Repository } from './types';
import CodeBrowser from './CodeBrowser';
import AskRepository from './AskRepository';
import ReleaseList from '../releases/ReleaseList';
import { RepositoryInvestigationList } from '../releases/Investigations';
import Findings from '../releases/Findings';
import Dependencies from './Dependencies';
import { useEffect, useRef } from 'react';
const tabs = [
  ['overview', 'Overview', ScanLine],
  ['code', 'Code', Code2],
  ['dependencies', 'File connections', Network],
  ['ask', 'Ask CodeLens', Sparkles],
  ['releases', 'Releases', FlaskConical],
  ['findings', 'Findings & review', ScanLine],
] as const;
export default function RepositoryWorkspace() {
  const indexingRun = useRef<string | null>(null);
  const route = useNavigate();
  const { id = '' } = useParams(),
    [params, setParams] = useSearchParams(),
    client = useQueryClient();
  const tab = params.get('tab') ?? 'overview',
    requested = params.get('revision') ?? '';
  const branch = params.get('branch') ?? '';
  const branches = useQuery({
    queryKey: ['branches', id],
    queryFn: () => api(`${repositoryPath(id)}/branches`),
    enabled: id !== 'taskforge',
    staleTime: 60000,
  });
  const query = useQuery({
    queryKey: ['repository', id, requested, branch],
    queryFn: () =>
      api<{ data: Repository }>(
        `${repositoryPath(id)}?${new URLSearchParams({ ...(requested ? { revision: requested } : {}), ...(branch ? { branch } : {}) })}`,
      ),
    refetchInterval: (q) =>
      q.state.data?.data.analysisRuns.some((r) => ['pending', 'processing'].includes(r.status))
        ? 2500
        : false,
  });
  const index = useMutation({
    mutationFn: () =>
      id === 'taskforge'
        ? api('/fixture')
        : analyzeRepository(id, branch || branches.data?.data.defaultBranch),
    onSuccess: (result) => {
      indexingRun.current = id === 'taskforge' ? 'fixture' : result.data.id;
      navigate({ revision: '', path: '', line: '', branch: id === 'taskforge' ? '' : result.data.branch });
      client.invalidateQueries({ queryKey: ['repository', id] });
      client.invalidateQueries({ queryKey: ['repositories'] });
      branches.refetch();
    },
  });
  const navigate = (changes: Record<string, string>) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });
  useEffect(() => {
    const completed = query.data?.data.analysisRuns.find(
      (run) =>
        (indexingRun.current === 'fixture' || run.id === indexingRun.current) && run.status === 'completed',
    );
    if (indexingRun.current && completed) {
      indexingRun.current = null;
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set('tab', 'code');
        next.delete('revision');
        next.delete('path');
        return next;
      });
    }
  }, [query.data, setParams]);
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!query.data) return null;
  const repo = query.data.data,
    revision = repo.snapshot?.commitSha ?? '',
    latest = repo.analysisRuns[0],
    coverage = repo.snapshot ? JSON.parse(repo.snapshot.coverage) : null;
  const select = (path: string, line = 1) => navigate({ tab: 'code', path, line: String(line), revision });
  return (
    <div className="workspace-page">
      <Link to="/repositories" className="muted-link inline-actions">
        <ArrowLeft size={13} />
        All repositories
      </Link>
      <PageHeading
        eyebrow={id === 'taskforge' ? 'PREPARED EXAMPLE · REPOSITORY WORKSPACE' : repo.fullName.toUpperCase()}
        title={repo.name}
        description={repo.description ?? 'Understand this repository and verify its releases.'}
        action={
          <div className="inline-actions">
            <button
              className="btn-secondary"
              onClick={() => index.mutate()}
              disabled={index.isPending || ['pending', 'processing'].includes(latest?.status)}
            >
              <RefreshCw size={14} />
              {index.isPending ? 'Starting…' : 'Index latest code'}
            </button>
            <button
              className="btn-primary"
              onClick={() =>
                id === 'taskforge' ? navigate({ tab: 'releases' }) : route(`/repositories/${id}/investigate`)
              }
            >
              <FlaskConical size={14} />
              {id === 'taskforge' ? 'Rehearse release' : 'Investigate release'}
            </button>
          </div>
        }
      />
      {index.isError && <ErrorState error={index.error} />}
      {(tab === 'overview' || !revision) && (
        <section className="workspace-next-step" aria-label="Your next step">
          <div>
            <span className="eyebrow">
              {revision ? 'YOUR CODE IS READY TO EXPLORE' : 'STEP 1 · PREPARE YOUR WORKSPACE'}
            </span>
            <h2>
              {revision
                ? 'Understand first. Change with confidence.'
                : 'Choose a branch, then index its code.'}
            </h2>
            <p>
              {revision
                ? 'Open a file and ask about it. Review potential issues, then compare a change with its CI evidence.'
                : 'Indexing reads your code so CodeLens can answer questions with source references. It does not run or modify your repository.'}
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={index.isPending || ['pending', 'processing'].includes(latest?.status)}
            onClick={() => (revision ? navigate({ tab: 'code' }) : index.mutate())}
          >
            {revision ? 'Explore code & ask AI' : 'Index selected branch'} <ArrowRight size={15} />
          </button>
        </section>
      )}
      <nav className="journey-strip" aria-label="Repository workflow">
        <button className={!revision ? 'current' : 'complete'} onClick={() => navigate({ tab: 'overview' })}>
          <span>1</span>
          <div>
            <strong>Prepare</strong>
            <small>{revision ? 'Branch indexed' : 'Select branch & index'}</small>
          </div>
        </button>
        <button
          className={['code', 'ask', 'dependencies', 'findings'].includes(tab) ? 'current' : ''}
          disabled={!revision}
          onClick={() => navigate({ tab: 'code' })}
        >
          <span>2</span>
          <div>
            <strong>Understand</strong>
            <small>Explore code & ask AI</small>
          </div>
        </button>
        <button
          className={tab === 'releases' ? 'current' : ''}
          onClick={() =>
            id === 'taskforge' ? navigate({ tab: 'releases' }) : route(`/repositories/${id}/investigate`)
          }
        >
          <span>3</span>
          <div>
            <strong>Investigate</strong>
            <small>Compare a change & checks</small>
          </div>
        </button>
        <button
          onClick={() =>
            id === 'taskforge' ? navigate({ tab: 'findings' }) : route(`/repositories/${id}/changes`)
          }
        >
          <span>4</span>
          <div>
            <strong>Act</strong>
            <small>{id === 'taskforge' ? 'Review verified correction' : 'Review & prepare a draft PR'}</small>
          </div>
        </button>
      </nav>
      {id !== 'taskforge' && (
        <details className="branch-toolbar surface-panel" open={tab === 'overview' || !revision}>
          <summary>
            Branch & indexing settings · {branch || branches.data?.data.defaultBranch || 'loading'}
          </summary>
          <div className="inline-actions">
            <GitBranch size={17} />
            <label className="field-label branch-field">
              GitHub branch
              <select
                className="input"
                value={branch || branches.data?.data.defaultBranch || ''}
                onChange={(e) => navigate({ branch: e.target.value, revision: '', path: '', line: '' })}
                disabled={branches.isLoading}
              >
                {!branches.data && <option value="">Loading GitHub branches…</option>}
                {branch && !branches.data?.data.branches.some((b: any) => b.name === branch) && (
                  <option value={branch}>{branch} · no longer available</option>
                )}
                {branches.data?.data.branches.map((b: any) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                    {b.name === branches.data.data.defaultBranch ? ' · default' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn-secondary"
              onClick={() => branches.refetch()}
              disabled={branches.isFetching}
            >
              <RefreshCw size={14} /> Sync branches
            </button>
            <Link className="btn-secondary" to={`/repositories/${id}/delivery`}>
              CI/CD monitoring
            </Link>
            <Link className="text-link" to={`/repositories/${id}/changes`}>
              Prepare a change
            </Link>
          </div>
          {branches.isError && <ErrorState error={branches.error} retry={() => branches.refetch()} />}
          <p className="subtle-text mt-3">
            Choose a live GitHub branch, then index its latest code. Historical snapshots below remain
            available. {branches.data?.data.truncated ? 'Showing the first 1,000 branches.' : ''}
          </p>
        </details>
      )}
      {latest && ['pending', 'processing', 'failed'].includes(latest.status) && (
        <div className={`notice ${latest.status === 'failed' ? 'warning' : ''}`} role="status">
          <strong>Index {latest.status}</strong> ·{' '}
          {latest.status === 'failed'
            ? latest.error
            : `${latest.filesProcessed}/${latest.totalFiles} files · ${latest.progress}%`}{' '}
          {latest.status === 'failed' && (
            <button className="text-link ml-3" onClick={() => index.mutate()}>
              Retry indexing
            </button>
          )}
        </div>
      )}
      <div className="inline-actions">
        <GitBranch size={15} className="text-text-tertiary" />
        <label className="subtle-text" htmlFor="revision">
          Indexed revision
        </label>
        <select
          id="revision"
          className="input revision-select"
          value={requested || revision || ''}
          onChange={(e) =>
            navigate({
              revision: e.target.value,
              branch:
                id === 'taskforge'
                  ? ''
                  : repo.analysisRuns.find((run) => run.commitSha === e.target.value)?.branch || '',
              path: '',
              line: '',
            })
          }
        >
          {!revision && <option value="">No completed index</option>}
          {repo.analysisRuns
            .filter((r) => r.status === 'completed' && r.commitSha)
            .filter((r, i, a) => a.findIndex((x) => x.commitSha === r.commitSha) === i)
            .map((r) => (
              <option key={r.id} value={r.commitSha!}>
                {r.branch} · {r.commitSha!.slice(0, 10)}
              </option>
            ))}
        </select>
        {repo.snapshot && <Status value="indexed" />}
        {id !== 'taskforge' && (
          <Link className="muted-link ml-auto" to={`/repositories/${id}/tools`}>
            Repository settings & CI tools
          </Link>
        )}
      </div>
      <nav className="section-tabs" aria-label="Repository sections">
        {tabs.map(([key, label, Icon]) => (
          <button
            className={tab === key ? 'active' : ''}
            key={key}
            disabled={!revision && ['code', 'ask', 'dependencies', 'findings'].includes(key)}
            title={
              !revision && ['code', 'ask', 'dependencies', 'findings'].includes(key)
                ? 'Index this branch to unlock source tools'
                : undefined
            }
            onClick={() => navigate({ tab: key })}
          >
            <Icon size={14} />
            {key === 'releases' && id !== 'taskforge' ? 'Investigations' : label}
            {key === 'code' && <span className="count-badge">{repo.files.length}</span>}
          </button>
        ))}
      </nav>
      {tab === 'overview' && revision && (
        <>
          <div className="metric-grid">
            {[
              ['Indexed files', repo.files.length],
              ['Symbols', repo.snapshot?.symbolsIndexed ?? '—'],
              ['Resolved imports', repo.dependencyGraph.length],
              ['Static findings', repo.findings.length],
            ].map(([label, value]) => (
              <div className="metric-tile" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="two-column">
            <section className="surface-panel">
              <h2>Repository intelligence</h2>
              <p className="subtle-text">
                {coverage?.summary ??
                  'Index this repository to explore files, symbols and local imports. Existing source remains available while a new revision indexes.'}
              </p>
              <div className="mt-6">
                <h3>Start exploring</h3>
                {repo.files.slice(0, 5).map((f) => (
                  <button className="file-item" key={f.id} onClick={() => select(f.path)}>
                    <FileCode2 size={15} />
                    {f.path}
                    <ArrowRight className="ml-auto" size={13} />
                  </button>
                ))}
              </div>
            </section>
            <section className="surface-panel">
              <span className="feature-tag">
                <FlaskConical size={14} /> CONTINUE THE INVESTIGATION
              </span>
              <h2>What does this change affect?</h2>
              <p className="subtle-text">
                {id === 'taskforge'
                  ? 'Compare two versions with equivalent data. See what failed, inspect request evidence, and verify a supplied correction.'
                  : 'Compare baseline and candidate commits, inspect their source changes, and review matching GitHub CI evidence.'}
              </p>
              <button
                className="btn-primary mt-5"
                onClick={() =>
                  id === 'taskforge'
                    ? navigate({ tab: 'releases' })
                    : route(`/repositories/${id}/investigate`)
                }
              >
                {id === 'taskforge' ? 'Open release rehearsals' : 'Start your investigation'}{' '}
                <ArrowRight size={14} />
              </button>
              <div className="notice mt-6">
                {id === 'taskforge'
                  ? 'This prepared application supports measured HTTP journeys and bounded experiments.'
                  : 'Your investigation uses source and GitHub CI evidence. Application-specific behavior and performance tests run in your own CI environment.'}
              </div>
            </section>
          </div>
          {coverage && (
            <p className="subtle-text">
              {coverage.parser}. {coverage.limitations}
              {coverage.bounded ? ' This index reached a configured size limit.' : ''}
            </p>
          )}
        </>
      )}
      {tab === 'code' && (
        <CodeBrowser
          repo={repo}
          revision={revision}
          path={params.get('path') ?? ''}
          line={Number(params.get('line') ?? 1)}
          select={select}
        />
      )}
      {tab === 'dependencies' && <Dependencies repo={repo} select={select} />}
      {tab === 'ask' &&
        (revision ? (
          <AskRepository
            key={`${id}-${revision}`}
            id={id}
            revision={revision}
            selection={
              params.get('contextPath')
                ? {
                    path: params.get('contextPath')!,
                    ...(params.get('contextLine')
                      ? {
                          startLine: Number(params.get('contextLine')),
                          endLine: Number(params.get('contextLine')),
                        }
                      : {}),
                  }
                : undefined
            }
            clearSelection={() => navigate({ contextPath: '', contextLine: '' })}
          />
        ) : (
          <EmptyState
            title="Index the repository first"
            description="Questions require a completed source snapshot."
          />
        ))}
      {tab === 'releases' &&
        (id === 'taskforge' ? <ReleaseList id={id} /> : <RepositoryInvestigationList id={id} />)}
      {tab === 'findings' && (
        <Findings id={id} revision={revision} staticFindings={repo.findings} select={select} />
      )}
    </div>
  );
}
