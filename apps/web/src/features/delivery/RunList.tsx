import { Link } from 'react-router-dom';
import { GitBranch, Rocket } from 'lucide-react';
import type { RunSummary } from './types';
import { duration, TRIGGER_LABEL } from './format';
import { Ago, StatusIcon } from './ui';

export interface RunListProps {
  repositoryId: string;
  runs: RunSummary[];
}

/**
 * Runs as GitHub lists them, one line per run: what changed, where it
 * ran, and, for a failure, the root cause CodeLens found. The cause is
 * the column a plain CI list doesn't have.
 */
export default function RunList({ repositoryId, runs }: RunListProps) {
  if (runs.length === 0) {
    return (
      <div className="state">
        <span className="state-icon">
          <Rocket size={18} />
        </span>
        <h3>No runs match these filters</h3>
        <p>Clear a filter to see the rest of the history.</p>
      </div>
    );
  }

  return (
    <ul className="runs">
      {runs.map((run) => {
        const href = `/r/${encodeURIComponent(repositoryId)}/runs/${run.runNumber}`;
        return (
          <li key={run.id} className={`run s-${run.status}`}>
            <StatusIcon status={run.status} />
            <div className="run-main">
              <Link to={href} className="run-title">
                {run.deployTarget ? <span className="run-kind">Redeploy {run.deployTarget}</span> : null}
                <span className="truncate">{run.commitMessage}</span>
              </Link>
              <div className="run-meta">
                <span>
                  {run.pipeline} #{run.displayNumber ?? run.runNumber}
                </span>
                <span className="run-branch">
                  <GitBranch size={11} />
                  {run.branch}
                </span>
                <span className="sha">{run.commitShort}</span>
                <span className="hide-sm">{run.actor}</span>
                <span className="hide-sm">{TRIGGER_LABEL[run.trigger] ?? run.trigger}</span>
              </div>
            </div>
            {run.diagnosis ? (
              <Link
                to={href}
                className={`cause ${run.diagnosis.exonerated ? 'is-clear' : ''}`}
                title={run.diagnosis.title}
              >
                {run.diagnosis.categoryLabel}
                <span className="cause-conf">{Math.round(run.diagnosis.confidence * 100)}%</span>
              </Link>
            ) : (
              <span className="cause-none" />
            )}
            <div className="run-when">
              <span className="num">
                {run.durationMs ? duration(run.durationMs) : run.status === 'blocked' ? 'Waiting' : '—'}
              </span>
              <Ago iso={run.startedAt} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
