import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CirclePause, ExternalLink, X } from 'lucide-react';
import { ACTION_LABEL, useActionLog, useGates, useReview } from './actions';
import type { ActionRecord, ActiveRun, ActiveStage, RunSummary } from './types';
import { clock, isBake, useNow } from './PipelineFlow';
import { ActionButton, Ago, StatusIcon, type useAccessGate } from './ui';

// ============================================================
// Approval gate
// ============================================================

/**
 * A deploy waiting at its environment's protection rule. Approving or
 * rejecting goes to GitHub as the signed-in person, and GitHub checks
 * that they are one of the environment's reviewers.
 */
export function ApprovalGate({
  repositoryId,
  run,
  gate,
  bakedMs,
}: {
  repositoryId: string;
  run: Pick<RunSummary, 'runNumber' | 'status' | 'externalUrl'>;
  gate: ReturnType<typeof useAccessGate>;
  bakedMs?: number | null;
}) {
  const gates = useGates(repositoryId, run.runNumber, run.status === 'blocked');
  const review = useReview(repositoryId);
  const [chosen, setChosen] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  useEffect(() => setChosen((gates.data ?? []).map((g) => g.environment)), [gates.data]);

  if (run.status !== 'blocked') return null;
  const list = gates.data ?? [];
  const reviewers = [...new Set(list.flatMap((g) => g.reviewers))];
  const canApprove = list.some((g) => g.canApprove);
  const decide = (decision: 'approved' | 'rejected') =>
    review.mutate({
      runNumber: run.runNumber,
      environments: chosen,
      decision,
      comment: comment || undefined,
    });

  return (
    <div className="gate">
      <div className="gate-hd">
        <CirclePause size={16} className="tone-warn" />
        <div>
          <strong>
            {list.length
              ? `${list.length === 1 ? list[0].environment : `${list.length} environments`} waiting for approval`
              : 'Waiting for approval'}
          </strong>
          <p>
            {bakedMs ? `Baked in staging for ${clock(bakedMs)}. ` : ''}
            {reviewers.length ? `Reviewers: ${reviewers.map((r) => `@${r}`).join(', ')}.` : ''}
            {gate.canAct && list.length > 0 && !canApprove
              ? " GitHub doesn't list you as a reviewer here."
              : ''}
          </p>
        </div>
      </div>
      {list.length > 1 && (
        <div className="gate-envs">
          {list.map((g) => (
            <label key={g.environment} className="check">
              <input
                type="checkbox"
                checked={chosen.includes(g.environment)}
                onChange={(e) =>
                  setChosen((c) =>
                    e.target.checked ? [...c, g.environment] : c.filter((x) => x !== g.environment),
                  )
                }
              />
              {g.environment}
            </label>
          ))}
        </div>
      )}
      <div className="gate-actions">
        <input
          className="input"
          placeholder="Comment (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          aria-label="Review comment"
        />
        <ActionButton
          gate={gate}
          className="btn btn-danger btn-sm"
          busy={review.isPending && review.variables?.decision === 'rejected'}
          disabled={gate.canAct && (!canApprove || !chosen.length)}
          onClick={() => decide('rejected')}
        >
          {!(review.isPending && review.variables?.decision === 'rejected') && <X size={14} />} Reject
        </ActionButton>
        <ActionButton
          gate={gate}
          className="btn btn-approve btn-sm"
          busy={review.isPending && review.variables?.decision === 'approved'}
          disabled={gate.canAct && (!canApprove || !chosen.length)}
          onClick={() => decide('approved')}
        >
          {!(review.isPending && review.variables?.decision === 'approved') && <Check size={14} />} Approve
          and deploy
        </ActionButton>
      </div>
    </div>
  );
}

// ============================================================
// Release in progress
// ============================================================

interface Step {
  key: string;
  label: string;
  status: string;
  stage: ActiveStage;
  count: number;
}

/** One step per level of the run's graph, named for what happens there. */
function stepsOf(stages: ActiveStage[]): Step[] {
  const levels = [...new Set(stages.map((s) => s.sequence))].sort((a, b) => a - b);
  return levels.map((level) => {
    const group = stages.filter((s) => s.sequence === level);
    const statuses = group.map((s) => s.status);
    const status = statuses.includes('failed')
      ? 'failed'
      : statuses.includes('running')
        ? 'running'
        : statuses.includes('blocked')
          ? 'blocked'
          : statuses.every((s) => s === 'skipped')
            ? 'skipped'
            : statuses.every((s) => s === 'success' || s === 'skipped')
              ? 'success'
              : 'queued';
    const first = group[0];
    const label = isBake(first)
      ? 'Bake'
      : first.kind === 'deploy'
        ? group.length > 1
          ? `Deploy ${group.length} regions`
          : `Deploy ${first.environment ?? ''}`.trim()
        : group.length > 1
          ? `${group.length} checks`
          : first.name;
    return { key: String(level), label, status, stage: first, count: group.length };
  });
}

export function ReleaseInProgress({
  repositoryId,
  run,
  gate,
}: {
  repositoryId: string;
  run: ActiveRun;
  gate: ReturnType<typeof useAccessGate>;
}) {
  const steps = stepsOf(run.stages);
  const now = useNow(run.status === 'running');
  const bake = run.stages.find((s) => isBake(s));
  const bakedMs =
    bake?.startedAt && bake.completedAt ? Date.parse(bake.completedAt) - Date.parse(bake.startedAt) : null;
  const href = `/r/${encodeURIComponent(repositoryId)}/runs/${run.runNumber}`;

  return (
    <section className="inflight">
      <div className="inflight-hd">
        <StatusIcon status={run.status} />
        <div className="inflight-title">
          <Link to={href} className="truncate">
            {run.deployTarget ? `Redeploy ${run.deployTarget}: ` : ''}
            {run.commitMessage}
          </Link>
          <span className="muted">
            {run.pipeline} #{run.displayNumber ?? run.runNumber} ·{' '}
            <span className="sha">{run.commitShort}</span> · started <Ago iso={run.startedAt} />
          </span>
        </div>
        <Link to={href} className="btn btn-ghost btn-sm">
          Details <ArrowRight size={13} />
        </Link>
      </div>
      <ol className="steps">
        {steps.map((step) => {
          const target = step.stage.bakeMinutes;
          const baking = isBake(step.stage) && step.status === 'running' && step.stage.startedAt;
          const elapsed = baking ? now - Date.parse(step.stage.startedAt!) : 0;
          return (
            <li key={step.key} className={`step s-${step.status}`}>
              <StatusIcon status={step.status} size={14} />
              <span className="step-label">{step.label}</span>
              {baking && (
                <span className="step-note num">
                  {clock(elapsed)}
                  {target ? ` / ${clock(target * 60_000)}` : ''}
                </span>
              )}
              {step.status === 'blocked' && <span className="step-note tone-warn">Needs approval</span>}
              {baking && target ? (
                <span className="step-bar">
                  <i style={{ width: `${Math.min(99, (elapsed / (target * 60_000)) * 100)}%` }} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <ApprovalGate repositoryId={repositoryId} run={run} gate={gate} bakedMs={bakedMs} />
    </section>
  );
}

// ============================================================
// Action log
// ============================================================

function describe(action: ActionRecord): string {
  const detail = action.detail as { commitSha?: string; stage?: string; kind?: string };
  switch (action.kind) {
    case 'redeploy':
      return `redeployed ${action.environment}${detail.commitSha ? ` at ${String(detail.commitSha).slice(0, 7)}` : ''}`;
    case 'approve':
    case 'reject':
      return `${action.kind === 'approve' ? 'approved' : 'rejected'} ${action.environment ?? 'a deploy'}`;
    case 'rerun-job':
      return `re-ran ${detail.stage ?? 'a job'}`;
    case 'fix-pr':
      return detail.kind === 'quarantine-test'
        ? 'opened a quarantine pull request'
        : `opened a fix for ${action.target}`;
    default:
      return ACTION_LABEL[action.kind].toLowerCase();
  }
}

export function ActionLog({ repositoryId }: { repositoryId: string }) {
  const log = useActionLog(repositoryId);
  const actions = log.data ?? [];
  if (!actions.length)
    return (
      <p className="empty-note">Re-runs, redeploys, approvals and fixes run from CodeLens appear here.</p>
    );
  return (
    <ul className="actions-log">
      {actions.slice(0, 8).map((action) => (
        <li key={action.id} className={action.outcome === 'failed' ? 'is-failed' : ''}>
          <span className="who">@{action.githubLogin}</span> {describe(action)}
          {action.outcome === 'failed' && <span className="tone-fail"> · refused</span>}
          <span className="when">
            <Ago iso={action.createdAt} />
            {action.url && (
              <a href={action.url} target="_blank" rel="noreferrer" aria-label="Open on GitHub">
                <ExternalLink size={11} />
              </a>
            )}
          </span>
          {action.outcome === 'failed' && action.message && <span className="why">{action.message}</span>}
        </li>
      ))}
    </ul>
  );
}
