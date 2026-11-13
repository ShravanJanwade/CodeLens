import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, History, MoreHorizontal, RotateCcw } from 'lucide-react';
import { Dialog, Menu, MenuItem } from '../../components/overlay';
import { useRedeploy, useReleases } from './actions';
import type { EnvironmentRow } from './types';
import { ActionButton, Ago, Sha, type useAccessGate } from './ui';

const ENV_STATUS: Record<EnvironmentRow['status'], { label: string; tone: string }> = {
  healthy: { label: 'Healthy', tone: 'pass' },
  down: { label: 'Last deploy failed', tone: 'fail' },
  degraded: { label: 'Degraded', tone: 'warn' },
  deploying: { label: 'Deploying', tone: 'run' },
  unknown: { label: 'Not deployed', tone: 'idle' },
};

/**
 * Every deploy target: what it runs, since when, and whether its last
 * deploy landed. A target whose last deploy failed still serves its
 * previous release, so both are shown.
 */
export default function Environments({
  repositoryId,
  repoFullName,
  environments,
  gate,
}: {
  repositoryId: string;
  repoFullName: string | null;
  environments: EnvironmentRow[];
  gate: ReturnType<typeof useAccessGate>;
}) {
  const [rollingBack, setRollingBack] = useState<EnvironmentRow | null>(null);
  const base = `/r/${encodeURIComponent(repositoryId)}`;
  return (
    <>
      <div className="table-wrap">
        <table className="data envs">
          <thead>
            <tr>
              <th>Environment</th>
              <th>Region</th>
              <th>Release</th>
              <th>Deployed</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {environments.map((env) => {
              const status = ENV_STATUS[env.status] ?? ENV_STATUS.unknown;
              const failedAttempt =
                env.latestDeploy?.status === 'failed' &&
                env.latestDeploy.commitShort !== env.currentCommitShort
                  ? env.latestDeploy
                  : null;
              return (
                <tr key={env.id}>
                  <td>
                    <div className="env-name">
                      <strong>{env.name}</strong>
                      <span className={`tier tier-${env.tier}`}>{env.tier}</span>
                    </div>
                  </td>
                  <td>
                    <div className="env-region">
                      <span>{env.regionLabel}</span>
                      <span className="muted mono">{env.region}</span>
                    </div>
                  </td>
                  <td className="env-release">
                    {env.currentCommitSha ? (
                      <>
                        <div className="row-tight">
                          <Sha sha={env.currentCommitSha} repo={repoFullName} />
                          {env.currentRun && (
                            <Link
                              className="link-muted text-xs"
                              to={`${base}/runs/${env.currentRun.runNumber}`}
                            >
                              {env.currentRun.pipeline} #{env.currentRun.displayNumber}
                            </Link>
                          )}
                        </div>
                        {env.currentRun && (
                          <div className="env-msg truncate">{env.currentRun.commitMessage}</div>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="nowrap">
                    <Ago iso={env.deployedAt} />
                  </td>
                  <td>
                    <span className={`status-pill tone-${status.tone}`}>
                      <i className={`dot dot-${status.tone}`} />
                      {status.label}
                    </span>
                    {failedAttempt && (
                      <div className="env-note">
                        Tried <span className="mono">{failedAttempt.commitShort}</span>, still serving the
                        release above
                      </div>
                    )}
                  </td>
                  <td className="right">
                    <Menu
                      label={<MoreHorizontal size={15} />}
                      className="icon-btn"
                      ariaLabel={`Actions for ${env.name}`}
                    >
                      {(close) => (
                        <>
                          <MenuItem
                            icon={<RotateCcw size={14} />}
                            label="Roll back…"
                            hint="Redeploy an earlier release"
                            disabled={!env.currentCommitSha}
                            onSelect={() => {
                              close();
                              setRollingBack(env);
                            }}
                          />
                          {env.url && (
                            <MenuItem
                              icon={<ExternalLink size={14} />}
                              label="Open site"
                              hint={new URL(env.url).host}
                              onSelect={() => {
                                close();
                                window.open(env.url!, '_blank', 'noopener');
                              }}
                            />
                          )}
                        </>
                      )}
                    </Menu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <RollbackDialog
        repositoryId={repositoryId}
        repoFullName={repoFullName}
        environment={rollingBack}
        gate={gate}
        onClose={() => setRollingBack(null)}
      />
    </>
  );
}

function RollbackDialog({
  repositoryId,
  repoFullName,
  environment,
  gate,
  onClose,
}: {
  repositoryId: string;
  repoFullName: string | null;
  environment: EnvironmentRow | null;
  gate: ReturnType<typeof useAccessGate>;
  onClose: () => void;
}) {
  const releases = useReleases(repositoryId, environment?.name ?? null);
  const redeploy = useRedeploy(repositoryId);
  const [chosen, setChosen] = useState<string | null>(null);

  // Default to the newest release before the current one: the usual rollback.
  useEffect(() => {
    if (!environment) return setChosen(null);
    const list = releases.data ?? [];
    setChosen(list.find((r) => !r.current)?.commitSha ?? null);
  }, [environment, releases.data]);

  const choice = releases.data?.find((r) => r.commitSha === chosen);
  return (
    <Dialog
      open={Boolean(environment)}
      onClose={onClose}
      icon={<History size={16} />}
      title={`Roll back ${environment?.name ?? ''}`}
      description="Pick a release that ran here before. Only this environment is redeployed."
      footer={
        <>
          <span className="dialog-note">
            Starts the Deploy workflow on GitHub for {environment?.name}. It skips tests and the bake
            {environment?.tier === 'production'
              ? ' and waits for approval if the environment requires it'
              : ''}
            .
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <ActionButton
            gate={gate}
            className="btn btn-primary btn-sm"
            busy={redeploy.isPending}
            disabled={!choice || choice.current}
            onClick={() =>
              environment &&
              choice &&
              redeploy.mutate(
                { environment: environment.name, commitSha: choice.commitSha },
                { onSuccess: () => onClose() },
              )
            }
          >
            {choice ? `Deploy ${choice.commitShort}` : 'Deploy'}
          </ActionButton>
        </>
      }
    >
      {releases.isLoading && <div className="skeleton" style={{ height: 120 }} />}
      {releases.data && releases.data.length < 2 && (
        <p className="muted text-sm">There is no earlier release of {environment?.name} to go back to yet.</p>
      )}
      <div className="releases" role="radiogroup" aria-label="Releases">
        {releases.data?.map((release) => (
          <label
            key={release.commitSha}
            className={`release ${chosen === release.commitSha ? 'is-chosen' : ''}`}
          >
            <input
              type="radio"
              name="release"
              value={release.commitSha}
              checked={chosen === release.commitSha}
              disabled={release.current}
              onChange={() => setChosen(release.commitSha)}
            />
            <span className="release-main">
              <span className="release-top">
                <Sha sha={release.commitSha} repo={repoFullName} />
                <span className="truncate">{release.commitMessage ?? 'Release'}</span>
              </span>
              <span className="release-meta">
                {release.run ? `${release.run.pipeline} #${release.run.displayNumber} · ` : ''}
                deployed <Ago iso={release.deployedAt} /> by {release.actor}
              </span>
            </span>
            {release.current && <span className="badge badge-pass">Running now</span>}
          </label>
        ))}
      </div>
    </Dialog>
  );
}
