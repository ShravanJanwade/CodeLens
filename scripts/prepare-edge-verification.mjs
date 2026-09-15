import fs from 'node:fs';
const report = JSON.parse(fs.readFileSync('apps/web/public/evidence/taskforge-recorded.json', 'utf8'));
const id = `verify-${crypto.randomUUID()}`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const timestamp = new Date().toISOString();
fs.mkdirSync('apps/edge/.wrangler', { recursive: true });
fs.writeFileSync('apps/edge/.wrangler/verification.json', JSON.stringify({ id, report }));
fs.writeFileSync(
  'apps/edge/.wrangler/verification.sql',
  `INSERT INTO rehearsal_runs(id,repository_id,idempotency_key,baseline,candidate,correction,status,config,created_at,updated_at) VALUES (${[id, 'taskforge', id, report.baseline, report.candidate, report.correction, 'queued', JSON.stringify(report.config), timestamp, timestamp].map(quote).join(',')});`,
);
