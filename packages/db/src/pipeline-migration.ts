import type { Client } from '@libsql/client';

// ============================================================
// Delivery pipeline migration
// ------------------------------------------------------------
// Idempotent DDL for the tables declared in pipeline-schema.ts.
// Runs after the core migration so the repositories foreign key
// already exists.
// ============================================================

export async function migratePipelines(client: Client) {
  await addMissingColumns(client);
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'github-actions',
      file_path TEXT NOT NULL,
      success_rate REAL,
      p50_duration_ms INTEGER,
      last_run_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pipelines_repo ON pipelines(repository_id);

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      name TEXT NOT NULL,
      tier TEXT NOT NULL,
      region TEXT NOT NULL,
      region_label TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'aws',
      cluster TEXT NOT NULL,
      url TEXT,
      requires_approval INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unknown',
      current_version TEXT,
      current_commit_sha TEXT,
      deployed_at TEXT,
      traffic_pct REAL NOT NULL DEFAULT 100,
      error_rate REAL,
      latency_p95 REAL,
      requests_per_min REAL,
      replicas INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_environments_repo ON environments(repository_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_target
      ON environments(repository_id, name, region);

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
      run_number INTEGER NOT NULL,
      branch TEXT NOT NULL,
      target_tier TEXT NOT NULL DEFAULT 'none',
      commit_sha TEXT NOT NULL,
      commit_message TEXT NOT NULL,
      commit_author TEXT NOT NULL,
      trigger TEXT NOT NULL,
      pull_request_number INTEGER,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      queued_ms INTEGER,
      actor TEXT NOT NULL,
      failed_stage TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_repo ON pipeline_runs(repository_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_branch ON pipeline_runs(repository_id, branch);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_runs_number
      ON pipeline_runs(pipeline_id, run_number);

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
      stage_key TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      lane INTEGER NOT NULL DEFAULT 0,
      sequence INTEGER NOT NULL,
      depends_on TEXT NOT NULL DEFAULT '[]',
      environment_id TEXT REFERENCES environments(id),
      status TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      attempts INTEGER NOT NULL DEFAULT 1,
      exit_code INTEGER,
      runner_label TEXT,
      summary TEXT NOT NULL DEFAULT '{}',
      log TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_run ON pipeline_stages(run_id, sequence);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_key ON pipeline_stages(run_id, stage_key);

    CREATE TABLE IF NOT EXISTS pipeline_diagnoses (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
      stage_key TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      confidence REAL NOT NULL,
      blame_commit_sha TEXT,
      blame_file TEXT,
      blame_line INTEGER,
      blame_author TEXT,
      signals TEXT NOT NULL DEFAULT '[]',
      recommendation TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      similar_run_ids TEXT NOT NULL DEFAULT '[]',
      compute_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_diagnoses_run ON pipeline_diagnoses(run_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_diagnoses_category ON pipeline_diagnoses(category);

    CREATE TABLE IF NOT EXISTS environment_deployments (
      id TEXT PRIMARY KEY,
      environment_id TEXT NOT NULL REFERENCES environments(id),
      run_id TEXT REFERENCES pipeline_runs(id),
      version TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      previous_version TEXT,
      strategy TEXT NOT NULL DEFAULT 'rolling',
      status TEXT NOT NULL,
      traffic_pct REAL NOT NULL DEFAULT 100,
      health_check TEXT NOT NULL DEFAULT 'pending',
      actor TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      rolled_back_at TEXT,
      rollback_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_env_deployments_env
      ON environment_deployments(environment_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_env_deployments_run ON environment_deployments(run_id);

    CREATE TABLE IF NOT EXISTS flaky_tests (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      test_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      suite TEXT NOT NULL,
      run_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      flake_rate REAL NOT NULL DEFAULT 0,
      distinct_branches INTEGER NOT NULL DEFAULT 0,
      quarantined INTEGER NOT NULL DEFAULT 0,
      first_seen_at TEXT NOT NULL,
      last_failed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_flaky_tests_repo ON flaky_tests(repository_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_flaky_tests_name
      ON flaky_tests(repository_id, test_name);

    CREATE TABLE IF NOT EXISTS diagnosis_benchmark_cases (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      expected_category TEXT NOT NULL,
      expected_action TEXT NOT NULL,
      fixture TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_benchmark_cases_category
      ON diagnosis_benchmark_cases(expected_category);

    CREATE TABLE IF NOT EXISTS diagnosis_benchmark_runs (
      id TEXT PRIMARY KEY,
      engine_version TEXT NOT NULL,
      total_cases INTEGER NOT NULL,
      correct_category INTEGER NOT NULL,
      correct_action INTEGER NOT NULL,
      category_accuracy REAL NOT NULL,
      action_accuracy REAL NOT NULL,
      mean_confidence REAL NOT NULL,
      p50_compute_ms REAL NOT NULL,
      p95_compute_ms REAL NOT NULL,
      easy_accuracy REAL NOT NULL DEFAULT 0,
      hard_accuracy REAL NOT NULL DEFAULT 0,
      hard_cases INTEGER NOT NULL DEFAULT 0,
      per_category TEXT NOT NULL DEFAULT '{}',
      confusion TEXT NOT NULL DEFAULT '[]',
      ablation TEXT NOT NULL DEFAULT '[]',
      ran_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_benchmark_runs_ran_at ON diagnosis_benchmark_runs(ran_at);
  `);
}

/**
 * Columns added after the table first shipped. CREATE TABLE IF NOT
 * EXISTS will not add them to an existing database, so they are
 * applied separately and idempotently.
 */
async function addMissingColumns(client: Client) {
  const additions: [string, string, string][] = [
    ['diagnosis_benchmark_runs', 'easy_accuracy', 'REAL NOT NULL DEFAULT 0'],
    ['diagnosis_benchmark_runs', 'hard_accuracy', 'REAL NOT NULL DEFAULT 0'],
    ['diagnosis_benchmark_runs', 'hard_cases', 'INTEGER NOT NULL DEFAULT 0'],
    ['diagnosis_benchmark_runs', 'ablation', "TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [table, column, definition] of additions) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    if (info.rows.length === 0) continue; // table not created yet
    if (info.rows.some((row) => row.name === column)) continue;
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
