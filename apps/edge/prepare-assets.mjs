import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(root, '../web/dist');
const destination = path.join(root, '.wrangler/assets');
await fs.access(path.join(source, 'index.html')).catch(() => {
  throw new Error('Build the frontend first: corepack pnpm build:web');
});
// A separate generated artifact keeps the Pages redirect out of Workers assets.
await fs.mkdir(destination, { recursive: true });
await fs.cp(source, destination, {
  recursive: true,
  filter: (entry) => path.basename(entry) !== '_redirects',
});
console.log('Prepared Workers assets from apps/web/dist.');
