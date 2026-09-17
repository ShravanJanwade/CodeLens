// ============================================================
// Database Client & Migration
// ============================================================

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as coreSchema from './schema';
import * as releaseSchema from './release-schema';
import * as workspaceSchema from './workspace-schema';
import * as pipelineSchema from './pipeline-schema';
export * from './release-schema';
export * from './workspace-schema';
export * from './pipeline-schema';
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
} from 'drizzle-orm';
import fs from 'fs';
import path from 'node:path';
import { databasePath } from './database-path';

export * from './schema';
export * as schema from './schema';
export * as pipeline from './pipeline-schema';

// Every table the query builder should know about. Keeping one
// object means getDb() can resolve any table in the workspace.
const schema = { ...coreSchema, ...releaseSchema, ...workspaceSchema, ...pipelineSchema };

const DB_PATH = databasePath;

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const client = createClient({ url: `file:${DB_PATH}` });
  return drizzle(client, { schema });
}

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export type AppDatabase = ReturnType<typeof getDb>;
