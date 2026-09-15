import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const authSessions = sqliteTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const githubConnections = sqliteTable('github_connections', {
  userId: text('user_id').primaryKey(),
  githubId: text('github_id').notNull().unique(),
  login: text('login').notNull(),
  token: text('token').notNull(),
  scopes: text('scopes').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const oauthStates = sqliteTable('oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  userId: text('user_id'),
  verifier: text('verifier').notNull(),
  purpose: text('purpose').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const repositoryIntegrations = sqliteTable('repository_integrations', {
  repositoryId: text('repository_id').primaryKey(),
  hookId: integer('hook_id'),
  webhookSecret: text('webhook_secret'),
  updatedAt: text('updated_at').notNull(),
});
export const repositoryInvestigations = sqliteTable('repository_investigations', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull(),
  baseline: text('baseline').notNull(),
  candidate: text('candidate').notNull(),
  status: text('status').notNull(),
  evidence: text('evidence').notNull(),
  createdAt: text('created_at').notNull(),
});
