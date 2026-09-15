import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Save, Trash2 } from 'lucide-react';
import {
  fetchRepositoryDetail,
  fetchRepositoryPipeline,
  updateRepository,
  syncRepository,
  deleteRepository,
  triagePipelineLog,
} from '../../api';
import { PageHeading, Loading, ErrorState, Status } from '../../components/ui';
export default function RepositoryTools() {
  const [deleteReview, setDeleteReview] = useState(false),
    [deleteName, setDeleteName] = useState('');
  const { id = '' } = useParams(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [notes, setNotes] = useState<string | null>(null),
    [branch, setBranch] = useState<string | null>(null),
    [log, setLog] = useState('');
  const repo = useQuery({ queryKey: ['repository', id, 'tools'], queryFn: () => fetchRepositoryDetail(id) });
  const pipeline = useQuery({
    queryKey: ['pipeline', id],
    queryFn: () => fetchRepositoryPipeline(id),
    refetchInterval: 15000,
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['repository', id] });
    client.invalidateQueries({ queryKey: ['repositories'] });
  };
  const save = useMutation({
    mutationFn: () =>
      updateRepository(id, {
        description: notes ?? repo.data.data.description ?? '',
      }),
    onSuccess: refresh,
  });
  const sync = useMutation({ mutationFn: () => syncRepository(id), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => deleteRepository(id),
    onSuccess: () => {
      refresh();
      navigate('/repositories');
    },
  });
  const triage = useMutation({ mutationFn: () => triagePipelineLog(id, log) });
  if (repo.isLoading) return <Loading />;
  if (repo.isError) return <ErrorState error={repo.error} retry={() => repo.refetch()} />;
  const data = repo.data.data;
  return (
    <div className="workspace-page">
      <Link className="muted-link inline-actions" to={`/repositories/${id}`}>
        <ArrowLeft size={14} />
        {data.name} / Repository workspace
      </Link>
      <PageHeading
        eyebrow="REPOSITORY TOOLS"
        title="Repository settings"
        description="Manage repository metadata and inspect indexing or delivery failures."
      />
      {id !== 'taskforge' && (
        <div className="inline-actions">
          <Link className="btn-primary" to={`/repositories/${id}/delivery`}>
            Open live CI/CD monitoring
          </Link>
          <Link className="text-link" to={`/repositories/${id}/changes`}>
            Prepare changes for GitHub
          </Link>
        </div>
      )}
      <div className="two-column">
        <form
          className="surface-panel"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2>Repository metadata</h2>
          <label className="field-label">
            Default branch
            <input
              className="input"
              value={branch ?? data.defaultBranch}
              onChange={(e) => setBranch(e.target.value)}
              required
              maxLength={200}
              disabled
            />
          </label>
          <label className="field-label">
            Workspace notes
            <textarea
              className="input min-h-28"
              value={notes ?? data.description ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </label>
          <button className="btn-primary" disabled={save.isPending}>
            <Save size={14} />
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {save.isSuccess && (
            <p className="subtle-text mt-3" role="status">
              Metadata saved.
            </p>
          )}
          {save.isError && <ErrorState error={save.error} />}
        </form>
        <section className="surface-panel">
          <h2>Connection</h2>
          <p className="subtle-text">{data.fullName}</p>
          <p className="subtle-text mt-3">
            {id === 'taskforge'
              ? 'TaskForge is a prepared fixture. Its revisions are managed by the local executor.'
              : 'Sync refreshes GitHub metadata and indexes the current default branch.'}
          </p>
          <div className="inline-actions mt-5">
            <button
              className="btn-secondary"
              disabled={sync.isPending || id === 'taskforge'}
              onClick={() => sync.mutate()}
            >
              <RefreshCw size={14} />
              Sync GitHub
            </button>
            <button
              className="btn-danger"
              disabled={remove.isPending || id === 'taskforge'}
              onClick={() => setDeleteReview(true)}
            >
              <Trash2 size={14} />
              Delete from CodeLens
            </button>
          </div>
          {deleteReview && (
            <div className="notice warning mt-5">
              <strong>Delete this repository from CodeLens?</strong>
              <p>
                This removes its saved source, findings, and investigations. Your GitHub repository is
                preserved.
              </p>
              <label className="field-label">
                Type {data.fullName} to confirm
                <input className="input" value={deleteName} onChange={(e) => setDeleteName(e.target.value)} />
              </label>
              <div className="inline-actions">
                <button
                  className="btn-danger"
                  disabled={deleteName !== data.fullName || remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Confirm deletion
                </button>
                <button className="btn-secondary" onClick={() => setDeleteReview(false)}>
                  Keep repository
                </button>
              </div>
            </div>
          )}
          {sync.isSuccess && (
            <p className="subtle-text mt-4" role="status">
              Sync queued. Return to the repository to follow indexing.
            </p>
          )}
          {sync.isError && <ErrorState error={sync.error} />}{' '}
          {remove.isError && <ErrorState error={remove.error} />}
        </section>
      </div>
      <section className="surface-panel">
        <h2>Index history</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Revision / branch</th>
                <th>Status</th>
                <th>Files</th>
                <th>Progress</th>
                <th>Failure</th>
              </tr>
            </thead>
            <tbody>
              {data.analysisRuns.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <Link className="text-link" to={`/repositories/${id}?revision=${r.commitSha ?? ''}`}>
                      {r.commitSha?.slice(0, 10) ?? r.branch}
                    </Link>
                  </td>
                  <td>
                    <Status value={r.status} />
                  </td>
                  <td>
                    {r.filesProcessed}/{r.totalFiles}
                  </td>
                  <td>{r.progress}%</td>
                  <td className="wrap">{r.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="two-column">
        <section className="surface-panel">
          <h2>CI failure triage</h2>
          <p className="subtle-text">
            Paste a job log to identify the first meaningful failure. Classification uses explicit heuristics;
            it is a starting point for investigation.
          </p>
          <label className="field-label mt-4">
            Job log
            <textarea
              className="input min-h-40 font-mono"
              value={log}
              onChange={(e) => setLog(e.target.value)}
              maxLength={80000}
            />
          </label>
          <button
            className="btn-primary"
            disabled={triage.isPending || !log.trim()}
            onClick={() => triage.mutate()}
          >
            Triage failure
          </button>
          {triage.isError && <ErrorState error={triage.error} />}{' '}
          {triage.data?.data && (
            <div className="notice mt-5">
              <strong>{triage.data.data.classification.replaceAll('_', ' ')}</strong>
              <pre className="evidence-json mt-3">{triage.data.data.firstMeaningfulError?.text}</pre>
              <p>{triage.data.data.recommendation}</p>
            </div>
          )}
        </section>
        <section className="surface-panel">
          <h2>Verified GitHub deliveries</h2>
          {pipeline.isError ? (
            <ErrorState error={pipeline.error} />
          ) : pipeline.data?.data.webhookEvents?.length ? (
            pipeline.data.data.webhookEvents.map((e: any) => (
              <div className="notice mb-3" key={e.id}>
                <strong>{e.eventType}</strong>
                <p>
                  {e.action ?? 'received'} · {new Date(e.receivedAt).toLocaleString()}
                </p>
                <code>{e.workflow?.sha ?? e.sha ?? 'No revision attached'}</code>
              </div>
            ))
          ) : (
            <p className="subtle-text">
              No verified deliveries yet. Configure the signed webhook from the documentation or sync
              manually.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
