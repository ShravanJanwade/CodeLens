import { desc, eq } from '@codelens/db';
import { getDb, schema } from '@codelens/db';
import type { DomainEventType, RemediationAction } from '@codelens/shared';

const db = getDb();
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export interface ScenarioDefinition {
  id: string;
  name: string;
  service: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  rootCause: string;
  confidence: number;
  remediation: {
    action: RemediationAction;
    targetVersion?: string;
    description: string;
    risk: 'low' | 'medium' | 'high';
  };
  metrics: Array<{ name: string; baseline: number; failing: number; unit: string }>;
  errorMessage: string;
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'db-connection-exhaustion',
    name: 'Database connection exhaustion',
    service: 'payment-service',
    severity: 'high',
    title: 'Payment Service Degraded — Database Connections Exhausted',
    description: 'Connection pool utilization exceeded the safe threshold after payment-service v1.8.3.',
    rootCause:
      'payment-service v1.8.3 leaks database connections in retry handling. Pool utilization rose from 41% to 96%; 86% of errors report exhausted connections.',
    confidence: 0.91,
    remediation: {
      action: 'rollback',
      targetVersion: '1.8.2',
      description: 'Rollback payment-service from v1.8.3 to the known healthy v1.8.2 baseline.',
      risk: 'medium',
    },
    metrics: [
      { name: 'db_pool_utilization', baseline: 41, failing: 96, unit: '%' },
      { name: 'http_error_rate', baseline: 0.3, failing: 18.2, unit: '%' },
      { name: 'http_p99_latency', baseline: 180, failing: 4200, unit: 'ms' },
    ],
    errorMessage: 'Connection pool exhausted while acquiring payment repository connection',
  },
  {
    id: 'bad-deployment',
    name: 'Bad deployment regression',
    service: 'payment-service',
    severity: 'high',
    title: 'Payment Service Regression After Deployment',
    description: 'A new payment-service version elevated errors immediately after rollout.',
    rootCause:
      'payment-service v1.8.3 introduced a regression in the retry path. Errors began 47 seconds after deployment and the previous release has a healthy baseline.',
    confidence: 0.89,
    remediation: {
      action: 'rollback',
      targetVersion: '1.8.2',
      description: 'Rollback the newly deployed payment-service release.',
      risk: 'medium',
    },
    metrics: [
      { name: 'http_error_rate', baseline: 0.2, failing: 15.8, unit: '%' },
      { name: 'http_p99_latency', baseline: 160, failing: 3100, unit: 'ms' },
    ],
    errorMessage: 'Unhandled retry-state error introduced by deployment v1.8.3',
  },
  {
    id: 'memory-leak',
    name: 'Memory leak',
    service: 'order-service',
    severity: 'high',
    title: 'Order Service Memory Pressure',
    description: 'Resident memory grows continuously and requests are being terminated.',
    rootCause:
      'order-service retains completed order payloads in an in-memory retry cache, causing memory pressure and OOM restarts.',
    confidence: 0.87,
    remediation: {
      action: 'restart',
      description: 'Restart order-service to restore capacity while a code fix is prepared.',
      risk: 'low',
    },
    metrics: [
      { name: 'memory_utilization', baseline: 52, failing: 97, unit: '%' },
      { name: 'restart_count', baseline: 0, failing: 4, unit: 'count' },
    ],
    errorMessage: 'Process terminated: heap out of memory',
  },
  {
    id: 'cache-outage',
    name: 'Redis/cache outage',
    service: 'inventory-service',
    severity: 'medium',
    title: 'Inventory Cache Dependency Unavailable',
    description: 'Inventory reads are falling back to the database after cache connection failures.',
    rootCause:
      'The inventory cache endpoint is unavailable. Cache misses and connection failures force database fallback, increasing latency.',
    confidence: 0.9,
    remediation: {
      action: 'restart',
      description: 'Restart the inventory cache client and verify cache connectivity.',
      risk: 'low',
    },
    metrics: [
      { name: 'cache_error_rate', baseline: 0, failing: 100, unit: '%' },
      { name: 'http_p99_latency', baseline: 110, failing: 1450, unit: 'ms' },
    ],
    errorMessage: 'Cache connection refused: dependency unavailable',
  },
  {
    id: 'queue-consumer-lag',
    name: 'Queue consumer lag',
    service: 'notification-service',
    severity: 'medium',
    title: 'Notification Queue Consumer Lag',
    description: 'The notification queue is accumulating messages faster than consumers process them.',
    rootCause:
      'Notification workers have insufficient capacity for the current message rate, producing sustained queue lag without delivery errors.',
    confidence: 0.84,
    remediation: {
      action: 'scale',
      description: 'Scale notification-service consumers from one to three replicas.',
      risk: 'medium',
    },
    metrics: [
      { name: 'queue_lag', baseline: 12, failing: 1840, unit: 'messages' },
      { name: 'consumer_utilization', baseline: 44, failing: 99, unit: '%' },
    ],
    errorMessage: 'Queue lag threshold exceeded for notification consumer group',
  },
  {
    id: 'downstream-timeout',
    name: 'Downstream API timeout',
    service: 'api-gateway',
    severity: 'high',
    title: 'API Gateway Downstream Timeout Spike',
    description: 'Gateway requests are timing out while waiting for the payment dependency.',
    rootCause:
      'A downstream payment dependency is exceeding its timeout budget. Gateway traces show the delay is downstream, not in gateway routing.',
    confidence: 0.88,
    remediation: {
      action: 'disable_feature',
      description:
        'Disable the optional synchronous payment-enrichment feature flag to isolate the failing dependency.',
      risk: 'medium',
    },
    metrics: [
      { name: 'downstream_timeout_rate', baseline: 0.1, failing: 22.4, unit: '%' },
      { name: 'http_p99_latency', baseline: 130, failing: 5100, unit: 'ms' },
    ],
    errorMessage: 'Downstream payment-service request exceeded 5 second timeout budget',
  },
];

export interface WorkflowEvents {
  emit(type: DomainEventType, correlationId: string, payload: unknown): Promise<void>;
}

function findScenario(scenarioId: string) {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error('SCENARIO_NOT_FOUND');
  return scenario;
}

async function timeline(incidentId: string, type: string, title: string, description: string) {
  await db
    .insert(schema.incidentEvents)
    .values({ id: uid(), incidentId, timestamp: now(), type, title, description });
}

async function evidence(
  incidentId: string,
  type: 'metric' | 'log' | 'trace' | 'deployment' | 'config' | 'dependency',
  source: string,
  description: string,
  data: object,
  significance: 'supporting' | 'contradicting' | 'neutral' = 'supporting',
) {
  await db.insert(schema.incidentEvidence).values({
    id: uid(),
    incidentId,
    type,
    source,
    description,
    data: JSON.stringify(data),
    significance,
    timestamp: now(),
  });
}

async function recordAgentStep(
  runId: string,
  sequence: number,
  agentType: string,
  action: string,
  input: object,
  output: object,
  tool?: { name: string; type: 'read_only' | 'mutating' },
) {
  const stepId = uid();
  const startedAt = now();
  await db.insert(schema.agentSteps).values({
    id: stepId,
    agentRunId: runId,
    sequenceNumber: sequence,
    agentType,
    action,
    status: 'completed',
    input: JSON.stringify(input),
    output: JSON.stringify(output),
    startedAt,
    completedAt: now(),
    durationMs: 12,
  });
  if (tool)
    await db.insert(schema.toolCalls).values({
      id: uid(),
      agentStepId: stepId,
      toolName: tool.name,
      toolType: tool.type,
      input: JSON.stringify(input),
      output: JSON.stringify(output),
      status: 'completed',
      startedAt,
      completedAt: now(),
      durationMs: 12,
    });
  return stepId;
}

export function listScenarios() {
  return SCENARIOS.map(({ id, name, service, severity, description }) => ({
    id,
    name,
    service,
    severity,
    description,
  }));
}

export async function runScenario(scenarioId: string, events: WorkflowEvents) {
  const scenario = findScenario(scenarioId);
  const service = (
    await db.select().from(schema.services).where(eq(schema.services.name, scenario.service)).limit(1)
  )[0];
  if (!service) throw new Error(`SERVICE_NOT_FOUND:${scenario.service}`);
  const fingerprint = `scenario:${scenario.id}:${service.id}`;
  const activeAlert = (
    await db.select().from(schema.alerts).where(eq(schema.alerts.fingerprint, fingerprint))
  ).find((alert) => alert.status === 'firing');
  if (activeAlert?.incidentId) return { incidentId: activeAlert.incidentId, deduplicated: true };

  const runId = uid();
  const incidentId = `INC-${Math.floor(1000 + Math.random() * 9000)}`;
  await db.insert(schema.scenarioRuns).values({
    id: runId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    status: 'running',
    startedAt: now(),
  });
  for (const metric of scenario.metrics) {
    await db.insert(schema.telemetryEvents).values({
      id: uid(),
      serviceId: service.id,
      scenarioRunId: runId,
      type: 'metric',
      name: metric.name,
      value: metric.failing,
      labels: JSON.stringify({ unit: metric.unit, baseline: metric.baseline }),
      timestamp: now(),
    });
  }
  await db.insert(schema.telemetryEvents).values({
    id: uid(),
    serviceId: service.id,
    scenarioRunId: runId,
    type: 'log',
    name: 'application_error',
    level: 'error',
    message: scenario.errorMessage,
    labels: '{}',
    timestamp: now(),
  });
  await db.insert(schema.telemetryEvents).values({
    id: uid(),
    serviceId: service.id,
    scenarioRunId: runId,
    type: 'trace',
    name: 'failing_request',
    traceId: uid(),
    message: `Trace captures ${scenario.name}`,
    labels: '{}',
    timestamp: now(),
  });

  const incident = {
    id: incidentId,
    title: scenario.title,
    description: scenario.description,
    severity: scenario.severity,
    status: 'investigating' as const,
    serviceId: service.id,
    createdAt: now(),
    updatedAt: now(),
    detectedAt: now(),
    approvalState: 'pending' as const,
  };
  await db.insert(schema.incidents).values(incident);
  await db.insert(schema.alerts).values({
    id: uid(),
    fingerprint,
    serviceId: service.id,
    severity: scenario.severity,
    title: scenario.title,
    description: scenario.description,
    metric: scenario.metrics[0].name,
    threshold: scenario.metrics[0].baseline,
    currentValue: scenario.metrics[0].failing,
    firedAt: now(),
    incidentId,
    status: 'firing',
  });
  await db.update(schema.scenarioRuns).set({ incidentId }).where(eq(schema.scenarioRuns.id, runId));
  await timeline(
    incidentId,
    'alert_triggered',
    'Deterministic telemetry threshold exceeded',
    `${scenario.metrics[0].name} is ${scenario.metrics[0].failing}${scenario.metrics[0].unit}.`,
  );
  await timeline(
    incidentId,
    'incident_created',
    `Incident ${incidentId} created`,
    'Alert fingerprint correlation grouped the scenario telemetry into one incident.',
  );
  await events.emit('TelemetryReceived', incidentId, { scenarioRunId: runId, serviceId: service.id });
  await events.emit('AlertTriggered', incidentId, { incidentId, fingerprint });
  await events.emit('IncidentCreated', incidentId, { incidentId, scenarioId: scenario.id });

  for (const metric of scenario.metrics)
    await evidence(
      incidentId,
      'metric',
      metric.name,
      `${metric.name} changed from ${metric.baseline}${metric.unit} to ${metric.failing}${metric.unit}.`,
      metric,
    );
  await evidence(incidentId, 'log', `${scenario.service} logs`, scenario.errorMessage, { level: 'error' });
  await evidence(
    incidentId,
    'trace',
    `${scenario.service} trace`,
    `A trace ties the failing request to ${scenario.service}.`,
    { serviceId: service.id },
  );
  if (scenario.remediation.action === 'rollback')
    await evidence(
      incidentId,
      'deployment',
      'deployment history',
      'The active deployment is newer than the known healthy baseline.',
      { active: service.version, target: scenario.remediation.targetVersion },
    );

  const agentRunId = uid();
  await db.insert(schema.agentRuns).values({
    id: agentRunId,
    incidentId,
    status: 'running',
    startedAt: now(),
    totalSteps: 0,
    totalToolCalls: 0,
    model: 'deterministic-demo-workflow',
  });
  await db.update(schema.incidents).set({ agentRunId }).where(eq(schema.incidents.id, incidentId));
  await timeline(
    incidentId,
    'agent_started',
    'Investigation started',
    'The deterministic orchestrator began an evidence-only investigation.',
  );
  await events.emit('IncidentInvestigationStarted', incidentId, { incidentId, agentRunId });

  await recordAgentStep(
    agentRunId,
    1,
    'metrics',
    'Queried service metrics',
    { service: scenario.service, window: '5m' },
    { metrics: scenario.metrics },
    { name: 'get_service_metrics', type: 'read_only' },
  );
  await recordAgentStep(
    agentRunId,
    2,
    'logs',
    'Queried error logs',
    { service: scenario.service, level: 'error' },
    { matches: [scenario.errorMessage] },
    { name: 'query_logs', type: 'read_only' },
  );
  await recordAgentStep(
    agentRunId,
    3,
    'traces',
    'Inspected failing trace',
    { service: scenario.service },
    { trace: 'failing_request', dependency: scenario.service },
    { name: 'get_trace', type: 'read_only' },
  );
  await recordAgentStep(
    agentRunId,
    4,
    'deployment',
    'Retrieved deployments',
    { service: scenario.service },
    { activeVersion: service.version, targetVersion: scenario.remediation.targetVersion },
    { name: 'get_recent_deployments', type: 'read_only' },
  );
  await recordAgentStep(
    agentRunId,
    5,
    'dependency',
    'Retrieved service dependencies',
    { service: scenario.service },
    { dependencies: JSON.parse(service.dependencies) },
    { name: 'get_dependency_graph', type: 'read_only' },
  );

  const hypotheses = [
    {
      title: scenario.name,
      description: scenario.rootCause,
      status: 'confirmed' as const,
      confidence: scenario.confidence,
    },
    {
      title: 'Transient network degradation',
      description: 'No network evidence supports this explanation.',
      status: 'eliminated' as const,
      confidence: 0.09,
    },
    {
      title: 'Unrelated database outage',
      description: 'Evidence is localized to the deterministic scenario.',
      status: 'eliminated' as const,
      confidence: 0.06,
    },
  ];
  for (const hypothesis of hypotheses)
    await db
      .insert(schema.hypotheses)
      .values({ id: uid(), incidentId, agentRunId, ...hypothesis, createdAt: now(), updatedAt: now() });
  await recordAgentStep(
    agentRunId,
    6,
    'root-cause',
    'Ranked evidence-backed hypotheses',
    { incidentId },
    { rootCause: scenario.rootCause, confidence: scenario.confidence },
    undefined,
  );
  await timeline(
    incidentId,
    'root_cause_identified',
    'Root cause identified',
    `${scenario.rootCause} Confidence: ${Math.round(scenario.confidence * 100)}%.`,
  );
  await events.emit('HypothesisUpdated', incidentId, { incidentId, confirmed: scenario.name });

  const planId = uid();
  await db.insert(schema.remediationPlans).values({
    id: planId,
    incidentId,
    action: scenario.remediation.action,
    targetService: scenario.service,
    description: scenario.remediation.description,
    risk: scenario.remediation.risk,
    evidence: JSON.stringify(['Telemetry anomaly', 'Error log sample', 'Trace evidence']),
    parameters: JSON.stringify({ targetVersion: scenario.remediation.targetVersion }),
    status: 'awaiting_approval',
    createdAt: now(),
  });
  await recordAgentStep(
    agentRunId,
    7,
    'remediation',
    'Proposed approval-gated remediation',
    { incidentId },
    { action: scenario.remediation.action, risk: scenario.remediation.risk },
    undefined,
  );
  await db
    .update(schema.incidents)
    .set({
      status: 'awaiting_approval',
      rootCause: scenario.rootCause,
      confidence: scenario.confidence,
      updatedAt: now(),
    })
    .where(eq(schema.incidents.id, incidentId));
  await db
    .update(schema.agentRuns)
    .set({ totalSteps: 7, totalToolCalls: 5 })
    .where(eq(schema.agentRuns.id, agentRunId));
  await db
    .update(schema.scenarioRuns)
    .set({ status: 'awaiting_approval' })
    .where(eq(schema.scenarioRuns.id, runId));
  await timeline(
    incidentId,
    'remediation_proposed',
    'Human approval required',
    scenario.remediation.description,
  );
  await events.emit('RemediationProposed', incidentId, { incidentId, planId });
  return { incidentId, runId, deduplicated: false };
}

export async function resolveApprovedIncident(incidentId: string, events: WorkflowEvents) {
  const incident = (
    await db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId)).limit(1)
  )[0];
  if (!incident) throw new Error('INCIDENT_NOT_FOUND');
  const scenarioRun = (
    await db
      .select()
      .from(schema.scenarioRuns)
      .where(eq(schema.scenarioRuns.incidentId, incidentId))
      .orderBy(desc(schema.scenarioRuns.startedAt))
      .limit(1)
  )[0];
  if (!scenarioRun) throw new Error('SCENARIO_RUN_NOT_FOUND');
  const scenario = findScenario(scenarioRun.scenarioId);
  const plan = (
    await db
      .select()
      .from(schema.remediationPlans)
      .where(eq(schema.remediationPlans.incidentId, incidentId))
      .limit(1)
  )[0];
  if (!plan) throw new Error('PLAN_NOT_FOUND');
  const agentRun = incident.agentRunId
    ? (
        await db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, incident.agentRunId)).limit(1)
      )[0]
    : undefined;

  await db
    .update(schema.remediationPlans)
    .set({ status: 'executing' })
    .where(eq(schema.remediationPlans.id, plan.id));
  await timeline(incidentId, 'remediation_executed', `Executed ${plan.action}`, plan.description);
  if (agentRun)
    await recordAgentStep(
      agentRun.id,
      8,
      'remediation',
      `Executed ${plan.action}`,
      { service: plan.targetService, parameters: JSON.parse(plan.parameters) },
      { status: 'accepted' },
      {
        name: plan.action === 'rollback' ? 'rollback_deployment' : `${plan.action}_service`,
        type: 'mutating',
      },
    );
  await events.emit('RemediationExecuted', incidentId, { incidentId, planId: plan.id, action: plan.action });

  const service = (
    await db.select().from(schema.services).where(eq(schema.services.id, incident.serviceId)).limit(1)
  )[0];
  if (service)
    await db
      .update(schema.services)
      .set({ status: 'healthy', errorRate: 0.2, latencyP99: 180, updatedAt: now() })
      .where(eq(schema.services.id, service.id));
  await db
    .update(schema.alerts)
    .set({ status: 'resolved', resolvedAt: now() })
    .where(eq(schema.alerts.incidentId, incidentId));
  await db
    .update(schema.remediationPlans)
    .set({ status: 'verified', executedAt: now(), verifiedAt: now() })
    .where(eq(schema.remediationPlans.id, plan.id));
  await db
    .update(schema.incidents)
    .set({ status: 'resolved', approvalState: 'approved', resolvedAt: now(), updatedAt: now() })
    .where(eq(schema.incidents.id, incidentId));
  await db
    .update(schema.scenarioRuns)
    .set({ status: 'resolved', completedAt: now() })
    .where(eq(schema.scenarioRuns.id, scenarioRun.id));
  if (agentRun)
    await db
      .update(schema.agentRuns)
      .set({ status: 'completed', completedAt: now(), totalSteps: 9, totalToolCalls: 6 })
      .where(eq(schema.agentRuns.id, agentRun.id));
  await db.insert(schema.evaluationRuns).values({
    id: uid(),
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    status: 'completed',
    detectionLatencyMs: 2000,
    investigationLatencyMs: 7000,
    totalToolCalls: 6,
    incorrectToolCalls: 0,
    rootCauseAccuracy: scenario.confidence,
    remediationSuccess: true,
    recoveryVerified: true,
    totalAgentSteps: 9,
    model: 'deterministic-demo-workflow',
    startedAt: scenarioRun.startedAt,
    completedAt: now(),
  });
  await timeline(
    incidentId,
    'recovery_verified',
    'Recovery verified',
    'Error rate and latency returned to deterministic healthy baselines.',
  );
  await timeline(
    incidentId,
    'incident_resolved',
    `Incident ${incidentId} resolved`,
    'A Markdown postmortem is now available.',
  );
  await events.emit('IncidentResolved', incidentId, { incidentId, scenarioId: scenario.id });
  return { incidentId, status: 'resolved' as const };
}

export async function postmortem(incidentId: string) {
  const incident = (
    await db.select().from(schema.incidents).where(eq(schema.incidents.id, incidentId)).limit(1)
  )[0];
  if (!incident) throw new Error('INCIDENT_NOT_FOUND');
  const events = await db
    .select()
    .from(schema.incidentEvents)
    .where(eq(schema.incidentEvents.incidentId, incidentId))
    .orderBy(schema.incidentEvents.timestamp);
  const plan = (
    await db
      .select()
      .from(schema.remediationPlans)
      .where(eq(schema.remediationPlans.incidentId, incidentId))
      .limit(1)
  )[0];
  const lines = events.map(
    (event) => `- ${event.timestamp}: ${event.title}${event.description ? ` — ${event.description}` : ''}`,
  );
  return `# Postmortem: ${incident.title}\n\n## Summary\n${incident.description}\n\n## Root cause\n${incident.rootCause ?? 'Investigation incomplete.'}\n\n## Impact\nSeverity: ${incident.severity}. Service: ${incident.serviceId}.\n\n## Timeline\n${lines.join('\n')}\n\n## Remediation\n${plan?.description ?? 'No remediation plan recorded.'}\n\n## Preventive actions\n- Add a regression test for the detected failure mode.\n- Keep the alert fingerprint and scenario replay in the evaluation suite.\n- Review the evidence before expanding autonomous remediation.\n`;
}
