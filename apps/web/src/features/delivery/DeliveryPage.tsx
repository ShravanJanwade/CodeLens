import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  CircleAlert,
  Clock,
  ExternalLink,
  GitBranch,
  Globe2,
  Radar,
  ShieldCheck,
  Timer,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { useDeliveryOverview, useRuns } from './queries';
import { DEMO_REPO } from './types';
import { duration, micros, pct, relative } from './format';
import RegionMatrix from './RegionMatrix';
import RunList from './RunList';
import { Loading, ErrorState } from '../../components/ui';

/**
 * Delivery overview: the state of every environment, the health of
 * the pipelines, and the runs that need attention.
 *
 * Ordering is deliberate. The first thing on the page is whether
 * anything is broken right now, then where, then why. A dashboard
 * that leads with a 30-day chart answers a question nobody is asking
 * at the moment they open it.
 */
export default function DeliveryPage() {
  const params = useParams();
  const repositoryId = params.repoId ?? DEMO_REPO;

  const [branch, setBranch] = useState('all');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');

  const overview = useDeliveryOverview(repositoryId);
  const runs = useRuns(repositoryId, { branch, status, category, limit: 40 });

  if (overview.isLoading) return <Loading label="Loading delivery state…" />;
  if (overview.error) return <ErrorState error={overview.error} retry={() => overview.refetch()} />;
  if (!overview.data) return null;

  const { repository, pipelines, environments, stats } = overview.data;
  const broken = environments.filter((e) => e.status !== 'healthy');
  const openFailures = overview.data.runs.filter((r) => r.status === 'failed');

  return (
    <div className="dl-page">
      <header className="dl-head">
        <div className="dl-head-main">
          <h1>
            <Workflow size={24} style={{ color: 'var(--c-brand-ink)' }} />
            Delivery
            {stats.activeRuns > 0 && (
              <span className="badge badge-run">
                <i className="dot dot-run" /> {stats.activeRuns} running
              </span>
            )}
          </h1>
          <p>
            <code className="code-inline">{repository.fullName}</code> — {repository.description}
          </p>
        </div>
        <div className="dl-head-actions">
          <Link className="btn btn-secondary" to={`/r/${encodeURIComponent(repositoryId)}/impact`}>
            <Radar size={15} /> Change impact
          </Link>
          {openFailures[0] && (
            <Link
              className="btn btn-primary"
              to={`/r/${encodeURIComponent(repositoryId)}/runs/${openFailures[0].runNumber}`}
            >
              <CircleAlert size={15} /> Triage run #{openFailures[0].runNumber}
            </Link>
          )}
        </div>
      </header>

      {/* ---- What needs attention, first ---- */}
      {broken.length > 0 && (
        <div className="alert alert-warn">
          <CircleAlert size={18} />
          <div>
            <strong>
              {broken.length} deploy target{broken.length === 1 ? '' : 's'} not on the latest revision
            </strong>
            <p>
              {broken.map((e) => `${e.name}/${e.region}`).join(', ')} —{' '}
              {broken.length === 1 ? 'it is' : 'they are'} serving an older build because the last deploy did
              not complete. The artifact itself is fine in the other regions.
            </p>
          </div>
        </div>
      )}

      {/* ---- Headline metrics ---- */}
      <div className="dl-metrics">
        <div className="dl-metric">
          <span className="dl-metric-top">
            <TrendingUp size={11} /> Success rate
          </span>
          <span className="dl-metric-value">{pct(stats.successRate, 1)}</span>
          <span className="dl-metric-note">
            {stats.windowRuns - stats.failedRuns} of {stats.windowRuns} recent runs green
          </span>
        </div>
        <div className="dl-metric">
          <span className="dl-metric-top">
            <Clock size={11} /> Pipeline duration
          </span>
          <span className="dl-metric-value">
            {duration(stats.p50DurationMs)}
            <small>p50</small>
          </span>
          <span className="dl-metric-note">p95 {duration(stats.p95DurationMs)}</span>
        </div>
        <div className="dl-metric accent">
          <span className="dl-metric-top">
            <Timer size={11} /> Time to root cause
          </span>
          <span className="dl-metric-value">{micros(stats.p95DiagnosisMs)}</span>
          <span className="dl-metric-note">p95 across {stats.diagnosedFailures} classified failures</span>
        </div>
        <div className="dl-metric pass">
          <span className="dl-metric-top">
            <BadgeCheck size={11} /> Author exonerated
          </span>
          <span className="dl-metric-value">{pct(stats.exoneratedPct, 0)}</span>
          <span className="dl-metric-note">
            {stats.exoneratedFailures} of {stats.diagnosedFailures} failures were not the commit&rsquo;s fault
          </span>
        </div>
        <div className="dl-metric">
          <span className="dl-metric-top">
            <Globe2 size={11} /> Deploy targets
          </span>
          <span className="dl-metric-value">{environments.length}</span>
          <span className="dl-metric-note">
            {new Set(environments.map((e) => e.region)).size} regions ·{' '}
            {new Set(environments.map((e) => e.tier)).size} tiers
          </span>
        </div>
      </div>

      {/* ---- Region matrix ---- */}
      <section className="panel-flush">
        <div className="panel-hd">
          <Globe2 size={15} style={{ color: 'var(--c-ink-3)' }} />
          <div>
            <h2>Where the code is running</h2>
            <p>Live revision, health and traffic for every deploy target.</p>
          </div>
        </div>
        <RegionMatrix environments={environments} />
      </section>

      {/* ---- Pipelines ---- */}
      <section className="panel-flush">
        <div className="panel-hd">
          <Activity size={15} style={{ color: 'var(--c-ink-3)' }} />
          <div>
            <h2>Pipelines</h2>
            <p>Workflows discovered in this repository.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Definition</th>
                <th className="right">Success rate</th>
                <th className="right">Median duration</th>
                <th className="right">Last run</th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="row-tight">
                      <i
                        className={`dot dot-${
                          (p.successRate ?? 1) >= 0.9 ? 'pass' : (p.successRate ?? 1) >= 0.7 ? 'warn' : 'fail'
                        }`}
                      />
                      <strong>{p.name}</strong>
                    </span>
                  </td>
                  <td>
                    <code className="code-inline">{p.filePath}</code>
                  </td>
                  <td className="right num">{pct(p.successRate, 1)}</td>
                  <td className="right num">{duration(p.p50DurationMs)}</td>
                  <td className="right">{relative(p.lastRunAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Runs ---- */}
      <section className="panel-flush">
        <div className="panel-hd">
          <GitBranch size={15} style={{ color: 'var(--c-ink-3)' }} />
          <div>
            <h2>Recent runs</h2>
            <p>Every failure carries a classified root cause.</p>
          </div>
          <div className="panel-hd-actions">
            <span className="tag-mono">{runs.data?.total ?? 0} shown</span>
          </div>
        </div>

        <div className="runs-filters">
          <select
            className="select"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            aria-label="Filter by branch"
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
            aria-label="Filter by status"
          >
            <option value="all">Any status</option>
            <option value="failed">Failed</option>
            <option value="success">Passed</option>
            <option value="running">Running</option>
          </select>
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by root cause"
          >
            <option value="all">Any root cause</option>
            {runs.data?.facets.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {(branch !== 'all' || status !== 'all' || category !== 'all') && (
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => {
                setBranch('all');
                setStatus('all');
                setCategory('all');
              }}
            >
              Clear filters
            </button>
          )}
          <div className="spacer" />
          <Link className="link" to={`/r/${encodeURIComponent(repositoryId)}/flakes`}>
            Flaky test registry <ExternalLink size={12} />
          </Link>
        </div>

        {runs.isLoading && !runs.data ? (
          <Loading label="Loading runs…" />
        ) : runs.error ? (
          <ErrorState error={runs.error} retry={() => runs.refetch()} />
        ) : (
          <RunList repositoryId={repositoryId} runs={runs.data?.data ?? []} />
        )}
      </section>

      <p className="text-xs muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={12} />
        Root causes are computed by a deterministic classifier over stage logs, run history and deploy
        topology — no model call, so the same evidence always yields the same verdict.{' '}
        <Link className="link" to="/benchmark">
          See its measured accuracy
        </Link>
      </p>
    </div>
  );
}
