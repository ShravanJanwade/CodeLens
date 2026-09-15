import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { validateConfig } from './check-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(join(tmpdir(), 'codelens-production-'));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const env = {
  ...process.env,
  NODE_ENV: 'production',
  CODELENS_TEST: 'false',
  PUBLIC_DEMO: 'false',
  APP_ORIGIN: 'https://verification.example',
  CORS_ORIGIN: 'https://verification.example',
  DATABASE_URL: join(directory, 'smoke.db'),
  PORT: String(port),
  AI_PROVIDER: 'demo',
  JWT_SECRET: randomBytes(48).toString('hex'),
  TOKEN_ENCRYPTION_KEY: randomBytes(48).toString('hex'),
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
};
validateConfig(env);
let server,
  output = '';
try {
  await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', resolve(root, 'packages/db/src/migrate.ts')],
    { cwd: resolve(root, 'apps/api'), env },
  );
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: resolve(root, 'apps/api'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => (output += d));
  server.stderr.on('data', (d) => (output += d));
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${base}/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, `Production API failed to start: ${output}`);
  let document = '';
  for (const route of ['/', '/login', '/repositories', '/investigations']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /text\/html/);
    document = await response.text();
    assert.match(document, /<div id="root">/);
  }
  const asset = document.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  assert.equal((await fetch(base + asset)).status, 200);
  assert.equal((await fetch(base + '/assets/missing.js')).status, 404);
  const missing = await fetch(base + '/api/v1/missing');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  const signup = await fetch(base + '/api/v1/auth/register', {
    method: 'POST',
    headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Production verification',
      email: 'smoke@example.test',
      password: randomBytes(20).toString('hex'),
    }),
  });
  assert.equal(signup.status, 201);
  const cookie = signup.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
  const session = cookie.split(';')[0];
  const identity = await fetch(base + '/api/v1/auth/status', { headers: { Cookie: session } });
  assert.equal((await identity.json()).data.user.email, 'smoke@example.test');
  const crossSite = await fetch(base + '/api/v1/auth/logout', {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', Cookie: session },
  });
  assert.equal(crossSite.status, 403);
  console.log(
    'Production smoke passed: SPA deep links, built assets, API 404s, persisted login, secure cookies, and cross-origin protection.',
  );
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
  assert(
    directory.startsWith(join(tmpdir(), 'codelens-production-')),
    'Refuse cleanup outside the generated test directory.',
  );
  await rm(directory, { recursive: true, force: true });
}
