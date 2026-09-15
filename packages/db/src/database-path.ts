import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(packageDirectory, '../../..');
dotenv.config({ path: path.join(workspaceRoot, '.env') });

/**
 * All workspace processes use one root-level database by default. An absolute
 * DATABASE_URL still takes precedence for Docker, tests, or deployed adapters.
 */
const configuredPath = process.env.DATABASE_URL;
export const databasePath = configuredPath
  ? (path.isAbsolute(configuredPath) ? configuredPath : path.resolve(workspaceRoot, configuredPath))
  : path.join(workspaceRoot, 'data', 'codelens.db');
