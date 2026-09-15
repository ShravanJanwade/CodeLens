// ============================================================
// Database Seed Script
// ============================================================
// Populates database with realistic demo data for the portfolio.
// This data is what recruiters see on the /demo route.
// ============================================================

import { getDb } from './index';
import * as schema from './schema';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const now = () => new Date().toISOString();

async function seed() {
  console.log('🌱 Seeding database with demo data...');
  const db = getDb();

  const [existingDemo] = await db.select().from(schema.users).where(eq(schema.users.email, 'demo@codelens.dev')).limit(1);
  if (existingDemo) {
    console.log('ℹ️  Demo seed already exists; skipping.');
    return;
  }

  // ---- Demo User ----
  const userId = uuid();
  await db.insert(schema.users).values({
    id: userId,
    email: 'demo@codelens.dev',
    name: 'Demo User',
    passwordHash: await bcrypt.hash('demo-only-password-not-for-production', 12),
    role: 'admin',
    createdAt: now(),
    updatedAt: now(),
  });

  // ---- Sample Repository ----
  const repoId = uuid();
  await db.insert(schema.repositories).values({
    id: repoId,
    name: 'payment-platform',
    owner: 'acme-corp',
    fullName: 'acme-corp/payment-platform',
    url: 'https://github.com/acme-corp/payment-platform',
    defaultBranch: 'main',
    language: 'TypeScript',
    description: 'Core payment processing platform with Stripe integration',
    riskScore: 34,
    healthStatus: 'warning',
    userId,
    createdAt: now(),
    updatedAt: now(),
  });

  // ---- Services ----
  const serviceData = [
    { name: 'api-gateway', displayName: 'API Gateway', description: 'Edge routing and authentication', deps: ['user-service', 'order-service'], status: 'healthy' as const },
    { name: 'user-service', displayName: 'User Service', description: 'User authentication and profiles', deps: [], status: 'healthy' as const },
    { name: 'order-service', displayName: 'Order Service', description: 'Order processing and management', deps: ['payment-service', 'inventory-service'], status: 'healthy' as const },
    { name: 'payment-service', displayName: 'Payment Service', description: 'Payment processing and billing', deps: ['notification-service'], status: 'degraded' as const },
    { name: 'inventory-service', displayName: 'Inventory Service', description: 'Stock management and tracking', deps: [], status: 'healthy' as const },
    { name: 'notification-service', displayName: 'Notification Service', description: 'Email, SMS, and push notifications', deps: [], status: 'healthy' as const },
  ];

  const serviceIds: Record<string, string> = {};

  for (const svc of serviceData) {
    const id = uuid();
    serviceIds[svc.name] = id;
    await db.insert(schema.services).values({
      id,
      name: svc.name,
      displayName: svc.displayName,
      description: svc.description,
      status: svc.status,
      version: '1.8.3',
      healthEndpoint: `/health`,
      dependencies: JSON.stringify(svc.deps),
      metadata: JSON.stringify({ region: 'us-east-1', runtime: 'node:20' }),
      errorRate: svc.status === 'degraded' ? 18.2 : 0.3,
      latencyP50: svc.status === 'degraded' ? 890 : 58,
      latencyP99: svc.status === 'degraded' ? 4200 : 220,
      requestsPerMinute: 180,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  // ---- Deployments ----
  const paymentServiceId = serviceIds['payment-service'];
  
  await db.insert(schema.deployments).values({
    id: uuid(),
    serviceId: paymentServiceId,
    version: '1.8.2',
    status: 'superseded',
    deployedAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    deployedBy: 'CI/CD',
    commitSha: 'a1b2c3d4',
    changelog: 'Fix: connection pool timeout handling',
  });

  await db.insert(schema.deployments).values({
    id: uuid(),
    serviceId: paymentServiceId,
    version: '1.8.3',
    previousVersion: '1.8.2',
    status: 'active',
    deployedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    deployedBy: 'CI/CD',
    commitSha: 'e5f6g7h8',
    changelog: 'Feature: add retry logic for payment processing',
  });

  // ---- Demo Incident ----
  const incidentId = 'INC-1042';
  await db.insert(schema.incidents).values({
    id: incidentId,
    title: 'Payment Service Degraded — High Error Rate',
    description: 'Payment service error rate exceeded 15% threshold. Database connection pool utilization at 96%. Correlated with deployment v1.8.3.',
    severity: 'high',
    status: 'investigating',
    serviceId: paymentServiceId,
    createdAt: now(),
    updatedAt: now(),
    detectedAt: new Date(Date.now() - 180000).toISOString(), // 3 min ago
  });

  // ---- Incident Timeline ----
  const timelineEvents = [
    { type: 'deployment', title: 'Deployment v1.8.3', description: 'payment-service deployed version 1.8.3', offsetMs: -300000 },
    { type: 'alert_triggered', title: 'Latency spike detected', description: 'P99 latency increased from 180ms to 4200ms', offsetMs: -250000 },
    { type: 'alert_triggered', title: 'Error rate threshold exceeded', description: 'Error rate: 18.2% (threshold: 5%)', offsetMs: -240000 },
    { type: 'incident_created', title: 'Incident INC-1042 created', description: 'Auto-created from correlated alerts', offsetMs: -238000 },
    { type: 'agent_started', title: 'AI Investigation started', description: 'Orchestrator agent initiated', offsetMs: -236000 },
    { type: 'tool_called', title: 'Queried payment-service metrics', description: 'Retrieved error rate, latency, and throughput', offsetMs: -234000 },
    { type: 'tool_called', title: 'Queried error logs', description: 'Found 847 error entries in last 5 minutes', offsetMs: -232000 },
    { type: 'tool_called', title: 'Retrieved recent deployments', description: 'Found deployment v1.8.3 at T-5min', offsetMs: -230000 },
  ];

  for (const event of timelineEvents) {
    await db.insert(schema.incidentEvents).values({
      id: uuid(),
      incidentId,
      timestamp: new Date(Date.now() + event.offsetMs).toISOString(),
      type: event.type,
      title: event.title,
      description: event.description,
    });
  }

  // ---- Demo Agent Run ----
  const agentRunId = uuid();
  await db.insert(schema.agentRuns).values({
    id: agentRunId,
    incidentId,
    status: 'running',
    startedAt: new Date(Date.now() - 236000).toISOString(),
    totalSteps: 8,
    totalToolCalls: 6,
    model: 'qwen2.5:7b',
  });

  // Update incident with agent run
  await db.update(schema.incidents)
    .set({ agentRunId })
    .where(eq(schema.incidents.id, incidentId));

  // ---- Hypotheses ----
  const hypothesesData = [
    { title: 'Database connection pool exhaustion', description: 'v1.8.3 may have introduced a connection leak causing pool exhaustion', status: 'investigating' as const, confidence: 0.87 },
    { title: 'Downstream API timeout', description: 'External payment gateway may be experiencing delays', status: 'eliminated' as const, confidence: 0.12 },
    { title: 'Memory pressure', description: 'Service may be under memory pressure causing GC pauses', status: 'eliminated' as const, confidence: 0.08 },
    { title: 'Network degradation', description: 'Network issues between services', status: 'eliminated' as const, confidence: 0.05 },
  ];

  for (const h of hypothesesData) {
    await db.insert(schema.hypotheses).values({
      id: uuid(),
      incidentId,
      agentRunId,
      title: h.title,
      description: h.description,
      status: h.status,
      confidence: h.confidence,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  console.log('✅ Seed complete');
  console.log(`   - 1 user`);
  console.log(`   - 1 repository`);
  console.log(`   - ${serviceData.length} services`);
  console.log(`   - 2 deployments`);
  console.log(`   - 1 incident with ${timelineEvents.length} timeline events`);
  console.log(`   - 1 agent run`);
  console.log(`   - ${hypothesesData.length} hypotheses`);
}

seed().catch(console.error);
