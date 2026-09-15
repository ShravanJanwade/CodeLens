import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './check-config.mjs';

process.env.NODE_ENV = 'production';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  validateConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
let child;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child?.kill(signal));
const run = (file) =>
  new Promise((resolveCode, reject) => {
    child = spawn(process.execPath, ['--import', 'tsx', resolve(root, file)], {
      cwd: resolve(root, 'apps/api'),
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveCode(code ?? (signal ? 1 : 0)));
  });
try {
  const migrationCode = await run('packages/db/src/migrate.ts');
  if (migrationCode !== 0) process.exit(migrationCode);
  process.exitCode = await run('apps/api/src/index.ts');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
