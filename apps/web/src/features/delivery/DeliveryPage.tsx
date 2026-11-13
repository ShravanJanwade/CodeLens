import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Radar } from 'lucide-react';
import { useDeliveryOverview, useRuns } from './queries';
import { DEMO_REPO } from './types';
import { duration, micros, pct } from './format';
import Environments from './Environments';
import RunList from './RunList';
import { ActionLog, ReleaseInProgress } from './Releases';
import { Ago, useAccessGate } from './ui';
import { Loading, ErrorState } from '../../components/ui';

/**
 * The state of one repository's delivery: anything moving right now,
 * where each release is running, and every run with its root cause.
 *
 * The page answers "is anything broken or waiting on me?" before it
 * answers anything historical.
 */
export default function DeliveryPage() {
  const params = useParams();
  const repositoryId = params.repoId ?? DEMO_REPO;
  const [branch, setBranch] = useState('all');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');

  const overview = useDeliveryOverview(repositoryId);
  const runs = useRuns(repositoryId, { branch, status, category, limit: 40 });
  const gate = useAccessGate(repositoryId);

  if (overview.isLoading) return <Loading label="Loading delivery…" />;
  if (overview.error) return <ErrorState error={overview.error} retry={() => overview.refetch()} />;
  if (!overview.data) return null;

  const { repository, pipelines, environments, stats } = overview.data;
  const active = overview.data.activeRuns ?? [];
  const latestFailure = overview.data.runs.find((r) => r.status === 'failed');
  const filtered = branch !== 'all' || status !== 'all' || category !== 'all';
  const base = `/r/${encodeURIComponent(repositoryId)}`;

  return (
    <div className="page-stack">
      <header className="page-head">
        <div>
          <h1>Delivery</h1>
          <p className="page-sub">
            {pipelines.length} workflow{pipelines.length === 1 ? '' : 's'} · {environments.length}{' '}
            environments in {new Set(environments.map((e) => e.region)).size} regions · default branch{' '}
            <span className="mono">{repository.defaultBranch}</span>
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-secondary btn-sm" to={`${base}/impact`}>
            <Radar size={14} /> Change impact
          </Link>
          {latestFailure && (
            <Link className="btn btn-primary btn-sm" to={`${base}/runs/${latestFailure.runNumber}`}>
              Latest failure <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </header>

      <dl className="stats">
        <div>
          <dt>Success rate</dt>
          <dd>{pct(stats.successRate, 0)}</dd>
          <span>
            {stats.windowRuns - stats.failedRuns} of {stats.windowRuns} recent runs passed
          </span>
        </div>
        <div>
          <dt>Median duration</dt>
          <dd>{duration(stats.p50DurationMs)}</dd>
          <span>p95 {duration(stats.p95DurationMs)}</span>
        </div>
        <div>
          <dt>Failures diagnosed</dt>
          <dd>{stats.diagnosedFailures}</dd>
          <span>in {micros(stats.p95DiagnosisMs)} each at p95, no model call</span>
        </div>
        <div>
          <dt>Not the author&rsquo;s fault</dt>
          <dd>{pct(stats.exoneratedPct, 0)}</dd>
          <span>
            {stats.exoneratedFailures} of {stats.diagnosedFailures} failures cleared the commit
          </span>
        </div>
      </dl>

      {active.length > 0 && (
        <section className="section">
          <div className="section-hd">
            <h2>In progress</h2>
          </div>
          <div className="stack-3">
            {active.map((run) => (
              <ReleaseInProgress key={run.id} repositoryId={repositoryId} run={run} gate={gate} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-hd">
          <h2>Environments</h2>
          <p>What each target runs now. Roll back from the menu on its row.</p>
        </div>
        <div className="panel-flush">
          {environments.length ? (
            <Environments
              repositoryId={repositoryId}
              repoFullName={overview.data.sync ? repository.fullName : null}
              environments={environments}
              gate={gate}
            />
          ) : (
            <div className="state">
              <h3>No deploys yet</h3>
              <p>Jobs with a GitHub environment show up here once they run.</p>
            </div>
          )}
        </div>
      </section>

      <div className="split">
        <section className="section">
          <div className="section-hd">
            <h2>Runs</h2>
            <div className="filters">
              <select
                className="select"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                aria-label="Branch"
              >
                <option value="all">All branches</option>
                {runs.data?.facets.branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status"
              >
                <option value="all">Any status</option>
                <option value="failed">Failed</option>
                <option value="success">Passed</option>
                <option value="running">In progress</option>
                <option value="blocked">Waiting</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Root cause"
              >
                <option value="all">Any cause</option>
                {runs.data?.facets.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {filtered && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setBranch('all');
                    setStatus('all');
                    setCategory('all');
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="panel-flush">
            {runs.isLoading && !runs.data ? (
              <div className="stack-2" style={{ padding: 16 }}>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="skeleton" style={{ height: 40 }} />
                ))}
              </div>
            ) : runs.error ? (
              <ErrorState error={runs.error} retry={() => runs.refetch()} />
            ) : (
              <RunList repositoryId={repositoryId} runs={runs.data?.data ?? []} />
            )}
          </div>
        </section>

        <aside className="side">
          <section className="section">
            <div className="section-hd">
              <h2>Workflows</h2>
            </div>
            <ul className="workflows panel-flush">
              {pipelines.map((p) => (
                <li key={p.id}>
                  <div className="truncate">
                    <strong>{p.name}</strong>
                    <span className="mono muted">{p.filePath.split('/').pop()}</span>
                  </div>
                  <div className="workflow-stats">
                    <span
                      className={`num ${(p.successRate ?? 1) < 0.7 ? 'tone-fail' : (p.successRate ?? 1) < 0.9 ? 'tone-warn' : 'tone-pass'}`}
                    >
                      {pct(p.successRate, 0)}
                    </span>
                    <span className="muted num">{duration(p.p50DurationMs)}</span>
                    <span className="muted">
                      <Ago iso={p.lastRunAt} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="section">
            <div className="section-hd">
              <h2>Recent actions</h2>
            </div>
            <div className="panel-flush">
              <ActionLog repositoryId={repositoryId} />
            </div>
          </section>
          <p className="footnote">
            Root causes come from a deterministic classifier over logs, run history and deploy topology.{' '}
            <Link className="link" to="/benchmark">
              How accurate it is
            </Link>
          </p>
        </aside>
      </div>
      {gate.dialog}
    </div>
  );
}
