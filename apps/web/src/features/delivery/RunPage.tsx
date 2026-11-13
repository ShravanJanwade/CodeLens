import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ExternalLink, GitBranch, Globe, RotateCcw } from 'lucide-react';
import { useRunDetail } from './queries';
import { useRerun } from './actions';
import { DEMO_REPO } from './types';
import { absolute, duration, TRIGGER_LABEL } from './format';
import PipelineFlow, { isBake } from './PipelineFlow';
import DiagnosisPanel from './DiagnosisPanel';
import FixDialog, { type FixRequest } from './FixDialog';
import LogViewer from './LogViewer';
import { ApprovalGate } from './Releases';
import { ActionButton, Ago, Sha, StatusIcon, StatusPill, statusLabel, useAccessGate } from './ui';
import { Menu, MenuItem } from '../../components/overlay';
import { Loading, ErrorState } from '../../components/ui';

/**
 * One pipeline run, in the order a person reads it: what is happening
 * or what broke, why, what to do about it, then the jobs and their logs.
 */
export default function RunPage() {
  const params = useParams();
  const repositoryId = params.repoId ?? DEMO_REPO;
  const runNumber = Number(params.runNumber);
  const query = useRunDetail(repositoryId, runNumber);
  const gate = useAccessGate(repositoryId);
  const rerun = useRerun(repositoryId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [fix, setFix] = useState<FixRequest | null>(null);

  // Open on the job that matters: the one that broke, is running or is waiting.
  useEffect(() => {
    if (selectedKey || !query.data) return;
    const stages = query.data.stages;
    const focus =
      stages.find((s) => s.key === query.data!.diagnosis?.stageKey) ??
      stages.find((s) => s.status === 'failed') ??
      stages.find((s) => s.status === 'running') ??
      stages.find((s) => s.status === 'blocked') ??
      stages[stages.length - 1];
    if (focus) setSelectedKey(focus.key);
  }, [query.data, selectedKey]);

  const selected = useMemo(
    () => query.data?.stages.find((s) => s.key === selectedKey) ?? null,
    [query.data, selectedKey],
  );

  if (query.isLoading) return <Loading label="Loading run…" />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!query.data) return null;

  const { run, stages, diagnosis, deployments } = query.data;
  const evidence = diagnosis?.signals.filter((s) => s.source === 'log').map((s) => s.detail) ?? [];
  const actionable = Boolean(run.externalUrl);
  const finished = !['queued', 'running', 'blocked'].includes(run.status);
  const repoFullName = run.externalUrl?.match(/github\.com\/([^/]+\/[^/]+)\//)?.[1] ?? null;
  const bake = stages.find((s) => isBake(s));
  const bakedMs =
    bake?.startedAt && bake.completedAt ? Date.parse(bake.completedAt) - Date.parse(bake.startedAt) : null;
  const rejected = stages.filter((s) => s.status === 'cancelled' && /was rejected/.test(s.log));
  const failedStage = diagnosis ? stages.find((s) => s.key === diagnosis.stageKey) : null;

  return (
    <div className="page-stack">
      <header className="run-head">
        <Link className="back" to={`/r/${encodeURIComponent(repositoryId)}/delivery`}>
          <ArrowLeft size={14} /> Delivery
        </Link>
        <div className="run-head-main">
          <StatusIcon status={run.status} size={20} />
          <div className="run-head-text">
            <h1>
              {run.deployTarget && <span className="run-kind">Redeploy {run.deployTarget}</span>}
              {run.commitMessage}
            </h1>
            <div className="run-facts">
              <StatusPill
                status={run.status}
                label={run.status === 'blocked' ? 'Waiting for approval' : undefined}
              />
              <span>
                {run.pipeline} #{run.displayNumber ?? run.runNumber}
              </span>
              <span className="run-branch">
                <GitBranch size={12} />
                {run.branch}
              </span>
              <Sha sha={run.commitSha} repo={repoFullName} />
              <span>{run.actor}</span>
              <span>{TRIGGER_LABEL[run.trigger] ?? run.trigger}</span>
              <span>
                <Ago iso={run.startedAt} />
                {run.durationMs ? ` · ${duration(run.durationMs)}` : ''}
              </span>
            </div>
          </div>
          <div className="page-actions">
            {run.externalUrl && (
              <a className="btn btn-ghost btn-sm" href={run.externalUrl} target="_blank" rel="noreferrer">
                GitHub <ExternalLink size={13} />
              </a>
            )}
            {actionable && finished && (
              <Menu
                label={
                  <>
                    <RotateCcw size={14} /> Re-run <ChevronDown size={13} />
                  </>
                }
                className="btn btn-secondary btn-sm"
              >
                {(close) => (
                  <>
                    <MenuItem
                      label="Re-run failed jobs"
                      hint="Only the jobs that failed, and what depends on them"
                      disabled={run.status !== 'failed' && run.status !== 'cancelled'}
                      onSelect={() => {
                        close();
                        gate.run(() => rerun.mutate({ runNumber: run.runNumber, mode: 'failed' }))();
                      }}
                    />
                    <MenuItem
                      label="Re-run all jobs"
                      hint="The whole run again, at the same commit"
                      onSelect={() => {
                        close();
                        gate.run(() => rerun.mutate({ runNumber: run.runNumber, mode: 'all' }))();
                      }}
                    />
                  </>
                )}
              </Menu>
            )}
          </div>
        </div>
      </header>

      {run.status === 'blocked' && (
        <div className="panel">
          <ApprovalGate repositoryId={repositoryId} run={run} gate={gate} bakedMs={bakedMs} />
        </div>
      )}

      {rejected.length > 0 && (
        <div className="alert alert-info">
          <StatusIcon status="cancelled" />
          <div>
            <strong>Stopped at the approval gate</strong>
            {rejected.map((s) => (
              <p key={s.key}>{s.log}</p>
            ))}
          </div>
        </div>
      )}

      {diagnosis && (
        <DiagnosisPanel
          repositoryId={repositoryId}
          run={run}
          diagnosis={diagnosis}
          failedStageName={failedStage?.name ?? null}
          gate={gate}
          onFix={setFix}
          onJumpToStage={(key) => {
            setSelectedKey(key);
            document.getElementById('job')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      )}

      {run.status === 'failed' && !diagnosis && (
        <div className="alert alert-warn">
          <StatusIcon status="failed" />
          <div>
            <strong>Not diagnosed yet</strong>
            <p>The classifier runs on the next sync, within a minute.</p>
          </div>
        </div>
      )}

      <section className="section">
        <div className="section-hd">
          <h2>Jobs</h2>
          <p>
            {stages.length} jobs in {new Set(stages.map((s) => s.sequence)).size} stages
            {run.pipelineFile ? (
              <>
                {' '}
                · <span className="mono">{run.pipelineFile}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="panel-flush">
          <PipelineFlow
            stages={stages}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            blamedKey={diagnosis?.stageKey ?? null}
          />
        </div>
      </section>

      {selected && (
        <section className="section" id="job">
          <div className="panel-flush">
            <div className="job-hd">
              <StatusIcon status={selected.status} />
              <div className="job-title">
                <h2>{selected.name}</h2>
                <p>
                  {statusLabel(selected.status)}
                  {selected.durationMs !== null && ` · ${duration(selected.durationMs)}`}
                  {selected.startedAt && ` · started ${absolute(selected.startedAt)}`}
                  {selected.runnerLabel && ` · ${selected.runnerLabel}`}
                  {selected.attempts > 1 && ` · attempt ${selected.attempts}`}
                </p>
              </div>
              <div className="page-actions">
                {selected.environment && (
                  <span className="env-chip">
                    <Globe size={12} /> {selected.environment.name} · {selected.environment.regionLabel}
                  </span>
                )}
                {actionable && finished && selected.status !== 'skipped' && (
                  <ActionButton
                    gate={gate}
                    busy={rerun.isPending && rerun.variables?.stageKey === selected.key}
                    onClick={() =>
                      rerun.mutate({ runNumber: run.runNumber, mode: 'job', stageKey: selected.key })
                    }
                  >
                    Re-run job
                  </ActionButton>
                )}
              </div>
            </div>
            <LogViewer
              log={selected.log}
              stageName={selected.name}
              evidence={selected.key === diagnosis?.stageKey ? evidence : []}
            />
          </div>
        </section>
      )}

      {deployments.length > 0 && (
        <section className="section">
          <div className="section-hd">
            <h2>Deployments</h2>
            <p>One record per environment this run deployed to.</p>
          </div>
          <div className="panel-flush table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Environment</th>
                  <th>Region</th>
                  <th>Release</th>
                  <th>Result</th>
                  <th className="right">Finished</th>
                </tr>
              </thead>
              <tbody>
                {deployments
                  .slice()
                  .sort((a, b) => (a.environment?.name ?? '').localeCompare(b.environment?.name ?? ''))
                  .map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.environment?.name ?? '—'}</strong>
                      </td>
                      <td>{d.environment?.regionLabel ?? '—'}</td>
                      <td>
                        <span className="sha">{d.commitShort}</span>
                      </td>
                      <td>
                        <StatusPill
                          status={
                            d.status === 'failed'
                              ? 'failed'
                              : d.status === 'deploying'
                                ? 'running'
                                : 'success'
                          }
                          label={
                            d.status === 'superseded'
                              ? 'Replaced since'
                              : d.status === 'live'
                                ? 'Live'
                                : undefined
                          }
                        />
                      </td>
                      <td className="right">
                        <Ago iso={d.completedAt ?? d.startedAt} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <FixDialog repositoryId={repositoryId} fix={fix} gate={gate} onClose={() => setFix(null)} />
      {gate.dialog}
    </div>
  );
}
