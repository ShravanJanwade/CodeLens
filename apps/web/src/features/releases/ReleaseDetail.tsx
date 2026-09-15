import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Download, Square, ArrowUpRight, FlaskConical, FileCode2 } from 'lucide-react';
import { api, repositoryPath } from '../api';
import { API_BASE } from '../../api';
import { PageHeading, Status, Loading, ErrorState, EmptyState } from '../../components/ui';
import RevisionChanges from './RevisionChanges';
export default function ReleaseDetail({ recorded = false }: { recorded?: boolean }) {
  const { id = 'taskforge', runId = '' } = useParams(),
    [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'summary';
  const query = useQuery({
    queryKey: ['release', recorded ? 'recorded' : id, runId],
    queryFn: async () => {
      if (recorded) {
        const r = await fetch('/evidence/taskforge-recorded.json');
        if (!r.ok)
          throw new Error('The recorded report is not bundled. Run rehearsal:record locally to generate it.');
        return { data: await r.json() };
      }
      return api(`${repositoryPath(id)}/rehearsals/${runId}`);
    },
    refetchInterval: (q) =>
      recorded || ['completed', 'failed', 'cancelled'].includes(q.state.data?.data.status) ? false : 2500,
  });
  const cancel = useMutation({
    mutationFn: () => api(`${repositoryPath(id)}/rehearsals/${runId}/cancel`, { method: 'POST' }),
    onSuccess: () => query.refetch(),
  });
  if (query.isLoading) return <Loading label="Opening rehearsal evidence…" />;
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const run = query.data?.data;
  if (!run) return null;
  const stage = (name: string) => run.attempts.find((a: any) => a.stage === name && a.status === 'completed');
  const baseline = stage('baseline'),
    candidate = stage('candidate'),
    investigation = stage('investigation'),
    report = stage('report'),
    comparison = stage('comparison');
  const checks = report?.evidence.checks ?? comparison?.evidence.checks ?? [];
  const active = !['completed', 'failed', 'cancelled'].includes(run.status);
  const linkToSource = (revision: string, path: string, line = 1) =>
    recorded
      ? `/recorded?tab=source&revision=${revision}&path=${encodeURIComponent(path)}&line=${line}`
      : `/repositories/${id}?tab=code&revision=${revision}&path=${encodeURIComponent(path)}&line=${line}`;
  const reportUrl = recorded
    ? '/evidence/taskforge-recorded.json'
    : `${API_BASE}${repositoryPath(id)}/rehearsals/${run.id}/report`;
  const table = (items: any[]) => (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Check</th>
            <th>Result</th>
            <th>Expected</th>
            <th>Observed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c: any, i: number) => (
            <tr key={i}>
              <td className="wrap">{c.name}</td>
              <td>
                <Status value={c.outcome} />
              </td>
              <td className="wrap">{c.expected}</td>
              <td className="wrap">
                {c.actual}
                {c.traceId && (
                  <button
                    className="text-link block mt-2"
                    onClick={() => setParams({ tab: 'evidence', trace: c.traceId })}
                  >
                    Inspect trace
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="workspace-page">
      <Link
        to={recorded ? '/repositories' : `/repositories/${id}?tab=releases`}
        className="muted-link inline-actions"
      >
        <ArrowLeft size={13} />
        {recorded ? 'Repository workspace' : 'TaskForge / Releases'}
      </Link>
      <PageHeading
        eyebrow={
          recorded
            ? 'RECORDED INVESTIGATION · ACTUAL COMPLETED EXECUTION'
            : 'REPOSITORY-LINKED RELEASE REHEARSAL'
        }
        title="A change, under the lens."
        description={`${run.config.baseline} → ${run.config.candidate} · TaskForge prepared example`}
        action={
          <div className="inline-actions">
            {active && !recorded && (
              <button
                className="btn-secondary"
                disabled={cancel.isPending || run.status === 'cancelling'}
                onClick={() => cancel.mutate()}
              >
                <Square size={12} />
                Cancel run
              </button>
            )}
            <a className="btn-secondary" href={reportUrl} download>
              <Download size={14} />
              Download report
            </a>
          </div>
        }
      />
      <div className="inline-actions">
        <Status value={run.status} />
        <code className="subtle-text">
          {run.baseline.slice(0, 10)} → {run.candidate.slice(0, 10)}
        </code>
        <span className="subtle-text">{new Date(run.createdAt).toLocaleString()}</span>
      </div>
      {recorded && (
        <div className="notice">
          These are recorded results from the timestamp above, with actual HTTP and database measurements. No
          request is running now.{' '}
          <Link className="text-link" to="/repositories/taskforge?tab=releases">
            Run a fresh rehearsal <ArrowUpRight size={13} />
          </Link>
        </div>
      )}
      {run.error && <ErrorState error={run.error} />} {cancel.isError && <ErrorState error={cancel.error} />}
      {active && (
        <>
          <p className="subtle-text" role="status">
            {run.status === 'queued'
              ? 'Queued. Waiting for the single fixture executor.'
              : 'Execution state is persisted. Completed evidence survives an interrupted worker.'}
          </p>
          <div className="run-stage-grid">
            {['baseline', 'candidate', 'investigation', 'correction', 'report'].map((s) => (
              <div className="run-stage" key={s}>
                <strong>{s}</strong>
                <Status
                  value={
                    stage(s)
                      ? 'completed'
                      : run.attempts.some((a: any) => a.stage === s && a.status === 'running')
                        ? 'running'
                        : 'pending'
                  }
                />
              </div>
            ))}
          </div>
        </>
      )}
      <nav className="section-tabs" aria-label="Release sections">
        {[
          'summary',
          'journeys',
          'changes',
          'performance',
          'investigation',
          'experiments',
          'evidence',
          ...(recorded ? ['source'] : []),
          'report',
        ].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setParams({ tab: t })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'summary' && (
        <>
          <div className="metric-grid">
            {[
              ['Passed', checks.filter((c: any) => c.outcome === 'passed').length],
              ['Failed', checks.filter((c: any) => c.outcome === 'failed').length],
              ['Inconclusive', checks.filter((c: any) => c.outcome === 'inconclusive').length],
              ['Evidence stages', run.attempts.filter((a: any) => a.status === 'completed').length],
            ].map(([label, value]) => (
              <div className="metric-tile" key={label}>
                <span>{label}</span>
                <strong>{checks.length || label === 'Evidence stages' ? value : '—'}</strong>
              </div>
            ))}
          </div>
          <div className="two-column">
            <section className="surface-panel">
              <h2>What changed?</h2>
              <p className="subtle-text">
                {investigation?.evidence.observation ??
                  'Results appear after baseline and candidate measurements finish.'}
              </p>
              {checks
                .filter((c: any) => c.outcome === 'failed')
                .map((c: any) => (
                  <div className="notice warning mt-4" key={c.name}>
                    <strong>{c.name}</strong>
                    <p>
                      Expected {c.expected}. Observed {c.actual}.
                    </p>
                  </div>
                ))}
              {checks.length > 0 && !checks.some((c: any) => c.outcome === 'failed') && (
                <div className="notice mt-4">
                  No failed checks under the tested conditions. Review any inconclusive timings and the report
                  limitations.
                </div>
              )}
            </section>
            <section className="surface-panel">
              <h2>What should I do next?</h2>
              <p className="subtle-text">
                Open the journey and query traces, review the measured probe, then inspect the supplied
                correction. Every conclusion is limited to this test environment.
              </p>
              <div className="inline-actions mt-5">
                <button className="btn-primary" onClick={() => setParams({ tab: 'investigation' })}>
                  Inspect investigation
                </button>
                <Link className="text-link" to={linkToSource(run.candidate, 'src/app.ts')}>
                  Open candidate source
                </Link>
              </div>
            </section>
          </div>
        </>
      )}
      {tab === 'journeys' &&
        (checks.length ? (
          <>
            <div className="notice">
              HTTP journeys check permission behavior, schema, business values, search, and bounded
              asynchronous completion. Generated report IDs are used only for polling. Issue ordering and
              assertions are not normalized away.
            </div>
            {table(
              checks.filter((c: any) => !c.name.includes('latency') && !c.name.includes('query budget')),
            )}
            {run.attempts
              .filter((a: any) => a.stage.startsWith('browser-') && a.status === 'completed')
              .map((a: any) => (
                <section className="surface-panel" key={a.id}>
                  <h2>
                    {a.stage} · {a.evidence.engine}
                  </h2>
                  {table(a.evidence.checks)}
                </section>
              ))}
            <section className="surface-panel">
              <h2>Reproduce a failed journey</h2>
              {checks
                .filter((c: any) => c.outcome === 'failed' && c.request)
                .map((c: any) => (
                  <pre className="evidence-json mt-3" key={c.name}>
                    {c.request}
                  </pre>
                ))}
              <p className="subtle-text mt-3">
                Start the matching prepared fixture version with the same data. Full replay instructions and
                the selected revisions are in the downloadable report. These are bounded reproducers; no
                global minimality claim.
              </p>
            </section>
          </>
        ) : (
          <EmptyState
            title="Journeys have not completed"
            description="Results appear when the candidate stage commits its evidence."
          />
        ))}
      {tab === 'changes' && <RevisionChanges run={run} recorded={recorded} />}
      {tab === 'performance' &&
        (baseline && candidate ? (
          <>
            <div className="notice">
              {baseline.evidence.engine} · sequential environments · four warmup requests · two repetitions of
              16 measured requests · concurrency 1. Throughput is achieved closed-loop load. Process CPU and
              memory include the executor.
            </div>
            <div className="two-column">
              <section className="surface-panel">
                <h2>Request latency · p95</h2>
                {[baseline, candidate].map((a: any, i: number) => {
                  const value = a.evidence.repetitions.reduce((sum: number, r: any) => sum + r.p95Ms, 0) / 2;
                  const max = Math.max(
                    ...[baseline, candidate].map(
                      (x: any) => x.evidence.repetitions.reduce((s: number, r: any) => s + r.p95Ms, 0) / 2,
                    ),
                  );
                  return (
                    <div className="chart-row" key={a.id}>
                      <span>{a.stage}</span>
                      <div>
                        <div
                          className={`performance-bar ${i ? 'candidate' : ''}`}
                          style={{ width: `${(value / max) * 100}%` }}
                        />
                      </div>
                      <span>{value.toFixed(2)} ms</span>
                    </div>
                  );
                })}
                <p className="subtle-text">
                  Mean of repetition p95 values; inspect repetitions below for variability.
                </p>
              </section>
              <section className="surface-panel">
                <h2>Database queries per request</h2>
                {[baseline, candidate].map((a: any) => (
                  <div className="chart-row" key={a.id}>
                    <span>{a.stage}</span>
                    <strong>{Math.max(...a.evidence.repetitions.map((r: any) => r.maxQueries))}</strong>
                    <span>queries</span>
                  </div>
                ))}
                <p className="subtle-text">
                  Measured by the fixture query wrapper. SQL statements and durations are inspectable in each
                  trace.
                </p>
              </section>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Version / repetition</th>
                    <th>p50</th>
                    <th>p95</th>
                    <th>Achieved req/s</th>
                    <th>Error rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[baseline, candidate].flatMap((a: any) =>
                    a.evidence.repetitions.map((r: any, i: number) => (
                      <tr key={`${a.id}-${i}`}>
                        <td>
                          {a.stage} / {i + 1}
                        </td>
                        <td>{r.p50Ms.toFixed(2)} ms</td>
                        <td>{r.p95Ms.toFixed(2)} ms</td>
                        <td>{r.throughput.toFixed(1)}</td>
                        <td>{((r.errors / r.requests) * 100).toFixed(1)}%</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            {table(checks.filter((c: any) => c.name.includes('latency') || c.name.includes('query budget')))}
          </>
        ) : active ? (
          <Loading label="Waiting for performance evidence…" />
        ) : (
          <EmptyState
            title="Performance measurement did not complete"
            description="Inspect the persisted attempts for the failure or cancellation details."
          />
        ))}
      {tab === 'investigation' &&
        (investigation ? (
          <>
            <div className="two-column">
              <section className="surface-panel">
                <span className="eyebrow">OBSERVATION</span>
                <h2>{investigation.evidence.observation}</h2>
                <span className="eyebrow block mt-6">HYPOTHESIS</span>
                <p className="subtle-text">{investigation.evidence.hypothesis}</p>
                <span className="eyebrow block mt-6">BOUNDED EXPERIMENT</span>
                <p className="subtle-text">
                  Compare page sizes{' '}
                  {stage('page-size-probe')?.evidence.pageSize ?? 'selected by the investigator'} and 20 on
                  fresh equivalent starting data. Inspect whether query count grows with returned issues.
                </p>
                <button
                  className="btn-secondary mt-5"
                  onClick={() => setParams({ tab: 'evidence', stage: 'page-size-probe' })}
                >
                  Inspect probe evidence
                </button>
              </section>
              <section className="surface-panel">
                <span className="eyebrow">EVIDENCE REVIEW · {investigation.evidence.provider}</span>
                <p className="subtle-text">{investigation.evidence.explanation}</p>
                {investigation.evidence.ai && (
                  <>
                    <h3 className="mt-5">AI interpretation · review against evidence</h3>
                    <p className="subtle-text whitespace-pre-wrap">{investigation.evidence.ai}</p>
                  </>
                )}
                <Link className="text-link mt-5" to={linkToSource(run.candidate, 'src/app.ts')}>
                  Open explicitly mapped source <FileCode2 size={14} />
                </Link>
              </section>
            </div>
            <div className="notice warning">
              An observed pattern supports a hypothesis within tested conditions. A successful correction does
              not establish a universal root cause. Source mapping is explicit fixture metadata, not an
              inferred call graph.
            </div>
          </>
        ) : active ? (
          <Loading label="Waiting for the bounded investigation…" />
        ) : (
          <EmptyState
            title="Investigation did not complete"
            description="Any completed measurements remain available in Evidence."
          />
        ))}
      {tab === 'experiments' && (
        <>
          <section className="surface-panel">
            <h2>Verify the supplied correction</h2>
            <p className="subtle-text">
              {run.correction
                ? `Correction ${run.correction.slice(0, 10)} is measured from fresh data under the same journeys and workload.`
                : 'No correction selected for this run.'}
            </p>
            {report?.evidence.correction && <div className="mt-5">{table(report.evidence.correction)}</div>}
          </section>
          <section className="surface-panel">
            <h2>Bounded worker configuration search</h2>
            <p className="subtle-text">Objective: {run.config.objective}</p>
            <div className="run-stage-grid mt-5">
              {run.attempts
                .filter((a: any) => a.stage.startsWith('workers-') && a.status === 'completed')
                .map((a: any) => (
                  <div className="run-stage" key={a.id}>
                    <strong>{a.evidence.workers} worker(s)</strong>
                    <Status
                      value={
                        a.evidence.checks.every((c: any) => c.outcome === 'passed') ? 'passed' : 'failed'
                      }
                    />
                  </div>
                ))}
            </div>
            {report && (
              <p className="notice mt-5">
                Best tested passing worker count: {report.evidence.bestTestedWorkers ?? 'none'}. The selected
                configuration is checked separately with page size 10. This is not a global optimum or a
                cloud-cost estimate.
              </p>
            )}
            {report?.evidence.validation && <div className="mt-5">{table(report.evidence.validation)}</div>}
          </section>
        </>
      )}
      {tab === 'evidence' && (
        <div className="space-y-4">
          <p className="subtle-text">
            Persisted attempts, actual request traces, SQL query durations, and measurement settings.
            Interrupted measurements are rerun from fresh starting data.
          </p>
          {run.attempts.map((a: any) => {
            const trace = a.evidence?.traces?.find((t: any) => t.id === params.get('trace'));
            return (
              <details className="surface-panel" key={a.id} open={!!trace || params.get('stage') === a.stage}>
                <summary className="inline-actions cursor-pointer">
                  <strong>{a.stage}</strong>
                  <Status value={a.status} />
                  <code className="subtle-text">
                    attempt {a.attempt} · {a.id.slice(0, 8)}
                  </code>
                </summary>
                <pre className="evidence-json mt-4">
                  {JSON.stringify(trace ?? a.evidence ?? { error: a.error }, null, 2)}
                </pre>
              </details>
            );
          })}
        </div>
      )}
      {tab === 'source' && recorded && (
        <section className="surface-panel">
          <h2>Recorded source snapshot</h2>
          <p className="subtle-text mb-4">
            Source bundled with this completed run. Revision {params.get('revision') || run.candidate}.
          </p>
          {(run.sources ?? [])
            .filter(
              (s: any) =>
                s.revision === (params.get('revision') || run.candidate) &&
                (!params.get('path') || s.path === params.get('path')),
            )
            .map((s: any) => (
              <details key={`${s.revision}-${s.path}`} open>
                <summary>{s.path}</summary>
                <pre className="evidence-json mt-3">
                  {s.content
                    .split('\n')
                    .map((l: string, i: number) => `${i + 1}  ${l}`)
                    .join('\n')}
                </pre>
              </details>
            ))}
        </section>
      )}
      {tab === 'report' && (
        <section className="surface-panel">
          <h2>Reproducible, inspectable results.</h2>
          <p className="subtle-text">
            The JSON report includes revisions, build identity, data identity, workload and tool versions,
            stage attempts, SQL traces, measurements, and uncertainty. Completed evidence remains accessible
            even if a later stage fails.
          </p>
          <a className="btn-primary mt-5" href={reportUrl} download>
            <Download size={14} />
            Download evidence report
          </a>
          <h3 className="mt-7">Limits of this investigation</h3>
          <ul className="subtle-text list-disc pl-5 space-y-2">
            {(report?.evidence.limitations ?? ['The run has not yet completed its final report.']).map(
              (l: string) => (
                <li key={l}>{l}</li>
              ),
            )}
          </ul>
          <pre className="evidence-json mt-5">
            {JSON.stringify(
              {
                revisions: { baseline: run.baseline, candidate: run.candidate, correction: run.correction },
                configuration: run.config,
                reproduction: report?.evidence.reproduction,
              },
              null,
              2,
            )}
          </pre>
        </section>
      )}
    </div>
  );
}
