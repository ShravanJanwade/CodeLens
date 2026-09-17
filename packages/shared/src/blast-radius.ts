// ============================================================
// CodeLens — Change blast radius
// ============================================================
// "What does this diff actually touch?"
//
// The import graph stored in repository_edges points the way code
// reads: source imports target. Impact travels the other way -- if
// you change a module, everything that imports it is at risk. So
// every traversal here runs over the *reversed* graph.
//
// Output is a layered closure rather than a flat set, because
// distance matters: a direct importer almost certainly changes
// behaviour, something six hops away usually does not, and a
// reviewer needs to see that difference to triage.
// ============================================================

export interface GraphEdge {
  source: string;
  target: string;
  kind?: string;
}

export type FileRole = 'source' | 'test' | 'config' | 'migration' | 'schema' | 'entrypoint';

export interface GraphFile {
  path: string;
  role?: FileRole;
  /** Deployable unit this file belongs to. */
  service?: string;
  /** HTTP routes or public API surface declared in this file. */
  endpoints?: string[];
  complexity?: number;
  /** Fan-in from the last index, used to rank hubs. */
  importedBy?: number;
}

export interface BlastRadiusInput {
  changed: string[];
  edges: GraphEdge[];
  files: GraphFile[];
  /** Traversal ceiling. Past ~4 hops nearly everything is reachable. */
  maxDepth?: number;
}

export interface ImpactedFile {
  path: string;
  /** Hops from the nearest changed file. 0 means it is in the diff. */
  depth: number;
  /** One shortest path back to a changed file, for the "why" column. */
  via: string[];
  role: FileRole;
  service?: string;
  endpoints: string[];
}

export interface BlastRadius {
  changed: string[];
  impacted: ImpactedFile[];
  /** Impacted counts bucketed by hop distance. */
  layers: { depth: number; count: number; paths: string[] }[];
  services: { service: string; fileCount: number; endpoints: string[]; minDepth: number }[];
  endpoints: string[];
  tests: string[];
  /** Impacted source files that no impacted test reaches. */
  untested: string[];
  /** Files with unusually high fan-in that the change flows through. */
  hubs: { path: string; importedBy: number }[];
  risk: {
    score: number;
    band: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
  };
  stats: {
    graphNodes: number;
    graphEdges: number;
    reachedPct: number;
    maxDepthReached: number;
    computeMs: number;
  };
}

const DEFAULT_MAX_DEPTH = 4;

/**
 * Breadth-first closure over the reversed import graph.
 *
 * BFS rather than DFS so the first time a node is reached is via its
 * shortest path — which means `depth` and `via` are correct without a
 * second pass, and the layer buckets fall out of the traversal order.
 */
export function computeBlastRadius(input: BlastRadiusInput): BlastRadius {
  const started = now();
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;

  const meta = new Map<string, GraphFile>();
  for (const f of input.files) meta.set(f.path, f);

  // Reverse adjacency: target -> everything that imports it.
  const dependents = new Map<string, string[]>();
  for (const e of input.edges) {
    if (!e.source || !e.target || e.source === e.target) continue;
    const list = dependents.get(e.target);
    if (list) list.push(e.source);
    else dependents.set(e.target, [e.source]);
  }

  // Only seed from paths the index actually knows about; a diff can
  // include files that were never indexed (assets, docs, deleted).
  const changed = input.changed.filter((p) => meta.has(p) || dependents.has(p));
  const seen = new Map<string, ImpactedFile>();
  let frontier: { path: string; via: string[] }[] = changed.map((p) => ({ path: p, via: [p] }));

  for (const p of changed) seen.set(p, describe(p, 0, [p], meta));

  let depth = 0;
  let maxDepthReached = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    depth += 1;
    const next: { path: string; via: string[] }[] = [];
    for (const node of frontier) {
      for (const importer of dependents.get(node.path) ?? []) {
        if (seen.has(importer)) continue;
        const via = [...node.via, importer];
        seen.set(importer, describe(importer, depth, via, meta));
        next.push({ path: importer, via });
      }
    }
    if (next.length > 0) maxDepthReached = depth;
    frontier = next;
  }

  const impacted = [...seen.values()].sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));

  // ---- Layers ----
  const layerMap = new Map<number, string[]>();
  for (const f of impacted) {
    const list = layerMap.get(f.depth);
    if (list) list.push(f.path);
    else layerMap.set(f.depth, [f.path]);
  }
  const layers = [...layerMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, paths]) => ({ depth: d, count: paths.length, paths }));

  // ---- Services ----
  const serviceMap = new Map<string, { files: number; endpoints: Set<string>; minDepth: number }>();
  for (const f of impacted) {
    if (!f.service) continue;
    const entry = serviceMap.get(f.service) ?? {
      files: 0,
      endpoints: new Set<string>(),
      minDepth: Number.POSITIVE_INFINITY,
    };
    entry.files += 1;
    entry.minDepth = Math.min(entry.minDepth, f.depth);
    for (const e of f.endpoints) entry.endpoints.add(e);
    serviceMap.set(f.service, entry);
  }
  const services = [...serviceMap.entries()]
    .map(([service, v]) => ({
      service,
      fileCount: v.files,
      endpoints: [...v.endpoints].sort(),
      minDepth: v.minDepth,
    }))
    .sort((a, b) => a.minDepth - b.minDepth || b.fileCount - a.fileCount);

  const endpoints = [...new Set(impacted.flatMap((f) => f.endpoints))].sort();
  const tests = impacted.filter((f) => f.role === 'test').map((f) => f.path);

  // ---- Coverage gap ----
  // A source file is "untested" here when no *impacted* test sits in
  // its module tree. That is a reachability claim about this diff, not
  // a statement about line coverage.
  const testDirs = new Set(tests.map(moduleOf));
  const untested = impacted
    .filter((f) => f.depth === 0 && f.role === 'source' && !testDirs.has(moduleOf(f.path)))
    .map((f) => f.path);

  // ---- Hubs ----
  const hubs = impacted
    .map((f) => ({ path: f.path, importedBy: dependents.get(f.path)?.length ?? 0 }))
    .filter((h) => h.importedBy >= 5)
    .sort((a, b) => b.importedBy - a.importedBy)
    .slice(0, 5);

  const graphNodes = Math.max(meta.size, 1);
  const risk = scoreRisk({ impacted, services, endpoints, untested, hubs, changed, graphNodes });

  return {
    changed,
    impacted,
    layers,
    services,
    endpoints,
    tests,
    untested,
    hubs,
    risk,
    stats: {
      graphNodes: meta.size,
      graphEdges: input.edges.length,
      reachedPct: Math.round((impacted.length / graphNodes) * 1000) / 10,
      maxDepthReached,
      computeMs: Math.round((now() - started) * 100) / 100,
    },
  };
}

function describe(path: string, depth: number, via: string[], meta: Map<string, GraphFile>): ImpactedFile {
  const m = meta.get(path);
  return {
    path,
    depth,
    via,
    role: m?.role ?? inferRole(path),
    service: m?.service,
    endpoints: m?.endpoints ?? [],
  };
}

/** Fallback when the indexer did not label the file. */
export function inferRole(path: string): FileRole {
  if (/\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(?:__tests__|tests?)\//i.test(path)) return 'test';
  if (/migration|migrate|\.sql$/i.test(path)) return 'migration';
  if (/schema\.[cm]?[jt]s$|\.prisma$|\.graphql$/i.test(path)) return 'schema';
  if (/\.(ya?ml|toml|ini|env|json|tf|tfvars)$|(^|\/)(?:config|deploy|k8s|helm|infra)\//i.test(path))
    return 'config';
  if (/(^|\/)(?:index|main|server|app)\.[cm]?[jt]sx?$/i.test(path)) return 'entrypoint';
  return 'source';
}

function moduleOf(path: string): string {
  return path
    .replace(/\.(test|spec)\.[a-z]+$/i, '')
    .replace(/^(?:tests?|__tests__|spec)\//, '')
    .replace(/\/[^/]*$/, '');
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ============================================================
// Risk scoring
// ------------------------------------------------------------
// Deliberately additive and capped rather than multiplicative: a
// reviewer should be able to read the reasons list and see exactly
// which factors produced the number. An opaque 0-100 that nobody
// can decompose gets ignored after the first week.
// ============================================================

interface RiskInput {
  impacted: ImpactedFile[];
  services: { service: string; fileCount: number; endpoints: string[]; minDepth: number }[];
  endpoints: string[];
  untested: string[];
  hubs: { path: string; importedBy: number }[];
  changed: string[];
  graphNodes: number;
}

function scoreRisk(input: RiskInput): BlastRadius['risk'] {
  const reasons: string[] = [];
  let score = 0;

  // ---- Spread: how much of the codebase is downstream ----
  const spread = input.impacted.length / Math.max(input.graphNodes, 1);
  const spreadPoints = Math.min(30, Math.round(spread * 120));
  if (spreadPoints > 0) {
    score += spreadPoints;
    reasons.push(
      `${input.impacted.length} of ${input.graphNodes} indexed files are downstream of this change (${(spread * 100).toFixed(1)}%).`,
    );
  }

  // ---- Services: crossing a deployable boundary is the big one ----
  if (input.services.length >= 3) {
    score += 22;
    reasons.push(
      `Spans ${input.services.length} deployable services, so one bad merge fans out across independent releases.`,
    );
  } else if (input.services.length === 2) {
    score += 13;
    reasons.push('Crosses two services, so the change cannot be rolled back in isolation.');
  } else if (input.services.length === 1) {
    score += 4;
    reasons.push(`Contained within ${input.services[0].service}.`);
  }

  // ---- Public surface ----
  if (input.endpoints.length > 0) {
    const pts = Math.min(18, 6 + input.endpoints.length * 2);
    score += pts;
    reasons.push(
      `Reaches ${input.endpoints.length} public endpoint${input.endpoints.length === 1 ? '' : 's'}: ${input.endpoints.slice(0, 3).join(', ')}${input.endpoints.length > 3 ? '…' : ''}.`,
    );
  }

  // ---- Test coverage gap ----
  if (input.untested.length > 0) {
    const pts = Math.min(20, 8 + input.untested.length * 3);
    score += pts;
    reasons.push(
      `${input.untested.length} changed file${input.untested.length === 1 ? ' has' : 's have'} no test in the impacted set: ${input.untested.slice(0, 2).join(', ')}${input.untested.length > 2 ? '…' : ''}.`,
    );
  }

  // ---- Hubs ----
  if (input.hubs.length > 0) {
    const top = input.hubs[0];
    score += Math.min(12, Math.round(top.importedBy / 3));
    reasons.push(`Flows through ${top.path}, imported by ${top.importedBy} modules.`);
  }

  // ---- Schema and migration changes are hard to undo ----
  const risky = input.impacted.filter(
    (f) => f.depth === 0 && (f.role === 'migration' || f.role === 'schema'),
  );
  if (risky.length > 0) {
    score += 15;
    reasons.push(`Includes a ${risky[0].role} change (${risky[0].path}) — forward-only once deployed.`);
  }

  const bounded = Math.min(100, score);
  return { score: bounded, band: band(bounded), reasons };
}

function band(score: number): BlastRadius['risk']['band'] {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 22) return 'medium';
  return 'low';
}

export const RISK_BAND_LABELS: Record<BlastRadius['risk']['band'], string> = {
  low: 'Low risk',
  medium: 'Moderate risk',
  high: 'High risk',
  critical: 'Critical risk',
};
