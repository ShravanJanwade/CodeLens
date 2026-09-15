-- Deliberate D1 subset of the local release schema. No Node/libSQL runtime in Workers.
CREATE TABLE IF NOT EXISTS repositories (id TEXT PRIMARY KEY);
INSERT OR IGNORE INTO repositories VALUES ('taskforge');
CREATE TABLE IF NOT EXISTS rehearsal_runs (
  id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id),
  idempotency_key TEXT NOT NULL, baseline TEXT NOT NULL, candidate TEXT NOT NULL, correction TEXT,
  status TEXT NOT NULL DEFAULT 'queued', config TEXT NOT NULL, owner TEXT, lease_until INTEGER,
  error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(repository_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS rehearsal_attempts (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES rehearsal_runs(id), stage TEXT NOT NULL,
  attempt INTEGER NOT NULL, status TEXT NOT NULL, evidence TEXT, error TEXT,
  started_at TEXT NOT NULL, completed_at TEXT, UNIQUE(run_id,stage,attempt)
);
CREATE INDEX IF NOT EXISTS rehearsal_attempt_run ON rehearsal_attempts(run_id);
CREATE TABLE IF NOT EXISTS release_findings (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES rehearsal_runs(id), repository_id TEXT NOT NULL REFERENCES repositories(id),
  revision TEXT NOT NULL, endpoint TEXT NOT NULL, signature TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
  evidence_ids TEXT NOT NULL, explanation TEXT NOT NULL, source_path TEXT, source_line INTEGER, created_at TEXT NOT NULL,
  UNIQUE(run_id,signature)
);
CREATE TABLE IF NOT EXISTS revision_sources (
  revision TEXT NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY(revision,path)
);
