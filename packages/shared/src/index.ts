// ============================================================
// CodeLens Platform — Shared Domain Types
// ============================================================
// Central type definitions for all domain entities.
// Used across API, web app, workers, and extension.
// ============================================================

// ---- Identity & Access ----

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'admin' | 'user' | 'viewer';

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
}

// ---- Repository Management ----

export interface Repository {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  url?: string;
  defaultBranch: string;
  language?: string;
  description?: string;
  lastAnalyzedAt?: string;
  riskScore?: number;
  healthStatus: HealthStatus;
  createdAt: string;
  updatedAt: string;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface RepositoryFile {
  id: string;
  repositoryId: string;
  path: string;
  language: string;
  sizeBytes: number;
  complexity?: number;
  riskScore?: number;
}

// ---- Code Intelligence ----

export interface CodeAnalysisRun {
  id: string;
  repositoryId: string;
  status: AnalysisStatus;
  branch: string;
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  symbolsIndexed: number;
  findingsCount: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CodeFinding {
  id: string;
  analysisRunId: string;
  repositoryId: string;
  filePath: string;
  line: number;
  endLine?: number;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  suggestion?: string;
  confidence: number;
  source: 'static-analysis' | 'ai' | 'pattern-match';
}

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type FindingCategory =
  'code-smell' | 'bug-risk' | 'complexity' | 'duplication' | 'security' | 'performance' | 'maintainability';

// ---- Service Registry ----

export interface Service {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  status: ServiceStatus;
  version: string;
  healthEndpoint: string;
  dependencies: string[];
  metadata: Record<string, string>;
  lastHealthCheck?: string;
  errorRate?: number;
  latencyP50?: number;
  latencyP99?: number;
  requestsPerMinute?: number;
  createdAt: string;
  updatedAt: string;
}

export type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface Deployment {
  id: string;
  serviceId: string;
  version: string;
  previousVersion?: string;
  status: DeploymentStatus;
  deployedAt: string;
  deployedBy?: string;
  commitSha?: string;
  changelog?: string;
}

export type DeploymentStatus = 'active' | 'rolling-back' | 'rolled-back' | 'superseded';

// ---- Telemetry ----

export interface TelemetryEvent {
  id: string;
  serviceId: string;
  type: TelemetryType;
  timestamp: string;
  data: Record<string, unknown>;
  correlationId?: string;
}

export type TelemetryType = 'metric' | 'log' | 'trace' | 'event';

export interface MetricDataPoint {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  labels: Record<string, string>;
}

export interface LogEntry {
  id: string;
  serviceId: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// ---- Incident Management ----

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  serviceId: string;
  serviceName?: string;
  createdAt: string;
  updatedAt: string;
  detectedAt: string;
  resolvedAt?: string;
  rootCause?: string;
  confidence?: number;
  evidence: Evidence[];
  timeline: TimelineEntry[];
  relatedAlerts: string[];
  relatedDeployments: string[];
  agentRunId?: string;
  remediationPlan?: RemediationPlan;
  approvalState?: ApprovalState;
}

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus =
  'open' | 'investigating' | 'mitigating' | 'awaiting_approval' | 'resolved' | 'closed';

export interface Evidence {
  id: string;
  type: EvidenceType;
  source: string;
  description: string;
  data: Record<string, unknown>;
  timestamp: string;
  significance: 'supporting' | 'contradicting' | 'neutral';
}

export type EvidenceType = 'metric' | 'log' | 'trace' | 'deployment' | 'config' | 'dependency';

export interface TimelineEntry {
  id: string;
  timestamp: string;
  type: TimelineEventType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export type TimelineEventType =
  | 'deployment'
  | 'alert_triggered'
  | 'incident_created'
  | 'agent_started'
  | 'tool_called'
  | 'hypothesis_created'
  | 'hypothesis_eliminated'
  | 'root_cause_identified'
  | 'remediation_proposed'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_rejected'
  | 'remediation_executed'
  | 'recovery_verified'
  | 'incident_resolved';

// ---- Alert ----

export interface Alert {
  id: string;
  fingerprint: string;
  serviceId: string;
  severity: IncidentSeverity;
  title: string;
  description: string;
  metric?: string;
  threshold?: number;
  currentValue?: number;
  firedAt: string;
  resolvedAt?: string;
  incidentId?: string;
  status: 'firing' | 'resolved' | 'suppressed';
}

// ---- Agent Orchestration ----

export interface AgentRun {
  id: string;
  incidentId: string;
  status: AgentRunStatus;
  startedAt: string;
  completedAt?: string;
  totalSteps: number;
  totalToolCalls: number;
  model?: string;
  tokenUsage?: number;
  error?: string;
}

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentStep {
  id: string;
  agentRunId: string;
  sequenceNumber: number;
  agentType: AgentType;
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  reasoning?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export type AgentType =
  'orchestrator' | 'metrics' | 'logs' | 'traces' | 'deployment' | 'dependency' | 'root-cause' | 'remediation';

export interface ToolCall {
  id: string;
  agentStepId: string;
  toolName: string;
  toolType: 'read_only' | 'mutating';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

// ---- Hypothesis Engine ----

export interface Hypothesis {
  id: string;
  incidentId: string;
  agentRunId: string;
  title: string;
  description: string;
  status: HypothesisStatus;
  confidence: number;
  supportingEvidence: Evidence[];
  contradictingEvidence: Evidence[];
  createdAt: string;
  updatedAt: string;
}

export type HypothesisStatus = 'active' | 'confirmed' | 'eliminated' | 'investigating';

// ---- Remediation ----

export interface RemediationPlan {
  id: string;
  incidentId: string;
  action: RemediationAction;
  targetService: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  evidence: string[];
  parameters: Record<string, unknown>;
  status: RemediationStatus;
  createdAt: string;
  executedAt?: string;
  verifiedAt?: string;
}

export type RemediationAction =
  'rollback' | 'restart' | 'scale' | 'disable_feature' | 'update_config' | 'manual';

export type RemediationStatus =
  | 'proposed'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'executed'
  | 'verified'
  | 'failed';

export type ApprovalState = 'pending' | 'approved' | 'rejected';

// ---- Evaluation ----

export interface EvaluationRun {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: 'running' | 'completed' | 'failed';
  detectionLatencyMs?: number;
  investigationLatencyMs?: number;
  totalToolCalls: number;
  incorrectToolCalls: number;
  rootCauseAccuracy?: number;
  remediationSuccess: boolean;
  recoveryVerified: boolean;
  totalAgentSteps: number;
  model?: string;
  tokenUsage?: number;
  failureReason?: string;
  startedAt: string;
  completedAt?: string;
}

// ---- Event System ----

export interface DomainEvent<T = unknown> {
  eventId: string;
  eventType: DomainEventType;
  timestamp: string;
  source: string;
  correlationId: string;
  causationId?: string;
  payload: T;
  schemaVersion: number;
}

export type DomainEventType =
  | 'RepositoryAnalysisStarted'
  | 'RepositoryAnalysisCompleted'
  | 'DeploymentCreated'
  | 'TelemetryReceived'
  | 'AlertTriggered'
  | 'IncidentCreated'
  | 'IncidentInvestigationStarted'
  | 'HypothesisUpdated'
  | 'RemediationProposed'
  | 'RemediationApproved'
  | 'RemediationExecuted'
  | 'IncidentResolved';

// ---- API Response Types ----

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ---- Dashboard ----

export interface DashboardStats {
  activeIncidents: number;
  healthyServices: number;
  degradedServices: number;
  agentRuns: number;
  resolvedToday: number;
  totalRepositories: number;
  recentActivity: ActivityEntry[];
}

export interface ActivityEntry {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: string;
  severity?: IncidentSeverity;
  serviceId?: string;
  serviceName?: string;
}

// ---- Billing Safety / Limits ----

export interface SystemLimits {
  maxRepositorySize: number; // 25 MB
  maxFilesPerAnalysis: number; // 500
  maxAgentSteps: number; // 25
  maxToolCallsPerRun: number; // 30
  maxTelemetryEventsPerMinute: number; // 500
  maxApiRequestsPerMinute: number; // 60
}

export const DEFAULT_LIMITS: SystemLimits = {
  maxRepositorySize: 25 * 1024 * 1024,
  maxFilesPerAnalysis: 500,
  maxAgentSteps: 25,
  maxToolCallsPerRun: 30,
  maxTelemetryEventsPerMinute: 500,
  maxApiRequestsPerMinute: 60,
};

// ---- Pipeline failure diagnosis ----

export * from './diagnosis';

export * from './blast-radius';
