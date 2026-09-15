// ============================================================
// CodeLens Platform — Database Schema
// ============================================================
// Drizzle ORM schema for SQLite (local) / D1 (Cloudflare).
// Indexes are intentional — see comments for rationale.
// ============================================================

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ---- Users ----

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user', 'viewer'] }).notNull().default('user'),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ---- Repositories ----

export const repositories = sqliteTable('repositories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  owner: text('owner').notNull(),
  fullName: text('full_name').notNull(),
  url: text('url'),
  defaultBranch: text('default_branch').notNull().default('main'),
  language: text('language'),
  description: text('description'),
  lastAnalyzedAt: text('last_analyzed_at'),
  riskScore: real('risk_score'),
  healthStatus: text('health_status', { enum: ['healthy', 'warning', 'critical', 'unknown'] }).notNull().default('unknown'),
  userId: text('user_id').references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  idx_repositories_user: index('idx_repositories_user').on(table.userId),
  idx_repositories_full_name: index('idx_repositories_full_name').on(table.fullName),
}));

// ---- Code Analysis Runs ----

export const codeAnalysisRuns = sqliteTable('code_analysis_runs', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default('pending'),
  branch: text('branch').notNull(),
  commitSha: text('commit_sha'),
  coverage: text('coverage').notNull().default('{}'),
  progress: real('progress').notNull().default(0),
  filesProcessed: integer('files_processed').notNull().default(0),
  totalFiles: integer('total_files').notNull().default(0),
  symbolsIndexed: integer('symbols_indexed').notNull().default(0),
  findingsCount: integer('findings_count').notNull().default(0),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  error: text('error'),
}, (table) => ({
  idx_analysis_runs_repo: index('idx_analysis_runs_repo').on(table.repositoryId),
  idx_analysis_runs_status: index('idx_analysis_runs_status').on(table.status),
}));

// ---- Code Findings ----

export const codeFindings = sqliteTable('code_findings', {
  id: text('id').primaryKey(),
  analysisRunId: text('analysis_run_id').notNull().references(() => codeAnalysisRuns.id),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  filePath: text('file_path').notNull(),
  line: integer('line').notNull(),
  endLine: integer('end_line'),
  severity: text('severity', { enum: ['info', 'low', 'medium', 'high', 'critical'] }).notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  suggestion: text('suggestion'),
  confidence: real('confidence').notNull(),
  source: text('source', { enum: ['static-analysis', 'ai', 'pattern-match'] }).notNull(),
}, (table) => ({
  idx_findings_repo: index('idx_findings_repo').on(table.repositoryId),
  idx_findings_severity: index('idx_findings_severity').on(table.severity),
}));

// ---- Repository knowledge graph ----

export const repositoryFiles = sqliteTable('repository_files', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  analysisRunId: text('analysis_run_id').notNull().references(() => codeAnalysisRuns.id),
  path: text('path').notNull(),
  language: text('language').notNull(),
  content: text('content').notNull(),
  summary: text('summary').notNull(),
  complexity: integer('complexity').notNull().default(1),
  sizeBytes: integer('size_bytes').notNull(),
  imports: text('imports').notNull().default('[]'),
  symbols: text('symbols').notNull().default('[]'),
  contentHash: text('content_hash'),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  idx_repository_files_repo: index('idx_repository_files_repo').on(table.repositoryId),
  idx_repository_files_path: index('idx_repository_files_path').on(table.repositoryId, table.path),
}));

export const repositoryEdges = sqliteTable('repository_edges', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  analysisRunId: text('analysis_run_id').notNull().references(() => codeAnalysisRuns.id),
  sourcePath: text('source_path').notNull(),
  targetPath: text('target_path').notNull(),
  kind: text('kind').notNull().default('import'),
}, (table) => ({ idx_repository_edges_repo: index('idx_repository_edges_repo').on(table.repositoryId) }));

export const githubWebhookEvents = sqliteTable('github_webhook_events', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').references(() => repositories.id),
  deliveryId: text('delivery_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  action: text('action'),
  payload: text('payload').notNull(),
  verificationStatus: text('verification_status').notNull(),
  receivedAt: text('received_at').notNull(),
}, (table) => ({ idx_github_webhook_events_repo: index('idx_github_webhook_events_repo').on(table.repositoryId) }));

// ---- Services (AegisOps) ----

export const services = sqliteTable('services', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['healthy', 'degraded', 'down', 'unknown'] }).notNull().default('unknown'),
  version: text('version').notNull().default('1.0.0'),
  healthEndpoint: text('health_endpoint').notNull(),
  dependencies: text('dependencies').notNull().default('[]'), // JSON array
  metadata: text('metadata').notNull().default('{}'), // JSON object
  lastHealthCheck: text('last_health_check'),
  errorRate: real('error_rate'),
  latencyP50: real('latency_p50'),
  latencyP99: real('latency_p99'),
  requestsPerMinute: real('requests_per_minute'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  idx_services_status: index('idx_services_status').on(table.status),
}));

// ---- Deployments ----

export const deployments = sqliteTable('deployments', {
  id: text('id').primaryKey(),
  serviceId: text('service_id').notNull().references(() => services.id),
  version: text('version').notNull(),
  previousVersion: text('previous_version'),
  status: text('status', { enum: ['active', 'rolling-back', 'rolled-back', 'superseded'] }).notNull(),
  deployedAt: text('deployed_at').notNull(),
  deployedBy: text('deployed_by'),
  commitSha: text('commit_sha'),
  changelog: text('changelog'),
}, (table) => ({
  // Fast lookup: "what's deployed on this service?" and "recent deployments"
  idx_deployments_service: index('idx_deployments_service').on(table.serviceId),
  idx_deployments_deployed_at: index('idx_deployments_deployed_at').on(table.deployedAt),
}));

// ---- Incidents ----

export const incidents = sqliteTable('incidents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  severity: text('severity', { enum: ['critical', 'high', 'medium', 'low'] }).notNull(),
  status: text('status', { enum: ['open', 'investigating', 'mitigating', 'awaiting_approval', 'resolved', 'closed'] }).notNull().default('open'),
  serviceId: text('service_id').notNull().references(() => services.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  detectedAt: text('detected_at').notNull(),
  resolvedAt: text('resolved_at'),
  rootCause: text('root_cause'),
  confidence: real('confidence'),
  agentRunId: text('agent_run_id'),
  approvalState: text('approval_state', { enum: ['pending', 'approved', 'rejected'] }),
}, (table) => ({
  // Most common queries: list by status, filter by service, sort by creation time
  idx_incidents_status: index('idx_incidents_status').on(table.status),
  idx_incidents_service: index('idx_incidents_service').on(table.serviceId),
  idx_incidents_created_at: index('idx_incidents_created_at').on(table.createdAt),
  idx_incidents_severity: index('idx_incidents_severity').on(table.severity),
}));

// ---- Incident Events (Timeline) ----

export const incidentEvents = sqliteTable('incident_events', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').notNull().references(() => incidents.id),
  timestamp: text('timestamp').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  metadata: text('metadata').default('{}'), // JSON
}, (table) => ({
  // Timeline queries always filter by incident and sort by time
  idx_incident_events_incident: index('idx_incident_events_incident').on(table.incidentId),
  idx_incident_events_timestamp: index('idx_incident_events_timestamp').on(table.timestamp),
}));

// ---- Alerts ----

export const alerts = sqliteTable('alerts', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  serviceId: text('service_id').notNull().references(() => services.id),
  severity: text('severity', { enum: ['critical', 'high', 'medium', 'low'] }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  metric: text('metric'),
  threshold: real('threshold'),
  currentValue: real('current_value'),
  firedAt: text('fired_at').notNull(),
  resolvedAt: text('resolved_at'),
  incidentId: text('incident_id').references(() => incidents.id),
  status: text('status', { enum: ['firing', 'resolved', 'suppressed'] }).notNull().default('firing'),
}, (table) => ({
  // Deduplication: fingerprint lookup must be fast
  idx_alerts_fingerprint: index('idx_alerts_fingerprint').on(table.fingerprint),
  idx_alerts_service: index('idx_alerts_service').on(table.serviceId),
  idx_alerts_status: index('idx_alerts_status').on(table.status),
}));

// ---- Agent Runs ----

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').notNull().references(() => incidents.id),
  status: text('status', { enum: ['running', 'completed', 'failed', 'cancelled'] }).notNull().default('running'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  totalSteps: integer('total_steps').notNull().default(0),
  totalToolCalls: integer('total_tool_calls').notNull().default(0),
  model: text('model'),
  tokenUsage: integer('token_usage'),
  error: text('error'),
}, (table) => ({
  idx_agent_runs_incident: index('idx_agent_runs_incident').on(table.incidentId),
  idx_agent_runs_status: index('idx_agent_runs_status').on(table.status),
}));

// ---- Agent Steps ----

export const agentSteps = sqliteTable('agent_steps', {
  id: text('id').primaryKey(),
  agentRunId: text('agent_run_id').notNull().references(() => agentRuns.id),
  sequenceNumber: integer('sequence_number').notNull(),
  agentType: text('agent_type').notNull(),
  action: text('action').notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).notNull().default('pending'),
  input: text('input'),  // JSON
  output: text('output'), // JSON
  reasoning: text('reasoning'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
}, (table) => ({
  idx_agent_steps_run: index('idx_agent_steps_run').on(table.agentRunId),
}));

// ---- Tool Calls ----

export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey(),
  agentStepId: text('agent_step_id').notNull().references(() => agentSteps.id),
  toolName: text('tool_name').notNull(),
  toolType: text('tool_type', { enum: ['read_only', 'mutating'] }).notNull(),
  input: text('input').notNull(), // JSON
  output: text('output'), // JSON
  status: text('status', { enum: ['pending', 'executing', 'completed', 'failed'] }).notNull().default('pending'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
  error: text('error'),
}, (table) => ({
  idx_tool_calls_step: index('idx_tool_calls_step').on(table.agentStepId),
  idx_tool_calls_name: index('idx_tool_calls_name').on(table.toolName),
}));

// ---- Hypotheses ----

export const hypotheses = sqliteTable('hypotheses', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').notNull().references(() => incidents.id),
  agentRunId: text('agent_run_id').notNull().references(() => agentRuns.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status', { enum: ['active', 'confirmed', 'eliminated', 'investigating'] }).notNull().default('active'),
  confidence: real('confidence').notNull().default(0),
  supportingEvidence: text('supporting_evidence').notNull().default('[]'), // JSON
  contradictingEvidence: text('contradicting_evidence').notNull().default('[]'), // JSON
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  idx_hypotheses_incident: index('idx_hypotheses_incident').on(table.incidentId),
}));

// ---- Remediation Plans ----

export const remediationPlans = sqliteTable('remediation_plans', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').notNull().references(() => incidents.id),
  action: text('action', { enum: ['rollback', 'restart', 'scale', 'disable_feature', 'update_config', 'manual'] }).notNull(),
  targetService: text('target_service').notNull(),
  description: text('description').notNull(),
  risk: text('risk', { enum: ['low', 'medium', 'high'] }).notNull(),
  evidence: text('evidence').notNull().default('[]'), // JSON
  parameters: text('parameters').notNull().default('{}'), // JSON
  status: text('status', { enum: ['proposed', 'awaiting_approval', 'approved', 'rejected', 'executing', 'executed', 'verified', 'failed'] }).notNull().default('proposed'),
  createdAt: text('created_at').notNull(),
  executedAt: text('executed_at'),
  verifiedAt: text('verified_at'),
}, (table) => ({
  idx_remediation_incident: index('idx_remediation_incident').on(table.incidentId),
}));

// ---- Evaluation Runs ----

export const evaluationRuns = sqliteTable('evaluation_runs', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  scenarioName: text('scenario_name').notNull(),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull().default('running'),
  detectionLatencyMs: integer('detection_latency_ms'),
  investigationLatencyMs: integer('investigation_latency_ms'),
  totalToolCalls: integer('total_tool_calls').notNull().default(0),
  incorrectToolCalls: integer('incorrect_tool_calls').notNull().default(0),
  rootCauseAccuracy: real('root_cause_accuracy'),
  remediationSuccess: integer('remediation_success', { mode: 'boolean' }).notNull().default(false),
  recoveryVerified: integer('recovery_verified', { mode: 'boolean' }).notNull().default(false),
  totalAgentSteps: integer('total_agent_steps').notNull().default(0),
  model: text('model'),
  tokenUsage: integer('token_usage'),
  failureReason: text('failure_reason'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
}, (table) => ({
  idx_eval_runs_scenario: index('idx_eval_runs_scenario').on(table.scenarioId),
}));

// ---- Processed Events (Idempotency) ----

export const processedEvents = sqliteTable('processed_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: text('processed_at').notNull(),
});

// ---- Deterministic simulator / evidence store ----

export const scenarioRuns = sqliteTable('scenario_runs', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  scenarioName: text('scenario_name').notNull(),
  status: text('status', { enum: ['running', 'awaiting_approval', 'resolved', 'failed'] }).notNull(),
  incidentId: text('incident_id').references(() => incidents.id),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
}, (table) => ({idx_scenario_runs_scenario: index('idx_scenario_runs_scenario').on(table.scenarioId)}));

export const telemetryEvents = sqliteTable('telemetry_events', {
  id: text('id').primaryKey(),
  serviceId: text('service_id').notNull().references(() => services.id),
  scenarioRunId: text('scenario_run_id').references(() => scenarioRuns.id),
  type: text('type', { enum: ['metric', 'log', 'trace', 'event'] }).notNull(),
  name: text('name').notNull(),
  value: real('value'),
  level: text('level'),
  message: text('message'),
  traceId: text('trace_id'),
  labels: text('labels').notNull().default('{}'),
  timestamp: text('timestamp').notNull(),
}, (table) => ({
  idx_telemetry_service_time: index('idx_telemetry_service_time').on(table.serviceId, table.timestamp),
  idx_telemetry_scenario: index('idx_telemetry_scenario').on(table.scenarioRunId),
}));

export const incidentEvidence = sqliteTable('incident_evidence', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').notNull().references(() => incidents.id),
  type: text('type', { enum: ['metric', 'log', 'trace', 'deployment', 'config', 'dependency'] }).notNull(),
  source: text('source').notNull(),
  description: text('description').notNull(),
  data: text('data').notNull().default('{}'),
  significance: text('significance', { enum: ['supporting', 'contradicting', 'neutral'] }).notNull(),
  timestamp: text('timestamp').notNull(),
}, (table) => ({idx_evidence_incident: index('idx_evidence_incident').on(table.incidentId)}));
