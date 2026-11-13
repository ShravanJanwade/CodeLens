import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useFlakyTests } from './queries';
import { DEMO_REPO, type FlakyTestRow } from './types';
import { duration, pct } from './format';
import FixDialog, { type FixRequest } from './FixDialog';
import { Ago, useAccessGate } from './ui';
import { Loading, ErrorState } from '../../components/ui';

/**
 * Failure history per test. The classifier reads this to tell a known
 * flake from a regression, so the page shows the same split it makes:
 * tests past the bar for "flaky", and tests that failed for a reason.
 */
export default function FlakesPage() {
  const params = useParams();
  const repositoryId = params.repoId ?? DEMO_REPO;
  const query = useFlakyTests(repositoryId);
  const gate = useAccessGate(repositoryId);
  const [fix, setFix] = useState<FixRequest | null>(null);

  if (query.isLoading) return <Loading label="Loading test history…" />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!query.data) return null;

  const { data: tests, stats } = query.data;
  // Rows from older APIs carry no verdict; treat them all as flaky, as they used to be.
  const flaky = tests.filter((t) => (t.status ?? 'flaky') === 'flaky');
  const others = tests.filter((t) => t.status === 'not-flaky');
  const bar = stats.thresholds;

  return (
    <div className="page-stack">
      <header className="page-head">
        <div>
          <h1>Flaky tests</h1>
          <p className="page-sub">
            {bar
              ? `A test counts as flaky once it has failed in at least ${pct(bar.minFlakeRate, 0)} of ${bar.minRuns}+ runs, on ${bar.minBranches} or more branches. Below that, a failure is treated as the change's fault.`
              : 'Tests that fail intermittently across unrelated branches.'}
          </p>
        </div>
      </header>

      <dl className="stats">
        <div>
          <dt>Known flaky</dt>
          <dd>{stats.total}</dd>
          <span>{stats.quarantined} quarantined</span>
        </div>
        <div>
          <dt>Worst flake rate</dt>
          <dd>{pct(stats.worstFlakeRate, 0)}</dd>
          <span>of runs fail on the noisiest test</span>
        </div>
        <div>
          <dt>CI time lost to flakes</dt>
          <dd>{duration(stats.estimatedWastedMs)}</dd>
          <span>flaky failures × {duration(stats.medianPipelineMs)} median run</span>
        </div>
        <div>
          <dt>Other failing tests</dt>
          <dd>{stats.otherFailing ?? others.length}</dd>
          <span>failed for a reason of their own</span>
        </div>
      </dl>

      <section className="section">
        <div className="section-hd">
          <h2>Known flaky</h2>
          <p>
            Quarantining opens a pull request that skips the test with a note, so it stops blocking unrelated
            work.
          </p>
        </div>
        <div className="panel-flush">
          {flaky.length ? (
            <TestTable
              tests={flaky}
              action={(test) => (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setFix({ kind: 'quarantine-test', test: test.testName })}
                >
                  <ShieldOff size={13} /> Quarantine
                </button>
              )}
            />
          ) : (
            <div className="state">
              <h3>No known flaky tests</h3>
              <p>Nothing has failed often enough, on enough branches, to be called flaky.</p>
            </div>
          )}
        </div>
      </section>

      {others.length > 0 && (
        <section className="section">
          <div className="section-hd">
            <h2>Other failing tests</h2>
            <p>Below the bar for flaky, so a failure here counts against the change that caused it.</p>
          </div>
          <div className="panel-flush">
            <TestTable tests={others} />
          </div>
        </section>
      )}

      <FixDialog repositoryId={repositoryId} fix={fix} gate={gate} onClose={() => setFix(null)} />
      {gate.dialog}
    </div>
  );
}

function TestTable({ tests, action }: { tests: FlakyTestRow[]; action?: (test: FlakyTestRow) => ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Test</th>
            <th className="right">Fails</th>
            <th className="right">Rate</th>
            <th className="right">Branches</th>
            <th>{action ? 'Last failed' : 'Why not flaky'}</th>
            {action && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => (
            <tr key={test.id}>
              <td className="test-cell">
                <strong>{test.testName.split(' > ').pop()}</strong>
                <span className="muted mono">
                  {test.filePath}
                  {test.suite && test.suite !== test.filePath ? ` · ${test.suite}` : ''}
                </span>
              </td>
              <td className="right num">
                {test.failCount}
                <span className="muted"> / {test.runCount}</span>
              </td>
              <td className="right num">
                <span
                  className={
                    test.status === 'flaky' || !test.status
                      ? test.flakeRate >= 0.1
                        ? 'tone-fail'
                        : 'tone-warn'
                      : ''
                  }
                >
                  {pct(test.flakeRate, 0)}
                </span>
              </td>
              <td className="right num">{test.distinctBranches}</td>
              <td className="muted">{action ? <Ago iso={test.lastFailedAt} /> : test.reason}</td>
              {action && (
                <td className="right">
                  {test.quarantined ? <span className="badge">Quarantined</span> : action(test)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
