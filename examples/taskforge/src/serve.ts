import { startFixture, variants, type Variant } from './app';
const selected = process.env.TASKFORGE_VERSION ?? 'baseline';
if (!variants.includes(selected as Variant))
  throw new Error('TASKFORGE_VERSION must be baseline, defective or corrected');
const app = await startFixture(selected as Variant, { postgresUrl: process.env.TASKFORGE_DATABASE_URL });
console.log(`TaskForge prepared ${selected} fixture: ${app.url} (${app.engine}). Use x-user-id: 1.`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void app.close().then(() => process.exit(0)));
