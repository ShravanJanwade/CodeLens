import { Link, useParams } from 'react-router-dom';
import { Ban, Clock, FlaskConical, Repeat, TrendingDown, Workflow } from 'lucide-react';
import { useFlakyTests } from './queries';
import { DEMO_REPO } from './types';
import { duration, pct, relative } from './format';
import { Loading, ErrorState } from '../../components/ui';

/**
 * The flake registry. This is the table the classifier reads when it
 * decides a failure is noise rather than a regression, so it is worth
 * showing directly — the diagnosis is only as trustworthy as this
 * history.
 */
export default function FlakesPage() {
  const params = useParams();
  const repositoryId = params.repoId ?? DEMO_REPO;
  const query = useFlakyTests(repositoryId);

  if (query.isLoading) return <Loading label="Loading flake history…" />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!query.data) return null;

  const { data: tests, stats } = query.data;

  return (
    <div className="dl-page">
      <header className="dl-head">
        <div className="dl-head-main">
          <h1>
            <FlaskConical size={24} style={{ color: 'var(--c-brand-ink)' }} />
            Flaky tests
          </h1>
          <p>
            Tests that fail intermittently across unrelated branches. The classifier reads this history to
            tell a known flake apart from a real regression — without it, accuracy drops by 9.6 percentage
            points.
          </p>
        </div>
        <div className="dl-head-actions">
          <Link className="btn btn-secondary" to={`/r/${encodeURIComponent(repositoryId)}/delivery`}>
            <Workflow size={15} /> Delivery
          </Link>
          <Link className="btn btn-outline" to="/benchmark">
            <TrendingDown size={15} /> Ablation
          </Link>
        </div>
      </header>

      <div className="dl-metrics">
        <div className="dl-metric">
          <span className="dl-metric-top">
            <Repeat size={11} /> Tracked flakes
          </span>
          <span className="dl-metric-value">{stats.total}</span>
          <span className="dl-metric-note">{stats.quarantined} currently quarantined</span>
        </div>
        <div className="dl-metric fail">
          <span className="dl-metric-top">
            <TrendingDown size={11} /> Worst flake rate
          </span>
          <span className="dl-metric-value">{pct(stats.worstFlakeRate, 1)}</span>
          <span className="dl-metric-note">of runs fail on the noisiest test</span>
        </div>
        <div className="dl-metric">
          <span className="dl-metric-top">
            <Clock size={11} /> CI time lost
          </span>
          <span className="dl-metric-value">{duration(stats.estimatedWastedMs)}</span>
          <span className="dl-metric-note">
            flake failures × {duration(stats.medianPipelineMs)} median pipeline
          </span>
        </div>
      </div>

      <section className="panel-flush">
        <div className="panel-hd">
          <div>
            <h2>Registry</h2>
            <p>Ranked by flake rate. Cross-branch spread is what proves a failure is not your diff.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Test</th>
                <th>Suite</th>
                <th className="right">Flake rate</th>
                <th className="right">Failures</th>
                <th className="right">Branches</th>
                <th className="right">Last failed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id}>
                  <td>
                    <strong>{test.testName}</strong>
                    <p className="text-xs muted" style={{ marginTop: 2 }}>
                      <code>{test.filePath}</code>
                    </p>
                  </td>
                  <td>{test.suite}</td>
                  <td className="right num">
                    <span className={`badge ${test.flakeRate > 0.15 ? 'badge-fail' : 'badge-warn'}`}>
                      {pct(test.flakeRate, 1)}
                    </span>
                  </td>
                  <td className="right num">
                    {test.failCount}
                    <span className="muted"> / {test.runCount}</span>
                  </td>
                  <td className="right num">{test.distinctBranches}</td>
                  <td className="right">{relative(test.lastFailedAt)}</td>
                  <td className="right">
                    {test.quarantined && (
                      <span className="badge badge-idle">
                        <Ban size={10} /> quarantined
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-ft">
          A test failing at a low rate across many branches is infrastructure noise. A test failing
          deterministically on exactly one branch is a regression. That distinction is the whole difference
          between “press re-run” and “stop and fix”.
        </div>
      </section>
    </div>
  );
}
