// ============================================================
// CodeLens — Delivery pipeline schema
// ============================================================
// Models a real CI/CD topology: a run is a DAG of stages, deploy
// stages land in an (environment, region) target, and a failed run
// carries a diagnosis produced by the root-cause classifier.
//
// Kept in its own file because the pipeline domain is the product
// centre of gravity and evolves independently of the legacy
// incident/service tables in schema.ts.
// ============================================================

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { repositories } from './schema';

/** A workflow definition discovered in the repository. */
export const pipelines = sqliteTable(
  'pipelines',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    name: text('name').notNull(),
    provider: text('provider').notNull().default('github-actions'),
    filePath: text('file_path').notNull(),
    // Denormalised health so the pipeline list renders in one query.
    successRate: real('success_rate'),
    p50DurationMs: integer('p50_duration_ms'),
    lastRunAt: text('last_run_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    repo: index('idx_pipelines_repo').on(t.repositoryId),
  }),
);

/**
 * A deploy target. Production spans several regions, so the unique
 * key is (repository, name, region) rather than name alone — this is
 * what lets the UI answer "which region is broken?".
 */
export const environments = sqliteTable(
  'environments',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    name: text('name').notNull(),
    tier: text('tier', { enum: ['development', 'staging', 'production'] }).notNull(),
    region: text('region').notNull(),
    regionLabel: text('region_label').notNull(),
    provider: text('provider').notNull().default('aws'),
    cluster: text('cluster').notNull(),
    url: text('url'),
    requiresApproval: integer('requires_approval', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['healthy', 'degraded', 'down', 'deploying', 'unknown'] })
      .notNull()
      .default('unknown'),
    currentVersion: text('current_version'),
    currentCommitSha: text('current_commit_sha'),
    deployedAt: text('deployed_at'),
    trafficPct: real('traffic_pct').notNull().default(100),
    // Live signals shown on the region matrix.
    errorRate: real('error_rate'),
    latencyP95: real('latency_p95'),
    requestsPerMin: real('requests_per_min'),
    replicas: integer('replicas'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    repo: index('idx_environments_repo').on(t.repositoryId),
    target: uniqueIndex('idx_environments_target').on(t.repositoryId, t.name, t.region),
  }),
);

/** One execution of a pipeline against one commit. */
export const pipelineRuns = sqliteTable(
  'pipeline_runs',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => pipelines.id),
    runNumber: integer('run_number').notNull(),
    branch: text('branch').notNull(),
    // 'production' | 'staging' | 'development' | 'none' — the furthest
    // tier this run was allowed to reach.
    targetTier: text('target_tier').notNull().default('none'),
    commitSha: text('commit_sha').notNull(),
    commitMessage: text('commit_message').notNull(),
    commitAuthor: text('commit_author').notNull(),
    trigger: text('trigger', {
      enum: ['push', 'pull_request', 'manual', 'schedule', 'revert', 'rollback'],
    }).notNull(),
    pullRequestNumber: integer('pull_request_number'),
    status: text('status', {
      enum: ['queued', 'running', 'success', 'failed', 'cancelled', 'blocked'],
    }).notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    durationMs: integer('duration_ms'),
    queuedMs: integer('queued_ms'),
    actor: text('actor').notNull(),
    // Set when status = failed; points at the first stage that broke.
    failedStage: text('failed_stage'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    repo: index('idx_pipeline_runs_repo').on(t.repositoryId, t.startedAt),
    branch: index('idx_pipeline_runs_branch').on(t.repositoryId, t.branch),
    status: index('idx_pipeline_runs_status').on(t.status),
    number: uniqueIndex('idx_pipeline_runs_number').on(t.pipelineId, t.runNumber),
  }),
);

/**
 * A node in the run DAG. `dependsOn` holds a JSON array of sibling
 * stage keys, which is what the flow view lays out as edges.
 */
export const pipelineStages = sqliteTable(
  'pipeline_stages',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => pipelineRuns.id),
    stageKey: text('stage_key').notNull(),
    name: text('name').notNull(),
    kind: text('kind', {
      enum: ['checkout', 'build', 'test', 'scan', 'package', 'approval', 'deploy', 'verify', 'rollback'],
    }).notNull(),
    lane: integer('lane').notNull().default(0),
    sequence: integer('sequence').notNull(),
    dependsOn: text('depends_on').notNull().default('[]'),
    environmentId: text('environment_id').references(() => environments.id),
    status: text('status', {
      enum: ['pending', 'queued', 'running', 'success', 'failed', 'skipped', 'cancelled', 'blocked'],
    }).notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    durationMs: integer('duration_ms'),
    attempts: integer('attempts').notNull().default(1),
    exitCode: integer('exit_code'),
    runnerLabel: text('runner_label'),
    // JSON: stage-specific counters (tests passed/failed, image size,
    // vulnerabilities, replicas updated...).
    summary: text('summary').notNull().default('{}'),
    log: text('log').notNull().default(''),
  },
  (t) => ({
    run: index('idx_pipeline_stages_run').on(t.runId, t.sequence),
    key: uniqueIndex('idx_pipeline_stages_key').on(t.runId, t.stageKey),
  }),
);

/**
 * Output of the root-cause classifier for a failed run. One row per
 * run; `signals` records exactly which evidence fired so the UI can
 * show the derivation instead of an unexplained verdict.
 */
export const pipelineDiagnoses = sqliteTable(
  'pipeline_diagnoses',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => pipelineRuns.id),
    stageKey: text('stage_key').notNull(),
    category: text('category', {
      enum: [
        'flaky-test',
        'code-regression',
        'infra-capacity',
        'dependency-drift',
        'config-drift',
        'secret-expiry',
        'migration-failure',
        'timeout',
        'unknown',
      ],
    }).notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    confidence: real('confidence').notNull(),
    // Where the classifier believes the fault was introduced.
    blameCommitSha: text('blame_commit_sha'),
    blameFile: text('blame_file'),
    blameLine: integer('blame_line'),
    blameAuthor: text('blame_author'),
    signals: text('signals').notNull().default('[]'),
    recommendation: text('recommendation').notNull(),
    recommendedAction: text('recommended_action', {
      enum: [
        'retry',
        'revert',
        'quarantine-test',
        'scale-runner',
        'pin-dependency',
        'rotate-secret',
        'fix-forward',
        'investigate',
      ],
    }).notNull(),
    similarRunIds: text('similar_run_ids').notNull().default('[]'),
    computeMs: integer('compute_ms').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    run: uniqueIndex('idx_pipeline_diagnoses_run').on(t.runId),
    category: index('idx_pipeline_diagnoses_category').on(t.category),
  }),
);

/** A deployment landed by a deploy stage into one region. */
export const environmentDeployments = sqliteTable(
  'environment_deployments',
  {
    id: text('id').primaryKey(),
    environmentId: text('environment_id')
      .notNull()
      .references(() => environments.id),
    runId: text('run_id').references(() => pipelineRuns.id),
    version: text('version').notNull(),
    commitSha: text('commit_sha').notNull(),
    previousVersion: text('previous_version'),
    strategy: text('strategy', { enum: ['rolling', 'blue-green', 'canary', 'recreate'] })
      .notNull()
      .default('rolling'),
    status: text('status', {
      enum: ['deploying', 'live', 'canary', 'rolled-back', 'superseded', 'failed'],
    }).notNull(),
    trafficPct: real('traffic_pct').notNull().default(100),
    healthCheck: text('health_check', { enum: ['passing', 'failing', 'pending'] })
      .notNull()
      .default('pending'),
    actor: text('actor').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    rolledBackAt: text('rolled_back_at'),
    rollbackReason: text('rollback_reason'),
  },
  (t) => ({
    env: index('idx_env_deployments_env').on(t.environmentId, t.startedAt),
    run: index('idx_env_deployments_run').on(t.runId),
  }),
);

/**
 * Per-test flake history. The classifier reads this to separate a
 * genuinely new failure from a test that has been failing
 * intermittently for weeks.
 */
export const flakyTests = sqliteTable(
  'flaky_tests',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    testName: text('test_name').notNull(),
    filePath: text('file_path').notNull(),
    suite: text('suite').notNull(),
    runCount: integer('run_count').notNull().default(0),
    failCount: integer('fail_count').notNull().default(0),
    flakeRate: real('flake_rate').notNull().default(0),
    // Distinguishes "fails on every branch" (flaky) from "fails only
    // on this branch" (real regression).
    distinctBranches: integer('distinct_branches').notNull().default(0),
    quarantined: integer('quarantined', { mode: 'boolean' }).notNull().default(false),
    firstSeenAt: text('first_seen_at').notNull(),
    lastFailedAt: text('last_failed_at'),
  },
  (t) => ({
    repo: index('idx_flaky_tests_repo').on(t.repositoryId),
    name: uniqueIndex('idx_flaky_tests_name').on(t.repositoryId, t.testName),
  }),
);

/**
 * Labelled failures used to measure the classifier. Kept in the
 * database (not a fixture file) so the benchmark page reports numbers
 * produced by an actual scored run rather than hardcoded copy.
 */
export const diagnosisBenchmarkCases = sqliteTable(
  'diagnosis_benchmark_cases',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    expectedCategory: text('expected_category').notNull(),
    expectedAction: text('expected_action').notNull(),
    // JSON blob replayed through the classifier at scoring time.
    fixture: text('fixture').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ category: index('idx_benchmark_cases_category').on(t.expectedCategory) }),
);

/** One scored pass of the whole benchmark suite. */
export const diagnosisBenchmarkRuns = sqliteTable(
  'diagnosis_benchmark_runs',
  {
    id: text('id').primaryKey(),
    engineVersion: text('engine_version').notNull(),
    totalCases: integer('total_cases').notNull(),
    correctCategory: integer('correct_category').notNull(),
    correctAction: integer('correct_action').notNull(),
    categoryAccuracy: real('category_accuracy').notNull(),
    actionAccuracy: real('action_accuracy').notNull(),
    meanConfidence: real('mean_confidence').notNull(),
    p50ComputeMs: real('p50_compute_ms').notNull(),
    p95ComputeMs: real('p95_compute_ms').notNull(),
    // Accuracy split by corpus difficulty. An aggregate number that
    // hides which half it came from is not worth reporting.
    easyAccuracy: real('easy_accuracy').notNull().default(0),
    hardAccuracy: real('hard_accuracy').notNull().default(0),
    hardCases: integer('hard_cases').notNull().default(0),
    // JSON: per-category precision/recall, the confusion matrix, and
    // the ablation table.
    perCategory: text('per_category').notNull().default('{}'),
    confusion: text('confusion').notNull().default('[]'),
    ablation: text('ablation').notNull().default('[]'),
    ranAt: text('ran_at').notNull(),
  },
  (t) => ({ ranAt: index('idx_benchmark_runs_ran_at').on(t.ranAt) }),
);
