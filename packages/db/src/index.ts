// ============================================================
// Database Client & Migration
// ============================================================

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
export * from './release-schema';
export * from './workspace-schema';
export { and, desc, eq, inArray, lt, or, isNull, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'node:path';
import { databasePath } from './database-path';

export * from './schema';
export * as schema from './schema';

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
