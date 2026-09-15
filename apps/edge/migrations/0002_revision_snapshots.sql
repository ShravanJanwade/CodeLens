-- Align archived source with the existing repository/index/file domain.
CREATE TABLE IF NOT EXISTS code_analysis_runs (
  id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), commit_sha TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed', branch TEXT NOT NULL DEFAULT 'recorded'
);
CREATE TABLE IF NOT EXISTS repository_files (
  id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id),
  analysis_run_id TEXT NOT NULL REFERENCES code_analysis_runs(id), path TEXT NOT NULL, content TEXT NOT NULL,
  UNIQUE(analysis_run_id,path)
);
INSERT OR IGNORE INTO code_analysis_runs(id,repository_id,commit_sha)
  SELECT DISTINCT revision,'taskforge',revision FROM revision_sources;
INSERT OR IGNORE INTO repository_files(id,repository_id,analysis_run_id,path,content)
  SELECT revision || ':' || path,'taskforge',revision,path,content FROM revision_sources;
DROP TABLE revision_sources;
