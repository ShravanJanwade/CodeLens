import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { repositories } from './schema';

export const rehearsalRuns = sqliteTable(
  'rehearsal_runs',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    idempotencyKey: text('idempotency_key').notNull(),
    baseline: text('baseline').notNull(),
    candidate: text('candidate').notNull(),
    correction: text('correction'),
    status: text('status').notNull().default('queued'),
    config: text('config').notNull(),
    owner: text('owner'),
    leaseUntil: integer('lease_until'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({ idempotency: uniqueIndex('rehearsal_idempotency').on(t.repositoryId, t.idempotencyKey) }),
);

export const rehearsalAttempts = sqliteTable(
  'rehearsal_attempts',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => rehearsalRuns.id),
    stage: text('stage').notNull(),
    attempt: integer('attempt').notNull(),
    status: text('status').notNull(),
    evidence: text('evidence'),
    error: text('error'),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
  },
  (t) => ({
    attemptKey: uniqueIndex('rehearsal_attempt_key').on(t.runId, t.stage, t.attempt),
    run: index('rehearsal_attempt_run').on(t.runId),
  }),
);

export const releaseFindings = sqliteTable(
  'release_findings',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => rehearsalRuns.id),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    revision: text('revision').notNull(),
    endpoint: text('endpoint').notNull(),
    signature: text('signature').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    evidenceIds: text('evidence_ids').notNull(),
    explanation: text('explanation').notNull(),
    sourcePath: text('source_path'),
    sourceLine: integer('source_line'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ findingKey: uniqueIndex('release_finding_key').on(t.runId, t.signature) }),
);
