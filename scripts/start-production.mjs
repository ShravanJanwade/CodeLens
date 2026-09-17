import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './check-config.mjs';

// ============================================================
// Production entry point
// ============================================================
// Validate config, migrate, populate the public demo, then serve.
//
// The demo seed runs on boot deliberately. The hosted deployment is
// the link people follow, and an empty workspace behind it is worse
// than no link at all -- so the data the demo needs is treated as
// part of starting up, not as a manual step someone has to remember
// after every deploy. It is idempotent and scoped to the demo
// repository id, so it never touches a connected repository.
// ============================================================

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

const run = (file, args = []) =>
  new Promise((resolveCode, reject) => {
    child = spawn(process.execPath, ['--import', 'tsx', resolve(root, file), ...args], {
      cwd: resolve(root, 'apps/api'),
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveCode(code ?? (signal ? 1 : 0)));
  });

/**
 * Steps that make the demo work but are not required to serve real
 * traffic. A failure here is logged and the server still starts --
 * a broken demo should not take down a workspace someone is using.
 */
async function prepareDemo() {
  const steps = [
    ['demo workspace', 'packages/db/src/seed-demo.ts'],
    ['diagnosis benchmark', 'apps/api/src/pipeline/benchmark.ts'],
  ];
  for (const [label, file] of steps) {
    try {
      const code = await run(file);
      if (code !== 0) console.warn(`[startup] ${label} exited ${code}; continuing without it.`);
    } catch (error) {
      console.warn(`[startup] ${label} failed: ${error.message}; continuing without it.`);
    }
  }
}

try {
  const migrationCode = await run('packages/db/src/migrate.ts');
  if (migrationCode !== 0) process.exit(migrationCode);

  // Set SEED_DEMO=false on a deployment that only serves real
  // repositories.
  if (process.env.SEED_DEMO !== 'false') await prepareDemo();

  process.exitCode = await run('apps/api/src/index.ts');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
