import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { RefreshCw, ArrowUpRight, Workflow, ShieldCheck, GitPullRequest, Radio, Webhook } from 'lucide-react';
import { api, repositoryPath } from '../api';
import { PageHeading, Status, Loading, ErrorState, EmptyState } from '../../components/ui';
export default function Delivery() {
  const { id = '' } = useParams(),
    [tab, setTab] = useState('workflows'),
    [job, setJob] = useState(''),
    [pull, setPull] = useState('');
  const query = useQuery({
    queryKey: ['delivery', id],
    queryFn: () => api(`${repositoryPath(id)}/delivery`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const hooks = useQuery({
    queryKey: ['webhook', id],
    queryFn: () => api(`${repositoryPath(id)}/webhook`),
    refetchInterval: 30000,
  });
  const jobs = useQuery({
    queryKey: ['delivery-jobs', id, job],
    queryFn: () => api(`${repositoryPath(id)}/delivery/runs/${job}/jobs`),
    enabled: !!job,
  });
  const pr = useQuery({
    queryKey: ['pull-detail', id, pull],
    queryFn: () => api(`${repositoryPath(id)}/delivery/pulls/${pull}`),
    enabled: !!pull,
  });
  const hook = useMutation({
    mutationFn: () => api(`${repositoryPath(id)}/webhook`, { method: 'POST' }),
    onSuccess: () => hooks.refetch(),
  });
  const evidence = query.data?.data;
  const missing = (section: any) =>
    section?.error ? (
      <div className="notice warning">
        {section.error}{' '}
        <Link className="text-link" to="/account">
          Review GitHub access
        </Link>
      </div>
    ) : null;
  return (
    <div className="workspace-page">
      <Link className="muted-link" to={`/repositories/${id}`}>
        ← Repository workspace
      </Link>
      <PageHeading
        eyebrow="LIVE GITHUB EVIDENCE"
        title="Delivery, in view."
        description="Workflow runs, deployments, pull requests, and security signals from your connected repository."
        action={
          <button className="btn-secondary" disabled={query.isFetching} onClick={() => query.refetch()}>
            <RefreshCw size={15} />
            {query.isFetching ? 'Refreshing…' : 'Refresh GitHub'}
          </button>
        }
      />
      <div className="inline-actions">
        <Link className="btn-secondary" to={`/repositories/${id}/investigate`}>
          Investigate a change
        </Link>
        <Link className="text-link" to={`/repositories/${id}/changes`}>
          Prepare a draft pull request
        </Link>
        {evidence && (
          <span className="subtle-text ml-auto">
            Updated {new Date(evidence.capturedAt).toLocaleTimeString()} · refreshes every minute
          </span>
        )}
      </div>
      <nav className="section-tabs" aria-label="Delivery sections">
        {[
          ['workflows', 'Workflows', Workflow],
          ['deployments', 'Deployments', Radio],
          ['pulls', 'Pull requests', GitPullRequest],
          ['security', 'Security', ShieldCheck],
          ['webhooks', 'Webhooks', Webhook],
        ].map(([key, label, Icon]: any) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>
      {query.isLoading ? (
        <Loading label="Reading GitHub delivery evidence…" />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        evidence && (
          <>
            {tab === 'workflows' && (
              <>
                {missing(evidence.workflows)}
                {evidence.workflows.data.map((r: any) => (
                  <article className="surface-panel" key={r.id}>
                    <div className="section-title-row">
                      <h2>{r.name}</h2>
                      <Status value={r.conclusion ?? r.status} />
                    </div>
                    <p className="subtle-text">
                      {r.branch} · {r.sha.slice(0, 10)} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                    <div className="inline-actions mt-4">
                      <button className="btn-secondary" onClick={() => setJob(String(r.id))}>
                        Inspect jobs & steps
                      </button>
                      <a className="text-link" href={r.url} target="_blank" rel="noreferrer">
                        Logs on GitHub <ArrowUpRight size={14} />
                      </a>
                    </div>
                    {job === String(r.id) &&
                      (jobs.isLoading ? (
                        <Loading />
                      ) : jobs.isError ? (
                        <ErrorState error={jobs.error} />
                      ) : (
                        jobs.data?.data.map((j: any) => (
                          <details className="change-file" key={j.id} open={j.conclusion === 'failure'}>
                            <summary>
                              {j.name}
                              <Status value={j.conclusion ?? j.status} />
                            </summary>
                            {j.steps.map((s: any) => (
                              <div className="delivery-step" key={s.number}>
                                <span>
                                  {s.number}. {s.name}
                                </span>
                                <Status value={s.conclusion ?? s.status} />
                              </div>
                            ))}
                          </details>
                        ))
                      ))}
                  </article>
                ))}
                {!evidence.workflows.data.length && !evidence.workflows.error && (
                  <EmptyState
                    title="No workflow runs yet"
                    description="Push a commit that triggers your GitHub Actions workflow. Refresh here to inspect its jobs and results."
                  />
                )}
              </>
            )}
            {tab === 'deployments' && (
              <>
                {missing(evidence.deployments)}
                {evidence.deployments.data.map((d: any) => (
                  <section className="surface-panel" key={d.id}>
                    <div className="section-title-row">
                      <h2>{d.environment}</h2>
                      <Status value={d.state} />
                    </div>
                    <p className="subtle-text">
                      {d.ref} · {d.sha?.slice(0, 10)} · {new Date(d.createdAt).toLocaleString()}
                    </p>
                    {d.description && <p>{d.description}</p>}
                    {d.statusError && <p className="notice warning">{d.statusError}</p>}
                    <div className="inline-actions mt-4">
                      {d.environmentUrl && (
                        <a className="text-link" href={d.environmentUrl} target="_blank" rel="noreferrer">
                          Open environment <ArrowUpRight size={14} />
                        </a>
                      )}
                      {d.logUrl && (
                        <a className="text-link" href={d.logUrl} target="_blank" rel="noreferrer">
                          Deployment logs
                        </a>
                      )}
                    </div>
                  </section>
                ))}
                {!evidence.deployments.data.length && !evidence.deployments.error && (
                  <EmptyState
                    title="No GitHub deployments recorded"
                    description="Deployments appear when your hosting integration or workflow reports them through GitHub’s Deployments API. A successful build alone is not a deployment."
                  />
                )}
              </>
            )}
            {tab === 'pulls' && (
              <>
                {missing(evidence.pulls)}
                {evidence.pulls.data.map((p: any) => (
                  <section className="surface-panel" key={p.number}>
                    <h2>
                      #{p.number} {p.title}
                    </h2>
                    <p className="subtle-text">
                      {p.head} → {p.base} {p.draft ? '· draft' : ''}
                    </p>
                    <div className="inline-actions mt-4">
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setPull(String(p.number));
                          if (pull === String(p.number)) pr.refetch();
                        }}
                      >
                        Check conflicts
                      </button>
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-link">
                        Open pull request
                      </a>
                    </div>
                    {pull === String(p.number) &&
                      (pr.isFetching ? (
                        <Loading />
                      ) : pr.isError ? (
                        <ErrorState error={pr.error} />
                      ) : (
                        <div className="notice mt-4">
                          <Status
                            value={
                              pr.data?.data.mergeable === false
                                ? 'conflicts'
                                : pr.data?.data.mergeable === null
                                  ? 'pending'
                                  : 'mergeable'
                            }
                          />
                          <p>{pr.data?.data.suggestion}</p>
                        </div>
                      ))}
                  </section>
                ))}
                {!evidence.pulls.data.length && !evidence.pulls.error && (
                  <EmptyState
                    title="No open pull requests"
                    description="Prepare a reviewed change in CodeLens to create a new draft pull request."
                  />
                )}
              </>
            )}
            {tab === 'security' && (
              <>
                {[
                  ['Dependabot', 'dependabot'],
                  ['Code scanning', 'codeScanning'],
                  ['Secret scanning', 'secretScanning'],
                ].map(([label, key]) => (
                  <section className="surface-panel" key={key}>
                    <h2>{label}</h2>
                    {missing(evidence[key])}
                    {evidence[key].data.map((a: any) => (
                      <div className="notice warning" key={a.number}>
                        <strong>{a.title}</strong>
                        {a.severity && <Status value={a.severity} />}
                        <p>
                          {a.path}
                          {a.line ? `:${a.line}` : ''}
                        </p>
                        {a.fix && <p>Patched version reported by GitHub: {a.fix}</p>}
                        <a className="text-link" href={a.url} target="_blank" rel="noreferrer">
                          Review alert & remediation
                        </a>
                      </div>
                    ))}
                    {!evidence[key].data.length && !evidence[key].error && (
                      <p className="subtle-text">
                        No open alerts returned. This does not establish that the application is free of
                        security issues.
                      </p>
                    )}
                  </section>
                ))}
              </>
            )}
            {tab === 'webhooks' && (
              <>
                <section className="surface-panel">
                  <h2>Keep delivery events connected.</h2>
                  <p className="subtle-text">
                    Receive signed GitHub events for pushes, workflows, checks, pull requests, and
                    deployments. Push events refresh the affected source branch.
                  </p>
                  <code className="webhook-url">{hooks.data?.data.url}</code>
                  {hooks.data?.data.publicUrlRequired && (
                    <div className="notice">
                      A deployed public HTTPS URL is required for GitHub to send webhooks. Live polling works
                      locally now.
                    </div>
                  )}
                  <button
                    className="btn-primary mt-4"
                    disabled={hook.isPending || hooks.data?.data.publicUrlRequired}
                    onClick={() => hook.mutate()}
                  >
                    {hook.isPending
                      ? 'Connecting…'
                      : hooks.data?.data.configured
                        ? 'Reconnect webhook'
                        : 'Connect GitHub webhook'}
                  </button>
                  {hook.isError && <ErrorState error={hook.error} />}
                </section>
                <section className="surface-panel">
                  <h2>Verified event history</h2>
                  {hooks.data?.data.events.map((e: any) => (
                    <div className="delivery-step" key={e.id}>
                      <span>
                        {e.eventType} {e.action} · {new Date(e.receivedAt).toLocaleString()}
                      </span>
                      <Status value={e.verificationStatus} />
                    </div>
                  ))}
                  {!hooks.data?.data.events.length && (
                    <p className="subtle-text">No verified events received for this repository yet.</p>
                  )}
                </section>
              </>
            )}
            {evidence.recommendations.length > 0 && tab !== 'webhooks' && (
              <section className="surface-panel">
                <h2>Recommended next steps</h2>
                {evidence.recommendations.slice(0, 6).map((r: any, i: number) => (
                  <div className="notice" key={i}>
                    <strong>{r.title}</strong>
                    <p>{r.detail}</p>
                    <a className="text-link" href={r.url} target="_blank" rel="noreferrer">
                      Supporting evidence
                    </a>
                  </div>
                ))}
              </section>
            )}
            <p className="subtle-text">{evidence.limits}</p>
          </>
        )
      )}
    </div>
  );
}
