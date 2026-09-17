import { CloudCog, ExternalLink, GitCommit, Layers, ShieldCheck } from 'lucide-react';
import type { EnvironmentRow, EnvTier } from './types';
import { relative, tone } from './format';

/**
 * Deploy targets grouped by tier, one cell per region.
 *
 * Production spans several regions, and the single most useful thing
 * this view does is make an asymmetry between them obvious -- one
 * amber cell among green ones answers "is it everywhere or just
 * there?" before anyone opens a log.
 */
export interface RegionMatrixProps {
  environments: EnvironmentRow[];
}

const TIER_ORDER: EnvTier[] = ['development', 'staging', 'production'];

const TIER_LABEL: Record<EnvTier, string> = {
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
};

export default function RegionMatrix({ environments }: RegionMatrixProps) {
  const tiers = TIER_ORDER.map((tier) => ({
    tier,
    rows: environments.filter((e) => e.tier === tier),
  })).filter((group) => group.rows.length > 0);

  return (
    <div className="rm">
      {tiers.map(({ tier, rows }) => {
        const unhealthy = rows.filter((r) => r.status !== 'healthy').length;
        return (
          <div className="rm-tier" key={tier}>
            <div className="rm-tier-hd">
              <Layers size={11} />
              {TIER_LABEL[tier]}
              <span className="tab-count">{rows.length}</span>
              {rows[0]?.requiresApproval && (
                <span className="badge badge-brand" style={{ marginLeft: 4 }}>
                  <ShieldCheck size={10} /> approval required
                </span>
              )}
              {unhealthy > 0 && (
                <span className="badge badge-warn" style={{ marginLeft: 'auto' }}>
                  {unhealthy} of {rows.length} need attention
                </span>
              )}
            </div>
            <div className="rm-grid">
              {rows.map((env) => (
                <div
                  key={env.id}
                  className={`rm-cell ${env.status === 'degraded' ? 'is-degraded' : ''} ${
                    env.status === 'down' ? 'is-down' : ''
                  }`}
                >
                  <div className="rm-cell-top">
                    <i className={`dot dot-${tone(env.status)}`} />
                    <span className="rm-region">{env.region}</span>
                    <span className="rm-region-label">{env.regionLabel}</span>
                    {env.url && (
                      <a
                        className="icon-btn icon-btn-sm"
                        style={{ marginLeft: 'auto' }}
                        href={env.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${env.region} environment`}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>

                  <div className="rm-version">
                    <CloudCog size={12} className="muted" />
                    <strong style={{ color: 'var(--c-ink)' }}>{env.currentVersion ?? '—'}</strong>
                    {env.currentCommitShort && (
                      <span className="tag-mono">
                        <GitCommit size={10} />
                        {env.currentCommitShort}
                      </span>
                    )}
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
                      {relative(env.deployedAt)}
                    </span>
                  </div>

                  <div className="rm-stats">
                    <div className="rm-stat">
                      <b className={(env.errorRate ?? 0) > 1 ? 'is-bad' : ''}>
                        {env.errorRate === null ? '—' : `${env.errorRate.toFixed(2)}%`}
                      </b>
                      <span>errors</span>
                    </div>
                    <div className="rm-stat">
                      <b className={(env.latencyP95 ?? 0) > 500 ? 'is-bad' : ''}>
                        {env.latencyP95 === null ? '—' : `${env.latencyP95}ms`}
                      </b>
                      <span>p95</span>
                    </div>
                    <div className="rm-stat">
                      <b>{env.replicas ?? '—'}</b>
                      <span>replicas</span>
                    </div>
                  </div>

                  {env.status === 'degraded' && (
                    <p className="text-xs" style={{ color: 'var(--c-warn-ink)' }}>
                      Running an older revision — the last deploy to this region did not complete.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
