import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, repositoryPath } from '../api';
import { ErrorState, Loading, Status } from '../../components/ui';
export default function InvestigationChecks({ id, evidence }: { id: string; evidence: any }) {
  const [run, setRun] = useState('');
  const matches = evidence.delivery.workflows.data.filter((r: any) => r.sha === evidence.candidate);
  const jobs = useQuery({
    queryKey: ['investigation-jobs', id, run],
    queryFn: () => api(`${repositoryPath(id)}/delivery/runs/${run}/jobs`),
    enabled: !!run,
  });
  return (
    <section className="surface-panel">
      <span className="eyebrow">CHECKS AT THE CANDIDATE COMMIT</span>
      <h2>What actually ran?</h2>
      <p className="subtle-text mb-4">
        These are real GitHub Actions runs. Open a run to inspect its jobs and steps. Application journeys
        appear here when your CI runs them; CodeLens does not invent test results.
      </p>
      {matches.length ? (
        matches.map((r: any) => (
          <button
            className={`check-run-option ${run === String(r.id) ? 'active' : ''}`}
            key={r.id}
            onClick={() => setRun(String(r.id))}
          >
            <span>
              <strong>{r.name}</strong>
              <small>
                {r.branch} · {r.sha.slice(0, 10)}
              </small>
            </span>
            <Status value={r.conclusion || r.status} />
            <span>Inspect jobs →</span>
          </button>
        ))
      ) : (
        <div className="next-action">
          <h3>Collect the missing evidence</h3>
          <p>
            Run your repository’s tests on this candidate commit, then refresh the investigation. Start with a
            CI workflow if your repository has none.
          </p>
          <Link className="btn-primary" to={`/repositories/${id}/changes`}>
            Prepare a CI workflow
          </Link>
        </div>
      )}
      {jobs.isLoading && run ? (
        <Loading label="Reading workflow jobs…" />
      ) : jobs.isError ? (
        <ErrorState error={jobs.error} />
      ) : (
        jobs.data?.data.map((job: any) => (
          <details key={job.id} className="change-file" open>
            <summary>
              <strong>{job.name}</strong>
              <Status value={job.conclusion || job.status} />
            </summary>
            <ol className="ci-step-list">
              {job.steps.map((step: any) => (
                <li key={step.number}>
                  <span>{step.number}</span>
                  <strong>{step.name}</strong>
                  <Status value={step.conclusion || step.status} />
                </li>
              ))}
            </ol>
            <a className="text-link" href={job.url} target="_blank" rel="noreferrer">
              Open job logs on GitHub →
            </a>
          </details>
        ))
      )}
      <Link className="text-link mt-5" to={`/repositories/${id}/delivery`}>
        See repository-wide deployments and security alerts →
      </Link>
    </section>
  );
}
