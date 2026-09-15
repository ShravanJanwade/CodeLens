import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { api, repositoryPath } from '../api';
import { EmptyState, ErrorState, Loading, Status } from '../../components/ui';
import type { Repository } from '../repositories/types';
export default function Findings({
  id,
  revision,
  staticFindings,
  select,
}: {
  id: string;
  revision: string;
  staticFindings: Repository['findings'];
  select: (path: string, line: number) => void;
}) {
  const [filter, setFilter] = useState('all');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['findings', id],
    queryFn: () => api(`${repositoryPath(id)}/findings`),
  });
  const confirm = useMutation({
    mutationFn: (finding: string) =>
      api(`${repositoryPath(id)}/findings/${finding}/confirm`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['findings', id] }),
  });
  const visible = staticFindings.filter((f) => filter === 'all' || f.severity === filter);
  return (
    <div className="space-y-5">
      <section className="surface-panel finding-intro">
        <Search size={24} />
        <div>
          <span className="eyebrow">YOUR CODE REVIEW INBOX</span>
          <h2>Findings are things worth reviewing.</h2>
          <p className="subtle-text">
            CodeLens flags patterns that may need attention. Start with a finding, inspect its source, and ask
            AI to explain it. A static suggestion is not proof of a bug or security vulnerability.
          </p>
        </div>
      </section>
      <div className="section-title-row">
        <div>
          <h2>
            Source review suggestions <span className="count-badge">{staticFindings.length}</span>
          </h2>
          <p>From indexed commit {revision.slice(0, 10) || 'not yet indexed'}</p>
        </div>
        <label className="field-label">
          Priority
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All priorities</option>
            {[...new Set(staticFindings.map((f) => f.severity))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {visible.length ? (
        visible.map((f) => (
          <article className="finding-card actionable-finding" key={f.id}>
            <div className="inline-actions">
              <Status value={f.severity} />
              <span className="subtle-text">Review suggestion</span>
            </div>
            <h3>{f.title}</h3>
            <p>
              {f.description ||
                'Inspect this code pattern and check whether it affects the intended behavior.'}
            </p>
            <code className="finding-location">
              {f.filePath}:{f.line}
            </code>
            <div className="finding-next">
              <strong>Next step</strong>
              <p>
                {f.suggestion ||
                  'Read the surrounding code, understand the tradeoff, then decide whether a change is needed.'}
              </p>
            </div>
            <div className="inline-actions">
              <button className="btn-primary" onClick={() => select(f.filePath, f.line)}>
                Review code <ArrowRight size={14} />
              </button>
              <Link
                className="btn-secondary"
                to={`/repositories/${id}?tab=ask&revision=${revision}&contextPath=${encodeURIComponent(f.filePath)}&contextLine=${f.line}`}
              >
                <Sparkles size={14} /> Explain with AI
              </Link>
            </div>
          </article>
        ))
      ) : (
        <EmptyState
          title={filter === 'all' ? 'No source review suggestions' : 'No findings at this priority'}
          description="This means no supported pattern was flagged, not that the code has been proven bug-free. Continue exploring or compare a change in Investigations."
        />
      )}
      {id !== 'taskforge' && (
        <Link className="text-link" to={`/repositories/${id}/delivery`}>
          Check GitHub security alerts and failing CI →
        </Link>
      )}
      {(id === 'taskforge' || query.data?.data.length > 0) && (
        <section className="surface-panel">
          <h2>Findings from measured tests</h2>
          <p className="subtle-text mb-4">
            Observed during a recorded rehearsal. The original commit and test environment matter when
            reviewing these findings.
          </p>
          {query.isLoading ? (
            <Loading />
          ) : query.isError ? (
            <ErrorState error={query.error} />
          ) : query.data?.data.length ? (
            query.data.data.map((f: any) => (
              <article className="finding-card" key={f.id}>
                <h3>{f.title}</h3>
                <Status value={f.status} />
                <p>{f.explanation}</p>
                <p className="subtle-text">
                  Commit {f.revision.slice(0, 10)}
                  {f.revision !== revision ? ' · different revision; check whether it still applies' : ''}
                </p>
                <div className="inline-actions">
                  <Link
                    className="btn-secondary"
                    to={`/repositories/${id}/releases/${f.runId}?tab=investigation`}
                  >
                    Review test evidence
                  </Link>
                  {f.status !== 'confirmed' && query.data?.canConfirm !== false && (
                    <button
                      className="text-link"
                      disabled={confirm.isPending}
                      onClick={() => confirm.mutate(f.id)}
                    >
                      Mark as reviewed & confirmed
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="subtle-text">Run a prepared rehearsal to collect measured findings.</p>
          )}
          {confirm.isError && <ErrorState error={confirm.error} />}
        </section>
      )}
    </div>
  );
}
