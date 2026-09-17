import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Boxes,
  Check,
  FileWarning,
  Layers,
  Network,
  Radar,
  Search,
  ShieldAlert,
  Sigma,
  TestTube2,
  Workflow,
  Zap,
} from 'lucide-react';
import { useBlastRadius, useGraph } from './queries';
import { DEMO_REPO } from './types';
import { basename } from './format';
import { Loading, ErrorState } from '../../components/ui';

/**
 * Change impact: pick the files in a diff, see everything downstream.
 *
 * The question this answers is the one code review cannot: "I can
 * see what changed, but what does it *reach*?" Traversal runs over
 * the reversed import graph, so depth is distance from the diff and
 * a reviewer can tell a direct importer from something six hops
 * away.
 */

const PRESETS = [
  {
    label: 'Shared money helper',
    hint: 'A leaf utility with high fan-in — worst case for a small diff',
    files: ['packages/core/src/money.ts'],
  },
  {
    label: 'Promo stacking change',
    hint: 'The commit that broke main in run #2179',
    files: ['services/orders/src/promo.ts', 'services/orders/src/cart.ts'],
  },
  {
    label: 'Ledger settlement',
    hint: 'Crosses the payments boundary',
    files: ['services/ledger/src/settle.ts'],
  },
  {
    label: 'Single service handler',
    hint: 'Well-contained, for contrast',
    files: ['services/identity/src/repo.ts'],
  },
];

const RISK_LABEL: Record<string, string> = {
  low: 'Low risk',
  medium: 'Moderate risk',
  high: 'High risk',
  critical: 'Critical risk',
};

export default function ImpactPage() {
  const params = useParams();
  const repositoryId = params.repoId ?? DEMO_REPO;

  const [picked, setPicked] = useState<string[]>(PRESETS[0].files);
  const [depth, setDepth] = useState(4);
  const [filter, setFilter] = useState('');

  const graph = useGraph(repositoryId);
  const radius = useBlastRadius(repositoryId, picked, depth);

  const candidates = useMemo(() => {
    const nodes = graph.data?.nodes ?? [];
    const needle = filter.trim().toLowerCase();
    return nodes
      .filter((n) => n.role !== 'test' && (!needle || n.path.toLowerCase().includes(needle)))
      .sort((a, b) => b.importedBy - a.importedBy || a.path.localeCompare(b.path))
      .slice(0, 140);
  }, [graph.data, filter]);

  const toggle = (path: string) =>
    setPicked((current) => (current.includes(path) ? current.filter((p) => p !== path) : [...current, path]));

  if (graph.isLoading) return <Loading label="Loading dependency graph…" />;
  if (graph.error) return <ErrorState error={graph.error} retry={() => graph.refetch()} />;

  const data = radius.data;
  const maxLayer = Math.max(1, ...(data?.layers.map((l) => l.count) ?? [1]));

  return (
    <div className="dl-page">
      <header className="dl-head">
        <div className="dl-head-main">
          <h1>
            <Radar size={24} style={{ color: 'var(--c-brand-ink)' }} />
            Change impact
          </h1>
          <p>
            Select the files in a change and see everything downstream of it — which modules, which services,
            which public endpoints, and which of them no test reaches. Traversal runs over the reversed import
            graph of {graph.data?.stats.nodes ?? 0} indexed files and {graph.data?.stats.edges ?? 0} import
            edges.
          </p>
        </div>
        <div className="dl-head-actions">
          <Link className="btn btn-secondary" to={`/r/${encodeURIComponent(repositoryId)}/delivery`}>
            <Workflow size={15} /> Delivery
          </Link>
        </div>
      </header>

      <div className="row-wrap">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.label}
            className={`btn btn-sm ${
              picked.join(',') === preset.files.join(',') ? 'btn-primary' : 'btn-outline'
            }`}
            onClick={() => setPicked(preset.files)}
            title={preset.hint}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="br-layout">
        {/* ---- File picker ---- */}
        <aside className="panel-flush br-picker">
          <div className="panel-hd">
            <div>
              <h2>Changed files</h2>
              <p>
                {picked.length} selected of {graph.data?.stats.nodes ?? 0} indexed
              </p>
            </div>
            {picked.length > 0 && (
              <div className="panel-hd-actions">
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => setPicked([])}>
                  Clear
                </button>
              </div>
            )}
          </div>
          <div style={{ padding: '10px 16px' }}>
            <div className="search">
              <Search size={14} />
              <input
                className="input"
                placeholder="Filter files"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter files"
              />
            </div>
            <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <label className="text-xs muted" htmlFor="depth">
                Max depth
              </label>
              <div className="segmented">
                {[2, 3, 4, 6].map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={depth === d ? 'is-active' : ''}
                    onClick={() => setDepth(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="br-file-list">
            {candidates.map((node) => (
              <button
                type="button"
                key={node.path}
                className={`br-file ${picked.includes(node.path) ? 'is-picked' : ''}`}
                onClick={() => toggle(node.path)}
              >
                <span className="br-check">
                  <Check size={11} />
                </span>
                <span className="br-file-path" title={node.path}>
                  {node.path}
                </span>
                {node.importedBy > 0 && (
                  <span className="stage-chip" title={`Imported by ${node.importedBy} modules`}>
                    {node.importedBy}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* ---- Result ---- */}
        <div className="stack-5">
          {picked.length === 0 ? (
            <div className="panel state">
              <span className="state-icon">
                <Radar size={20} />
              </span>
              <h3>Pick at least one changed file</h3>
              <p>Choose a preset above or select files from the list to compute the blast radius.</p>
            </div>
          ) : radius.isLoading && !data ? (
            <Loading label="Traversing the graph…" />
          ) : radius.error ? (
            <ErrorState error={radius.error} retry={() => radius.refetch()} />
          ) : data ? (
            <>
              {/* Risk */}
              <section className="panel-flush">
                <div className="br-risk">
                  <div className={`br-risk-score band-${data.risk.band}`}>{data.risk.score}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="row-tight">
                      <ShieldAlert size={15} style={{ color: 'var(--c-ink-3)' }} />
                      <h2 style={{ fontSize: '1.05rem' }}>{RISK_LABEL[data.risk.band]}</h2>
                      <span className="tag-mono">computed in {data.stats.computeMs.toFixed(2)}ms</span>
                    </div>
                    <ul className="br-reasons" style={{ marginTop: 10, listStyle: 'none', padding: 0 }}>
                      {data.risk.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* Summary metrics */}
              <div className="dl-metrics">
                <div className="dl-metric">
                  <span className="dl-metric-top">
                    <Sigma size={11} /> Files reached
                  </span>
                  <span className="dl-metric-value">{data.impacted.length}</span>
                  <span className="dl-metric-note">
                    {data.stats.reachedPct}% of the indexed graph, {data.stats.maxDepthReached} hops deep
                  </span>
                </div>
                <div className="dl-metric">
                  <span className="dl-metric-top">
                    <Boxes size={11} /> Services
                  </span>
                  <span className="dl-metric-value">{data.services.length}</span>
                  <span className="dl-metric-note">
                    {data.services.map((s) => s.service).join(', ') || 'none'}
                  </span>
                </div>
                <div className="dl-metric">
                  <span className="dl-metric-top">
                    <Network size={11} /> Public endpoints
                  </span>
                  <span className="dl-metric-value">{data.endpoints.length}</span>
                  <span className="dl-metric-note">reachable from this change</span>
                </div>
                <div className="dl-metric">
                  <span className="dl-metric-top">
                    <TestTube2 size={11} /> Tests in range
                  </span>
                  <span className="dl-metric-value">{data.tests.length}</span>
                  <span className="dl-metric-note">
                    {data.untested.length > 0
                      ? `${data.untested.length} changed file${data.untested.length === 1 ? '' : 's'} uncovered`
                      : 'every changed file has a test in range'}
                  </span>
                </div>
              </div>

              {/* Coverage gap — the actionable finding */}
              {data.untested.length > 0 && (
                <div className="alert alert-warn">
                  <FileWarning size={18} />
                  <div>
                    <strong>
                      {data.untested.length} changed file
                      {data.untested.length === 1 ? ' has' : 's have'} no test in the impacted set
                    </strong>
                    <p>
                      {data.untested.join(', ')} — nothing downstream of these files exercises them, so a
                      green pipeline would not prove this change works.
                    </p>
                  </div>
                </div>
              )}

              {/* Layer ladder */}
              <section className="panel-flush">
                <div className="panel-hd">
                  <Layers size={15} style={{ color: 'var(--c-ink-3)' }} />
                  <div>
                    <h2>Impact by distance</h2>
                    <p>How far the change propagates. Closer hops are likelier to change behaviour.</p>
                  </div>
                </div>
                <div className="panel-bd">
                  <div className="br-layers">
                    {data.layers.map((layer) => (
                      <div key={layer.depth} className={`br-layer d${layer.depth}`}>
                        <span className="br-layer-label">
                          {layer.depth === 0
                            ? 'In the diff'
                            : `${layer.depth} hop${layer.depth === 1 ? '' : 's'}`}
                        </span>
                        <span className="br-layer-bar">
                          <span style={{ width: `${(layer.count / maxLayer) * 100}%` }} />
                        </span>
                        <span className="br-layer-count">{layer.count}</span>
                      </div>
                    ))}
                  </div>
                  {data.hubs.length > 0 && (
                    <p className="text-xs muted" style={{ marginTop: 14 }}>
                      <Zap size={11} style={{ verticalAlign: -1 }} /> Flows through{' '}
                      {data.hubs.map((h) => `${basename(h.path)} (${h.importedBy} importers)`).join(', ')}.
                    </p>
                  )}
                </div>
              </section>

              {/* Services */}
              {data.services.length > 0 && (
                <section className="panel-flush">
                  <div className="panel-hd">
                    <Boxes size={15} style={{ color: 'var(--c-ink-3)' }} />
                    <div>
                      <h2>Services that must be redeployed</h2>
                      <p>Each is an independent release, so this change cannot roll back atomically.</p>
                    </div>
                  </div>
                  <div className="panel-bd">
                    <div className="br-services">
                      {data.services.map((service) => (
                        <div className="br-service" key={service.service}>
                          <div className="br-service-name">
                            <Boxes size={13} style={{ color: 'var(--c-brand-ink)' }} />
                            {service.service}
                          </div>
                          <p className="br-service-meta">
                            {service.fileCount} file{service.fileCount === 1 ? '' : 's'} ·{' '}
                            {service.minDepth === 0 ? 'directly changed' : `${service.minDepth} hops away`}
                          </p>
                          {service.endpoints.length > 0 && (
                            <div className="br-service-endpoints">
                              {service.endpoints.slice(0, 4).map((endpoint) => (
                                <code key={endpoint} title={endpoint}>
                                  {endpoint}
                                </code>
                              ))}
                              {service.endpoints.length > 4 && (
                                <code className="muted">+{service.endpoints.length - 4} more</code>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Full file list */}
              <section className="panel-flush">
                <div className="panel-hd">
                  <Network size={15} style={{ color: 'var(--c-ink-3)' }} />
                  <div>
                    <h2>Impacted files</h2>
                    <p>Shortest path back to a changed file, so you can see why each one is listed.</p>
                  </div>
                  <div className="panel-hd-actions">
                    <span className="tag-mono">{data.impacted.length} files</span>
                  </div>
                </div>
                <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Role</th>
                        <th>Service</th>
                        <th className="right">Hops</th>
                        <th>Reached via</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.impacted.map((file) => (
                        <tr key={file.path}>
                          <td>
                            <code className={file.depth === 0 ? 'code-inline' : ''}>{file.path}</code>
                          </td>
                          <td>
                            <span className="badge badge-idle">{file.role}</span>
                          </td>
                          <td>{file.service ?? '—'}</td>
                          <td className="right num">{file.depth}</td>
                          <td className="text-xs muted truncate" style={{ maxWidth: 280 }}>
                            {file.depth === 0
                              ? 'in the diff'
                              : file.via
                                  .slice(0, -1)
                                  .map((p) => basename(p))
                                  .join(' → ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {data.unknown.length > 0 && (
                <p className="text-xs muted">
                  {data.unknown.length} selected path
                  {data.unknown.length === 1 ? ' is' : 's are'} not in the index, so nothing downstream of{' '}
                  {data.unknown.length === 1 ? 'it' : 'them'} could be computed.
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
