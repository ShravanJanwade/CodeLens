// ============================================================
// Database Migration Script
// ============================================================
// Creates all tables from the Drizzle schema.
// Safe to run multiple times (uses IF NOT EXISTS).
// ============================================================

import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'node:path';
import { databasePath } from './database-path';
import { migrateReleases } from './release-migration';
import { migratePipelines } from './pipeline-migration';

const DB_PATH = databasePath;

async function migrate() {
  console.log(`📦 Running migrations on: ${DB_PATH}`);

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const client = createClient({ url: `file:${DB_PATH}` });

  // Enable WAL mode for better concurrent read performance
  await client.execute('PRAGMA journal_mode = WAL;');
  // Enable foreign keys
  await client.execute('PRAGMA foreign_keys = ON;');

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      full_name TEXT NOT NULL,
      url TEXT,
      default_branch TEXT NOT NULL DEFAULT 'main',
      language TEXT,
      description TEXT,
      last_analyzed_at TEXT,
      risk_score REAL,
      health_status TEXT NOT NULL DEFAULT 'unknown',
      user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_repositories_user ON repositories(user_id);
    CREATE INDEX IF NOT EXISTS idx_repositories_full_name ON repositories(full_name);

    CREATE TABLE IF NOT EXISTS code_analysis_runs (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      status TEXT NOT NULL DEFAULT 'pending',
      branch TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      files_processed INTEGER NOT NULL DEFAULT 0,
      total_files INTEGER NOT NULL DEFAULT 0,
      symbols_indexed INTEGER NOT NULL DEFAULT 0,
      findings_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_repo ON code_analysis_runs(repository_id);
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON code_analysis_runs(status);

    CREATE TABLE IF NOT EXISTS code_findings (
      id TEXT PRIMARY KEY,
      analysis_run_id TEXT NOT NULL REFERENCES code_analysis_runs(id),
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      file_path TEXT NOT NULL,
      line INTEGER NOT NULL,
      end_line INTEGER,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      suggestion TEXT,
      confidence REAL NOT NULL,
      source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_findings_repo ON code_findings(repository_id);
    CREATE INDEX IF NOT EXISTS idx_findings_severity ON code_findings(severity);

    CREATE TABLE IF NOT EXISTS repository_files (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      analysis_run_id TEXT NOT NULL REFERENCES code_analysis_runs(id),
      path TEXT NOT NULL,
      language TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      complexity INTEGER NOT NULL DEFAULT 1,
      size_bytes INTEGER NOT NULL,
      imports TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_repository_files_repo ON repository_files(repository_id);
    CREATE INDEX IF NOT EXISTS idx_repository_files_path ON repository_files(repository_id, path);

    CREATE TABLE IF NOT EXISTS repository_edges (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repositories(id),
      analysis_run_id TEXT NOT NULL REFERENCES code_analysis_runs(id),
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'import'
    );
    CREATE INDEX IF NOT EXISTS idx_repository_edges_repo ON repository_edges(repository_id);

    CREATE TABLE IF NOT EXISTS github_webhook_events (
      id TEXT PRIMARY KEY,
      repository_id TEXT REFERENCES repositories(id),
      delivery_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      action TEXT,
      payload TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_github_webhook_events_repo ON github_webhook_events(repository_id);

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',
      version TEXT NOT NULL DEFAULT '1.0.0',
      health_endpoint TEXT NOT NULL,
      dependencies TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      last_health_check TEXT,
      error_rate REAL,
      latency_p50 REAL,
      latency_p99 REAL,
      requests_per_minute REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id),
      version TEXT NOT NULL,
      previous_version TEXT,
      status TEXT NOT NULL,
      deployed_at TEXT NOT NULL,
      deployed_by TEXT,
      commit_sha TEXT,
      changelog TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_deployments_service ON deployments(service_id);
    CREATE INDEX IF NOT EXISTS idx_deployments_deployed_at ON deployments(deployed_at);

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      service_id TEXT NOT NULL REFERENCES services(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      resolved_at TEXT,
      root_cause TEXT,
      confidence REAL,
      agent_run_id TEXT,
      approval_state TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
    CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);

    CREATE TABLE IF NOT EXISTS incident_events (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      metadata TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_incident_events_incident ON incident_events(incident_id);
    CREATE INDEX IF NOT EXISTS idx_incident_events_timestamp ON incident_events(timestamp);

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      service_id TEXT NOT NULL REFERENCES services(id),
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      metric TEXT,
      threshold REAL,
      current_value REAL,
      fired_at TEXT NOT NULL,
      resolved_at TEXT,
      incident_id TEXT REFERENCES incidents(id),
      status TEXT NOT NULL DEFAULT 'firing'
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alerts(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_alerts_service ON alerts(service_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_steps INTEGER NOT NULL DEFAULT 0,
      total_tool_calls INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      token_usage INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_incident ON agent_runs(incident_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);

    CREATE TABLE IF NOT EXISTS agent_steps (
      id TEXT PRIMARY KEY,
      agent_run_id TEXT NOT NULL REFERENCES agent_runs(id),
      sequence_number INTEGER NOT NULL,
      agent_type TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input TEXT,
      output TEXT,
      reasoning TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(agent_run_id);

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      agent_step_id TEXT NOT NULL REFERENCES agent_steps(id),
      tool_name TEXT NOT NULL,
      tool_type TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tool_calls_step ON tool_calls(agent_step_id);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name);

    CREATE TABLE IF NOT EXISTS hypotheses (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      agent_run_id TEXT NOT NULL REFERENCES agent_runs(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      confidence REAL NOT NULL DEFAULT 0,
      supporting_evidence TEXT NOT NULL DEFAULT '[]',
      contradicting_evidence TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hypotheses_incident ON hypotheses(incident_id);

    CREATE TABLE IF NOT EXISTS remediation_plans (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      action TEXT NOT NULL,
      target_service TEXT NOT NULL,
      description TEXT NOT NULL,
      risk TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '[]',
      parameters TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'proposed',
      created_at TEXT NOT NULL,
      executed_at TEXT,
      verified_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_remediation_incident ON remediation_plans(incident_id);

    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      detection_latency_ms INTEGER,
      investigation_latency_ms INTEGER,
      total_tool_calls INTEGER NOT NULL DEFAULT 0,
      incorrect_tool_calls INTEGER NOT NULL DEFAULT 0,
      root_cause_accuracy REAL,
      remediation_success INTEGER NOT NULL DEFAULT 0,
      recovery_verified INTEGER NOT NULL DEFAULT 0,
      total_agent_steps INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      token_usage INTEGER,
      failure_reason TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_eval_runs_scenario ON evaluation_runs(scenario_id);

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenario_runs (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      status TEXT NOT NULL,
      incident_id TEXT REFERENCES incidents(id),
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scenario_runs_scenario ON scenario_runs(scenario_id);

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id),
      scenario_run_id TEXT REFERENCES scenario_runs(id),
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL,
      level TEXT,
      message TEXT,
      trace_id TEXT,
      labels TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_service_time ON telemetry_events(service_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_telemetry_scenario ON telemetry_events(scenario_run_id);

    CREATE TABLE IF NOT EXISTS incident_evidence (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      description TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      significance TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_incident ON incident_evidence(incident_id);
  `);

  await migrateReleases(client);
  await migratePipelines(client);
  client.close();
  console.log('✅ All tables created successfully');
}

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
