// Response shapes for the delivery pipeline API. Hand-written rather
// than generated: the API is small and these double as the contract
// the components are written against.

export type StageStatus =
  'pending' | 'queued' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled' | 'blocked';

export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled' | 'blocked';

export type StageKind =
  'checkout' | 'build' | 'test' | 'scan' | 'package' | 'approval' | 'deploy' | 'verify' | 'rollback';

export type EnvTier = 'development' | 'staging' | 'production';

export interface DiagnosisBadge {
  category: string;
  categoryLabel: string;
  title: string;
  confidence: number;
  recommendedAction: string;
  actionLabel: string;
  /** True when the category means "your change is not the problem". */
  exonerated: boolean;
}

export interface RunSummary {
  id: string;
  runNumber: number;
  pipeline: string;
  branch: string;
  targetTier: string;
  commitSha: string;
  commitShort: string;
  commitMessage: string;
  commitAuthor: string;
  trigger: string;
  pullRequestNumber: number | null;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  queuedMs: number | null;
  actor: string;
  failedStage: string | null;
  diagnosis: DiagnosisBadge | null;
}

export interface EnvironmentRow {
  id: string;
  name: string;
  tier: EnvTier;
  region: string;
  regionLabel: string;
  provider: string;
  cluster: string;
  url: string | null;
  requiresApproval: boolean;
  status: 'healthy' | 'degraded' | 'down' | 'deploying' | 'unknown';
  currentVersion: string | null;
  currentCommitSha: string | null;
  currentCommitShort: string | null;
  deployedAt: string | null;
  trafficPct: number;
  errorRate: number | null;
  latencyP95: number | null;
  requestsPerMin: number | null;
  replicas: number | null;
}

export interface DeliveryOverview {
  repository: {
    id: string;
    fullName: string;
    defaultBranch: string;
    language: string | null;
    description: string | null;
    lastAnalyzedAt: string | null;
  };
  pipelines: {
    id: string;
    name: string;
    provider: string;
    filePath: string;
    successRate: number | null;
    p50DurationMs: number | null;
    lastRunAt: string | null;
  }[];
  environments: EnvironmentRow[];
  runs: RunSummary[];
  stats: {
    windowRuns: number;
    successRate: number | null;
    failedRuns: number;
    p50DurationMs: number | null;
    p95DurationMs: number | null;
    diagnosedFailures: number;
    exoneratedFailures: number;
    exoneratedPct: number | null;
    p95DiagnosisMs: number | null;
    categoryCounts: Record<string, number>;
    activeRuns: number;
  };
}

export interface DiagnosisSignal {
  id: string;
  label: string;
  detail: string;
  supports: string;
  weight: number;
  source: 'log' | 'history' | 'topology' | 'diff' | 'metrics';
}

export interface Stage {
  id: string;
  key: string;
  name: string;
  kind: StageKind;
  lane: number;
  sequence: number;
  dependsOn: string[];
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  attempts: number;
  exitCode: number | null;
  runnerLabel: string | null;
  summary: Record<string, unknown>;
  log: string;
  environment: {
    id: string;
    name: string;
    tier: EnvTier;
    region: string;
    regionLabel: string;
    cluster: string;
    url: string | null;
  } | null;
}

export interface RunDetail {
  run: RunSummary & { pipelineFile: string | null };
  stages: Stage[];
  diagnosis: {
    stageKey: string;
    category: string;
    categoryLabel: string;
    title: string;
    summary: string;
    confidence: number;
    recommendation: string;
    recommendedAction: string;
    actionLabel: string;
    exonerated: boolean;
    blame: {
      commitSha: string | null;
      commitShort: string | null;
      file: string | null;
      line: number | null;
      author: string | null;
    };
    signals: DiagnosisSignal[];
    computeMs: number;
    createdAt: string;
  } | null;
  deployments: {
    id: string;
    environment: { name: string; region: string; regionLabel: string; tier: EnvTier } | null;
    version: string;
    previousVersion: string | null;
    commitShort: string;
    strategy: string;
    status: string;
    trafficPct: number;
    healthCheck: string;
    startedAt: string;
    completedAt: string | null;
    rolledBackAt: string | null;
    rollbackReason: string | null;
  }[];
}

export interface BlastRadius {
  changed: string[];
  impacted: {
    path: string;
    depth: number;
    via: string[];
    role: string;
    service?: string;
    endpoints: string[];
  }[];
  layers: { depth: number; count: number; paths: string[] }[];
  services: { service: string; fileCount: number; endpoints: string[]; minDepth: number }[];
  endpoints: string[];
  tests: string[];
  untested: string[];
  hubs: { path: string; importedBy: number }[];
  risk: { score: number; band: 'low' | 'medium' | 'high' | 'critical'; reasons: string[] };
  stats: {
    graphNodes: number;
    graphEdges: number;
    reachedPct: number;
    maxDepthReached: number;
    computeMs: number;
  };
  unknown: string[];
}

export interface GraphPayload {
  nodes: {
    path: string;
    role: string;
    service: string | null;
    endpoints: string[];
    complexity: number;
    importedBy: number;
    imports: number;
  }[];
  edges: { source: string; target: string; kind: string }[];
  services: string[];
  stats: { nodes: number; edges: number; services: number; endpoints: number; maxFanIn: number };
}

export interface FlakyTestRow {
  id: string;
  testName: string;
  filePath: string;
  suite: string;
  runCount: number;
  failCount: number;
  flakeRate: number;
  distinctBranches: number;
  quarantined: boolean;
  firstSeenAt: string;
  lastFailedAt: string | null;
}

export interface BenchmarkReport {
  engineVersion: string;
  totalCases: number;
  correctCategory: number;
  correctAction: number;
  categoryAccuracy: number;
  actionAccuracy: number;
  meanConfidence: number;
  p50ComputeMs: number;
  p95ComputeMs: number;
  perCategory: Record<
    string,
    { support: number; correct: number; precision: number; recall: number; f1: number }
  >;
  confusion: { expected: string; predicted: string; count: number }[];
  // Optional: the benchmark CLI that writes these rows can be older
  // than the deployed bundle.
  easyAccuracy?: number;
  hardAccuracy?: number;
  hardCases?: number;
  ablation?: { name: string; sources: string[]; accuracy: number; delta: number }[];
  ranAt: string;
  categoryLabels: Record<string, string>;
}

export interface LiveDiagnosis extends DiagnosisBadge {
  summary: string;
  recommendation: string;
  signals: DiagnosisSignal[];
  blame?: { commitSha?: string; file?: string; line?: number; author?: string };
  engineVersion: string;
  elapsedMs: number;
  evidenceUsed: {
    logBytes: number;
    failingTests: number;
    siblingRegions: number;
    greenBaselineSamples: number;
  };
}

/** The repository the public demo opens on. */
export const DEMO_REPO = 'demo-commerce-platform';
