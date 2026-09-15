import type { Client } from '@libsql/client';
export async function migrateWorkspace(client: Client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS github_connections(user_id TEXT PRIMARY KEY REFERENCES users(id), github_id TEXT NOT NULL UNIQUE, login TEXT NOT NULL, token TEXT NOT NULL, scopes TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY, user_id TEXT, verifier TEXT NOT NULL, purpose TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS repository_integrations(repository_id TEXT PRIMARY KEY REFERENCES repositories(id), hook_id INTEGER, webhook_secret TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS repository_investigations(id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id), baseline TEXT NOT NULL, candidate TEXT NOT NULL, status TEXT NOT NULL, evidence TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS repository_investigations_repo ON repository_investigations(repository_id);
  `);
}
