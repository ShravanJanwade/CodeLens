import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical, Play, ArrowUpRight } from 'lucide-react';
import { api, repositoryPath } from '../api';
import { EmptyState, ErrorState, Loading, Status } from '../../components/ui';
export default function ReleaseList({ id }: { id: string }) {
  const [baseline, setBaseline] = useState('baseline'),
    [candidate, setCandidate] = useState('defective'),
    [correction, setCorrection] = useState('corrected');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['releases', id],
    queryFn: () => api(`${repositoryPath(id)}/rehearsals`),
    refetchInterval: 10_000,
  });
  const run = useMutation({
    mutationFn: () =>
      api(`${repositoryPath(id)}/rehearsals`, {
        method: 'POST',
        body: JSON.stringify({
          baseline,
          candidate,
          correction: correction || null,
          idempotencyKey: `${idempotencyKey}_${baseline}_${candidate}_${correction}`,
        }),
      }),
    onSuccess: (r) => navigate(`/repositories/${id}/releases/${r.data.id}`),
  });
  return (
    <div className="space-y-6">
      <section className="surface-panel">
        <div className="section-title-row">
          <div>
            <h2>
              <FlaskConical size={17} />
              Release Rehearsal
            </h2>
            <p>Compare behavior. Investigate performance. Verify a correction.</p>
          </div>
          <Link to="/recorded" className="text-link">
            Recorded example <ArrowUpRight size={14} />
          </Link>
        </div>
        {id !== 'taskforge' && (
          <div className="notice">
            <strong>Investigate this repository’s release</strong>
            <p>
              Choose baseline and candidate revisions, review the source diff, and inspect CI evidence for the
              exact commit.
            </p>
            <Link className="btn-primary mt-4" to={`/repositories/${id}/investigate`}>
              Start your investigation
            </Link>
            <Link className="text-link ml-5" to={`/repositories/${id}/delivery`}>
              Open CI/CD monitoring
            </Link>
          </div>
        )}
        {id === 'taskforge' ? (
          <>
            <div className="release-config">
              {[
                ['Baseline', baseline, setBaseline],
                ['Candidate', candidate, setCandidate],
                ['Supplied correction', correction, setCorrection],
              ].map(([label, value, set]) => (
                <label className="field-label" key={String(label)}>
                  {String(label)}
                  <select
                    className="input"
                    value={String(value)}
                    onChange={(e) => (set as (value: string) => void)(e.target.value)}
                  >
                    {label === 'Supplied correction' && <option value="">Skip correction</option>}
                    <option value="baseline">Baseline</option>
                    <option value="defective">Prepared defective version</option>
                    <option value="corrected">Supplied corrected version</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="notice">
              Isolated seeded TaskForge · 2 measurement repetitions · 4 warmup requests · 16 measured requests
              per repetition · query budget ≤ 4 · p95 regression threshold 30% with a 2 ms minimum difference.
              Worker experiments: 1 and 2; held-out page size: 10.
            </div>
            <div className="inline-actions mt-5">
              <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}>
                <Play size={13} />
                {run.isPending ? 'Queueing…' : 'Run fresh rehearsal'}
              </button>
              <span className="subtle-text">One active run · up to 120 seconds · 10 runs per day (UTC)</span>
            </div>
          </>
        ) : (
          <div className="notice warning">
            Source intelligence is available for this repository. The initial release executor supports the
            prepared TaskForge application.{' '}
            <Link to="/repositories/taskforge?tab=releases" className="text-link">
              Open TaskForge
            </Link>
          </div>
        )}
        {run.isError && (
          <div className="mt-4">
            <ErrorState error={run.error} />
          </div>
        )}
      </section>
      <div className="section-title-row">
        <div>
          <h2>Rehearsal history</h2>
          <p>Every result stays attached to its repository and revisions.</p>
        </div>
      </div>
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : !query.data?.data.length ? (
        <EmptyState
          title={id === 'taskforge' ? 'No rehearsals yet' : 'No application rehearsals imported'}
          description={
            id === 'taskforge'
              ? 'Select versions above to create your first measured comparison.'
              : 'Start a source and CI investigation above. Application-specific journeys run in your own configured pipeline.'
          }
        />
      ) : (
        <div className="space-y-3">
          {query.data.data.map((r: any) => (
            <Link className="run-list-item" key={r.id} to={`/repositories/${id}/releases/${r.id}`}>
              <div>
                <h3>
                  {r.config.baseline} <span className="text-text-muted">→</span> {r.config.candidate}
                </h3>
                <small>
                  <code>
                    {r.baseline.slice(0, 8)} → {r.candidate.slice(0, 8)}
                  </code>{' '}
                  · {new Date(r.createdAt).toLocaleString()}
                </small>
              </div>
              <div className="inline-actions">
                <Status value={r.status} />
                <ArrowUpRight size={15} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
