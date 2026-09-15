import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FlaskConical, FolderGit2, GitCompareArrows, Download, ArrowUpRight } from 'lucide-react';
import { PageHeading, ErrorState, Loading, EmptyState, Status } from '../../components/ui';
import { useAuth } from '../auth/Auth';
import { api, repositoryPath } from '../api';
import InvestigationChecks from './InvestigationChecks';
export function InvestigationHome() {
  const auth = useAuth();
  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="INVESTIGATIONS"
        title="Start with your question."
        description="Follow the evidence in your repository, or explore a complete prepared release rehearsal."
      />
      <div className="two-column investigation-cards">
        <section className="surface-panel">
          <span className="feature-symbol">
            <FolderGit2 size={27} />
          </span>
          <span className="eyebrow">YOUR REPOSITORY</span>
          <h2>Investigate your next change.</h2>
          <p className="subtle-text">
            Compare real GitHub revisions, inspect matching CI runs, and bring delivery and security evidence
            into one saved investigation.
          </p>
          <ol className="investigation-steps">
            <li>Connect GitHub and choose your repository.</li>
            <li>Sync branches and index the revision you want to understand.</li>
            <li>Select baseline and candidate branches or commits.</li>
            <li>Review the diff, CI checks, deployments, and suggested next steps.</li>
            <li>Prepare a reviewed fix as a draft pull request.</li>
          </ol>
          <Link
            className="btn-primary"
            to={auth.data?.data.user ? '/investigations/new' : '/login?mode=signup'}
          >
            Start your investigation <ArrowRight size={16} />
          </Link>
          <p className="subtle-text mt-4">
            Uses source and GitHub CI evidence. Application performance requires tests in your own CI.
          </p>
        </section>
        <section className="surface-panel">
          <span className="feature-symbol">
            <FlaskConical size={27} />
          </span>
          <span className="eyebrow">PREPARED EXAMPLE</span>
          <h2>See an investigation unfold.</h2>
          <p className="subtle-text">
            Explore TaskForge’s completed rehearsal: an actual permission regression, repeated database
            queries, and background-work contention.
          </p>
          <ol className="investigation-steps">
            <li>See what changed between prepared revisions.</li>
            <li>Inspect actual HTTP journeys and query traces.</li>
            <li>Follow a bounded investigation and experiment.</li>
            <li>Review the supplied correction and held-out validation.</li>
            <li>Download the full recorded evidence.</li>
          </ol>
          <Link className="btn-secondary" to="/recorded">
            Explore recorded investigation <ArrowUpRight size={16} />
          </Link>
          <p className="subtle-text mt-4">
            Immediately available. No account, AI key, or new execution required.
          </p>
        </section>
      </div>
    </div>
  );
}
export function ChooseInvestigation() {
  const repos = useQuery({ queryKey: ['repositories'], queryFn: () => api('/repositories') });
  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="YOUR INVESTIGATION"
        title="Which repository are we exploring?"
        description="Choose a connected repository to compare revisions and inspect its delivery evidence."
      />
      {repos.isLoading ? (
        <Loading />
      ) : repos.isError ? (
        <ErrorState error={repos.error} />
      ) : (
        <div className="repository-grid">
          {repos.data?.data
            .filter((r: any) => r.id !== 'taskforge')
            .map((r: any) => (
              <Link key={r.id} className="repository-card" to={`/repositories/${r.id}/investigate`}>
                <FolderGit2 size={23} />
                <h3>{r.name}</h3>
                <p>{r.fullName}</p>
                <span className="text-link">
                  Choose repository <ArrowRight size={14} />
                </span>
              </Link>
            ))}
        </div>
      )}
      <Link className="btn-secondary" to="/repositories">
        Connect a repository
      </Link>
    </div>
  );
}
export default function OwnInvestigation() {
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState(searchParams.has('investigation') ? 'changes' : 'setup');
  const { id = '' } = useParams(),
    [baseline, setBaseline] = useState(''),
    [candidate, setCandidate] = useState(''),
    [selected, setSelected] = useState(searchParams.get('investigation') ?? ''),
    client = useQueryClient();
  const repo = useQuery({ queryKey: ['repository', id], queryFn: () => api(repositoryPath(id)) });
  const branches = useQuery({
    queryKey: ['branches', id],
    queryFn: () => api(`${repositoryPath(id)}/branches`),
  });
  const history = useQuery({
    queryKey: ['investigations', id],
    queryFn: () => api(`${repositoryPath(id)}/investigations`),
  });
  const commits = useQuery({
    queryKey: ['recent-commits', id, branches.data?.data.defaultBranch],
    queryFn: () =>
      api(
        `${repositoryPath(id)}/commits?branch=${encodeURIComponent(branches.data?.data.defaultBranch || '')}`,
      ),
    enabled: !!branches.data?.data.defaultBranch,
  });
  const run = useMutation({
    mutationFn: (refs: { baseline: string; candidate: string } | void) =>
      api(`${repositoryPath(id)}/investigations`, {
        method: 'POST',
        body: JSON.stringify({
          baseline: refs?.baseline ?? baseline,
          candidate: refs?.candidate ?? candidate,
        }),
      }),
    onSuccess: (r) => {
      setSelected(r.data.id);
      setStage('changes');
      client.invalidateQueries({ queryKey: ['investigations', id] });
    },
  });
  const result =
      history.data?.data.find((r: any) => r.id === selected) ?? run.data?.data ?? history.data?.data[0],
    evidence = result?.evidence;
  return (
    <div className="workspace-page">
      <Link className="muted-link" to={`/repositories/${id}`}>
        ← {repo.data?.data.name ?? 'Repository'}
      </Link>
      <PageHeading
        eyebrow="YOUR REPOSITORY · SOURCE & CI"
        title="Investigate a change."
        description="Compare immutable GitHub commits, inspect matching workflow runs, and save the evidence for your next decision."
      />
      <nav className="journey-strip investigation-journey" aria-label="Investigation stages">
        {[
          ['setup', 'Choose revisions', 'Define your change'],
          ['changes', 'Review changes', 'Read the source diff'],
          ['checks', 'Checks & journeys', 'Inspect what ran'],
          ['next', 'Decide next steps', 'Act on the evidence'],
        ].map(([key, label, detail], i) => (
          <button
            key={key}
            className={stage === key ? 'current' : ''}
            disabled={key !== 'setup' && !evidence}
            onClick={() => setStage(key)}
          >
            <span>{i + 1}</span>
            <div>
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
          </button>
        ))}
      </nav>
      {stage === 'setup' && (
        <>
          <div className="next-action">
            <h2>Which change do you want to understand?</h2>
            <p>
              <strong>Baseline</strong> is your starting or known-working version. <strong>Candidate</strong>{' '}
              is the change you want to review. CodeLens compares their source, checks for matching CI
              results, and saves the evidence.
            </p>
            <button
              className="btn-secondary"
              type="button"
              disabled={!commits.data?.data?.[1]}
              onClick={() => {
                setBaseline(commits.data.data[1].sha);
                setCandidate(commits.data.data[0].sha);
              }}
            >
              Compare the latest commit with its parent
            </button>
            <p className="subtle-text mt-3">
              Or choose branches or recent commits below. To investigate a feature branch, compare the default
              branch against your feature branch.
            </p>
            {commits.isError && <ErrorState error={commits.error} retry={() => commits.refetch()} />}
          </div>
          <form
            className="surface-panel"
            onSubmit={(e) => {
              e.preventDefault();
              if (baseline.trim() && candidate.trim() && baseline !== candidate) run.mutate();
            }}
          >
            <div className="two-column">
              {[
                ['Baseline', baseline, setBaseline],
                ['Candidate', candidate, setCandidate],
              ].map(([label, value, set]: any) => (
                <label className="field-label" key={label}>
                  {label} branch or commit
                  <input
                    className="input"
                    list="investigation-branches"
                    value={value}
                    placeholder={
                      label === 'Baseline'
                        ? 'Choose the starting branch or commit'
                        : 'Choose the changed branch or commit'
                    }
                    onChange={(e) => set(e.target.value)}
                    maxLength={255}
                  />
                </label>
              ))}
            </div>
            <datalist id="investigation-branches">
              {branches.data?.data.branches.map((b: any) => (
                <option value={b.name} key={b.name} />
              ))}
              {commits.data?.data?.map((commit: any) => (
                <option value={commit.sha} key={commit.sha}>
                  {commit.message}
                </option>
              ))}
            </datalist>
            <div className="inline-actions">
              <button
                className="btn-primary"
                disabled={
                  run.isPending ||
                  branches.isLoading ||
                  !baseline.trim() ||
                  !candidate.trim() ||
                  baseline === candidate
                }
              >
                <GitCompareArrows size={16} />
                {run.isPending ? 'Collecting GitHub evidence…' : 'Compare & investigate'}
              </button>
              <Link className="text-link" to={`/repositories/${id}/delivery`}>
                Open CI/CD monitoring
              </Link>
            </div>
            {branches.isError && <ErrorState error={branches.error} retry={() => branches.refetch()} />}
            {run.isError && <ErrorState error={run.error} />}
            {baseline && candidate && baseline === candidate && (
              <p className="notice warning">Choose different revisions to investigate a change.</p>
            )}
          </form>
        </>
      )}
      {run.isPending && (
        <div className="notice" role="status">
          Collecting the source comparison and GitHub evidence. You will move to Review changes when it is
          ready.
        </div>
      )}
      {history.data?.data.length > 0 && (
        <label className="field-label">
          Saved investigations
          <select
            className="input"
            value={selected || result?.id}
            onChange={(e) => {
              setSelected(e.target.value);
              setStage('changes');
            }}
          >
            {history.data.data.map((r: any) => (
              <option value={r.id} key={r.id}>
                {r.baseline.slice(0, 8)} → {r.candidate.slice(0, 8)} ·{' '}
                {new Date(r.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {evidence ? (
        <>
          {stage !== 'setup' && (
            <section className="surface-panel">
              <div className="section-title-row">
                <div>
                  <h2>What does the evidence show?</h2>
                  <p>
                    {result.baseline.slice(0, 10)} → {result.candidate.slice(0, 10)}
                  </p>
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `codelens-investigation-${result.id}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download size={14} /> Export report
                </button>
              </div>
              {evidence.checks.map((c: any) => (
                <div className="notice" key={c.name}>
                  <Status value={c.outcome} />
                  <strong>{c.name}</strong>
                  <p>{c.detail}</p>
                </div>
              ))}
              <p className="subtle-text mt-4">
                {evidence.comparison.totalCommits}{' '}
                {evidence.comparison.totalCommits === 1 ? 'commit' : 'commits'} in the comparison ·{' '}
                {evidence.comparison.files.length} changed files included.
              </p>
              <a href={evidence.url} target="_blank" rel="noreferrer" className="text-link mt-4">
                Open full comparison on GitHub <ArrowUpRight size={14} />
              </a>
            </section>
          )}
          {stage === 'checks' && <InvestigationChecks id={id} evidence={evidence} />}
          {stage === 'changes' && (
            <section className="surface-panel">
              <h2>Changes to inspect</h2>
              {evidence.comparison.files.length ? (
                evidence.comparison.files.map((f: any) => (
                  <details className="change-file" key={f.path}>
                    <summary>
                      <FileLabel path={f.path} />
                      <span>
                        +{f.additions} / −{f.deletions}
                      </span>
                    </summary>
                    <pre className="evidence-json">
                      {f.patch ?? 'Patch unavailable for this file. Open the original source on GitHub.'}
                    </pre>
                    <a className="text-link" href={f.url} target="_blank" rel="noreferrer">
                      Open revision source
                    </a>
                    <Link
                      className="text-link ml-5"
                      to={`/repositories/${id}/changes?path=${encodeURIComponent(f.path)}`}
                    >
                      Prepare a change
                    </Link>
                  </details>
                ))
              ) : (
                <p className="subtle-text">No changed files between these revisions.</p>
              )}
            </section>
          )}
          {stage === 'next' && (
            <section className="surface-panel">
              <h2>Suggested next steps</h2>
              {evidence.delivery.recommendations.length ? (
                evidence.delivery.recommendations.map((r: any, i: number) => (
                  <div className="notice" key={i}>
                    <strong>{r.title}</strong>
                    <p>{r.detail}</p>
                    <a className="text-link" href={r.url} target="_blank" rel="noreferrer">
                      Open supporting evidence
                    </a>
                  </div>
                ))
              ) : (
                <p className="subtle-text">
                  {evidence.checks.some((check: any) => check.outcome === 'inconclusive')
                    ? 'Collect the missing candidate checks first. Return to Checks & journeys, run the pipeline for this exact commit, and refresh this investigation.'
                    : 'Review the source diff and confirm the checks cover the behavior you changed. Open CI/CD monitoring to inspect deployment status and any unavailable security evidence.'}
                </p>
              )}
              <ul className="subtle-text mt-5">
                {evidence.limitations.map((l: string) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <div className="next-action">
                <h3>Turn your review into a decision</h3>
                <p>
                  If the evidence shows a problem, prepare a small fix and run its checks. If CI is missing,
                  collect it before deciding to merge. A successful source comparison alone does not prove the
                  change is safe.
                </p>
                <Link className="btn-primary" to={`/repositories/${id}/changes`}>
                  Prepare a reviewed change →
                </Link>
                <Link className="text-link ml-5" to={`/repositories/${id}/delivery`}>
                  Follow CI/CD
                </Link>
              </div>
            </section>
          )}
          {stage !== 'setup' && (
            <div className="investigation-navigation">
              <button
                className="btn-secondary"
                onClick={() =>
                  setStage(stage === 'changes' ? 'setup' : stage === 'checks' ? 'changes' : 'checks')
                }
              >
                ← Previous step
              </button>
              {stage !== 'next' && (
                <button
                  className="btn-primary"
                  onClick={() => setStage(stage === 'changes' ? 'checks' : 'next')}
                >
                  {stage === 'changes' ? 'Continue to checks & journeys' : 'Continue to next steps'}{' '}
                  <ArrowRight size={15} />
                </button>
              )}
              <button
                className="text-link"
                disabled={run.isPending}
                onClick={() => run.mutate({ baseline: result.baseline, candidate: result.candidate })}
              >
                Refresh evidence for these commits
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="Choose two revisions to begin"
          description="The investigation resolves them to exact commits and retains its GitHub evidence. Your application code is not executed by this API."
        />
      )}
    </div>
  );
}
function FileLabel({ path }: { path: string }) {
  return <strong>{path}</strong>;
}

export function RepositoryInvestigationList({ id }: { id: string }) {
  const history = useQuery({
    queryKey: ['investigations', id],
    queryFn: () => api(`${repositoryPath(id)}/investigations`),
  });
  return (
    <section className="surface-panel">
      <span className="eyebrow">FROM UNDERSTANDING TO A DECISION</span>
      <h2>Investigate a change in this repository.</h2>
      <p className="subtle-text">
        Choose two versions, review the changed code, inspect the candidate’s real CI checks, and decide what
        to do next. Each investigation saves its evidence.
      </p>
      <Link className="btn-primary mt-5" to={`/repositories/${id}/investigate`}>
        Start a guided investigation <ArrowRight size={15} />
      </Link>
      <h3 className="mt-6">Saved investigations</h3>
      {history.isLoading ? (
        <Loading />
      ) : history.isError ? (
        <ErrorState error={history.error} />
      ) : history.data?.data.length ? (
        history.data.data.map((r: any) => (
          <Link
            key={r.id}
            className="check-run-option"
            to={`/repositories/${id}/investigate?investigation=${r.id}`}
          >
            <span>
              <strong>
                {r.baseline.slice(0, 8)} → {r.candidate.slice(0, 8)}
              </strong>
              <small>{new Date(r.createdAt).toLocaleString()}</small>
            </span>
            <Status value={r.status} />
            <span>Open investigation →</span>
          </Link>
        ))
      ) : (
        <p className="subtle-text mt-3">
          Your first saved comparison will appear here. Try the latest commit against its parent to get
          started.
        </p>
      )}
    </section>
  );
}
