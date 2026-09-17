import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CircleAlert,
  Clock,
  Cpu,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Globe2,
  Hash,
  Rocket,
  Server,
  Timer,
  User,
} from 'lucide-react';
import { useRunDetail } from './queries';
import { DEMO_REPO } from './types';
import { absolute, duration, relative, STATUS_LABEL, tone, TRIGGER_LABEL } from './format';
import PipelineFlow from './PipelineFlow';
import DiagnosisPanel from './DiagnosisPanel';
import LogViewer from './LogViewer';
import { Loading, ErrorState } from '../../components/ui';

/**
 * A single pipeline run: the DAG, the failing stage's log, and the
 * root cause.
 *
 * The layout follows the order a developer actually reads in: what
 * broke (flow), why (diagnosis), then the raw evidence (log). The
 * log is last on purpose -- it is the thing the product exists to
 * stop you having to read.
 */
export default function RunPage() {
  const params = useParams();
  const repositoryId = params.repoId ?? DEMO_REPO;
  const runNumber = Number(params.runNumber);

  const query = useRunDetail(repositoryId, runNumber);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Open on the interesting stage: the one that broke, or the one
  // currently running. Landing on "Checkout" would waste the click.
  useEffect(() => {
    if (selectedKey || !query.data) return;
    const stages = query.data.stages;
    const focus =
      stages.find((s) => s.status === 'failed') ??
      stages.find((s) => s.status === 'running') ??
      stages[stages.length - 1];
    if (focus) setSelectedKey(focus.key);
  }, [query.data, selectedKey]);

  const selected = useMemo(
    () => query.data?.stages.find((s) => s.key === selectedKey) ?? null,
    [query.data, selectedKey],
  );

  if (query.isLoading) return <Loading label={`Loading run #${runNumber}…`} />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!query.data) return null;

  const { run, stages, diagnosis, deployments } = query.data;
  const evidence = diagnosis?.signals.filter((s) => s.source === 'log').map((s) => s.detail) ?? [];

  return (
    <div className="dl-page">
      <header className="dl-head">
        <div className="dl-head-main">
          <Link className="link link-muted" to={`/r/${encodeURIComponent(repositoryId)}/delivery`}>
            <ArrowLeft size={13} /> All runs
          </Link>
          <h1 style={{ marginTop: 10 }}>
            <i className={`dot dot-${tone(run.status)}`} style={{ width: 10, height: 10 }} />
            {run.commitMessage}
          </h1>
          <div className="row-wrap" style={{ marginTop: 12 }}>
            <span className="badge badge-idle">
              <Hash size={10} />
              {run.runNumber}
            </span>
            <span
              className={`badge badge-${tone(run.status) === 'pass' ? 'pass' : tone(run.status) === 'fail' ? 'fail' : 'run'}`}
            >
              {STATUS_LABEL[run.status] ?? run.status}
            </span>
            <span className="tag-mono">
              <GitBranch size={10} />
              {run.branch}
            </span>
            <span className="tag-mono">
              <GitCommit size={10} />
              {run.commitShort}
            </span>
            {run.pullRequestNumber && (
              <span className="tag-mono">
                <GitPullRequest size={10} />#{run.pullRequestNumber}
              </span>
            )}
            <span className="text-xs muted row-tight">
              <User size={11} />
              {run.commitAuthor}
            </span>
            <span className="text-xs muted row-tight">
              <Clock size={11} />
              {relative(run.startedAt)} · {duration(run.durationMs)}
            </span>
            <span className="text-xs muted">{TRIGGER_LABEL[run.trigger] ?? run.trigger}</span>
          </div>
        </div>
        <div className="dl-head-actions">
          {run.targetTier !== 'none' && (
            <span className="badge badge-brand">
              <Rocket size={11} /> targets {run.targetTier}
            </span>
          )}
          {run.pipelineFile && <span className="tag-mono">{run.pipelineFile}</span>}
        </div>
      </header>

      {/* ---- Flow ---- */}
      <PipelineFlow
        stages={stages}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        blamedKey={diagnosis?.stageKey ?? null}
      />

      {/* ---- Diagnosis ---- */}
      {diagnosis && (
        <DiagnosisPanel
          repositoryId={repositoryId}
          runNumber={run.runNumber}
          diagnosis={diagnosis}
          onJumpToStage={setSelectedKey}
        />
      )}

      {run.status === 'failed' && !diagnosis && (
        <div className="alert alert-warn">
          <CircleAlert size={18} />
          <div>
            <strong>No diagnosis stored for this run</strong>
            <p>The classifier has not been run against it yet.</p>
          </div>
        </div>
      )}

      {/* ---- Deployments ---- */}
      {deployments.length > 0 && (
        <section className="panel-flush">
          <div className="panel-hd">
            <Globe2 size={15} style={{ color: 'var(--c-ink-3)' }} />
            <div>
              <h2>What this run deployed</h2>
              <p>One record per target, including anything that rolled back.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Region</th>
                  <th>Version</th>
                  <th>Strategy</th>
                  <th>Result</th>
                  <th className="right">Health</th>
                </tr>
              </thead>
              <tbody>
                {deployments
                  .slice()
                  .sort((a, b) => (a.environment?.region ?? '').localeCompare(b.environment?.region ?? ''))
                  .map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.environment?.name ?? '—'}</strong>
                      </td>
                      <td>
                        <span className="tag-mono">{d.environment?.region ?? '—'}</span>
                      </td>
                      <td className="num">
                        {d.previousVersion && <span className="muted">{d.previousVersion} → </span>}
                        {d.version}
                      </td>
                      <td>{d.strategy}</td>
                      <td>
                        <span className={`badge badge-${tone(d.status)}`}>{d.status}</span>
                        {d.rollbackReason && (
                          <p className="text-xs muted" style={{ marginTop: 4, maxWidth: '38ch' }}>
                            {d.rollbackReason}
                          </p>
                        )}
                      </td>
                      <td className="right">
                        <span className={`badge badge-${tone(d.healthCheck)}`}>{d.healthCheck}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---- Selected stage: metadata + log ---- */}
      {selected && (
        <section className="panel-flush">
          <div className="panel-hd">
            <i className={`dot dot-${tone(selected.status)}`} />
            <div>
              <h2>{selected.name}</h2>
              <p>
                {STATUS_LABEL[selected.status] ?? selected.status}
                {selected.durationMs !== null && ` · ${duration(selected.durationMs)}`}
                {selected.startedAt && ` · started ${absolute(selected.startedAt)}`}
              </p>
            </div>
            <div className="panel-hd-actions">
              {selected.environment && (
                <>
                  <span className="badge badge-info">
                    <Globe2 size={10} /> {selected.environment.region}
                  </span>
                  <span className="tag-mono">
                    <Server size={10} /> {selected.environment.cluster}
                  </span>
                </>
              )}
              {selected.runnerLabel && (
                <span className="tag-mono">
                  <Cpu size={10} /> {selected.runnerLabel}
                </span>
              )}
              {selected.attempts > 1 && (
                <span className="badge badge-warn">
                  <Timer size={10} /> {selected.attempts} attempts
                </span>
              )}
              {selected.exitCode !== null && selected.exitCode !== 0 && (
                <span className="badge badge-fail">exit {selected.exitCode}</span>
              )}
            </div>
          </div>
          <div className="panel-bd">
            {Object.keys(selected.summary).length > 0 && (
              <div className="row-wrap" style={{ marginBottom: 14 }}>
                {Object.entries(selected.summary).map(([key, value]) => (
                  <span key={key} className="stage-chip">
                    {key.replace(/([A-Z])/g, ' $1').toLowerCase()}: <strong>{String(value)}</strong>
                  </span>
                ))}
              </div>
            )}
            <LogViewer
              log={selected.log}
              stageName={selected.name}
              evidence={selected.key === diagnosis?.stageKey ? evidence : []}
            />
            {selected.key === diagnosis?.stageKey && evidence.length > 0 && (
              <p className="text-xs muted" style={{ marginTop: 10 }}>
                Highlighted lines are the exact evidence the classifier matched.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
