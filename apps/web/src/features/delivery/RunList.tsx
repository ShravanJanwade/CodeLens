import { Link } from 'react-router-dom';
import { BadgeCheck, GitBranch, GitPullRequest, Rocket } from 'lucide-react';
import type { RunSummary } from './types';
import { duration, relative, STATUS_LABEL, tone, TRIGGER_LABEL } from './format';

export interface RunListProps {
  repositoryId: string;
  runs: RunSummary[];
  /** Hides the branch column on narrow embeds. */
  compact?: boolean;
}

export default function RunList({ repositoryId, runs, compact = false }: RunListProps) {
  if (runs.length === 0) {
    return (
      <div className="state">
        <span className="state-icon">
          <Rocket size={20} />
        </span>
        <h3>No runs match these filters</h3>
        <p>Clear a filter to see the rest of the pipeline history.</p>
      </div>
    );
  }

  return (
    <div>
      {runs.map((run) => (
        <div
          key={run.id}
          className={`run-row ${run.status === 'failed' ? 'is-failed' : ''} ${
            run.status === 'running' ? 'is-running' : ''
          }`}
        >
          <i className={`dot dot-${tone(run.status)}`} title={STATUS_LABEL[run.status] ?? run.status} />

          <div className="run-title">
            <Link
              to={`/r/${encodeURIComponent(repositoryId)}/runs/${run.runNumber}`}
              className="truncate"
              style={{ display: 'block' }}
            >
              <strong>{run.commitMessage}</strong>
            </Link>
            <div className="run-title-meta">
              <span className="tag-mono">#{run.runNumber}</span>
              <span>{run.pipeline}</span>
              <span>·</span>
              <span>{TRIGGER_LABEL[run.trigger] ?? run.trigger}</span>
              <span>·</span>
              <span>{run.commitAuthor}</span>
              {run.pullRequestNumber && (
                <>
                  <span>·</span>
                  <span className="row-tight">
                    <GitPullRequest size={10} /> #{run.pullRequestNumber}
                  </span>
                </>
              )}
            </div>
          </div>

          {!compact && (
            <div className="run-branch-cell">
              <span className="run-branch">
                <GitBranch size={11} />
                {run.branch}
              </span>
              <div className="run-title-meta">
                <span className="tag-mono">{run.commitShort}</span>
                {run.targetTier !== 'none' && <span>→ {run.targetTier}</span>}
              </div>
            </div>
          )}

          <div className="run-verdict">
            {run.diagnosis ? (
              <>
                <span className={`badge ${run.diagnosis.exonerated ? 'badge-pass' : 'badge-fail'}`}>
                  {run.diagnosis.exonerated && <BadgeCheck size={10} />}
                  {run.diagnosis.categoryLabel}
                </span>
                <span className="text-xs muted truncate">{run.diagnosis.actionLabel}</span>
              </>
            ) : run.status === 'running' ? (
              <span className="badge badge-run">In progress</span>
            ) : run.status === 'success' ? (
              <span className="badge badge-pass">Passed</span>
            ) : (
              <span className="badge badge-idle">{STATUS_LABEL[run.status] ?? run.status}</span>
            )}
          </div>

          <div className="run-timing">
            <b>{run.status === 'running' ? 'live' : duration(run.durationMs)}</b>
            {relative(run.startedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}
