// Facts about an indexed file that the seeded demo states outright and a
// real repository leaves implicit: which service it belongs to and which HTTP
// routes it registers. Pure, so the graph endpoint and tests share it.

/** Deployable units live under services/ or apps/ in most monorepos. */
export function serviceOf(path: string): string | undefined {
  return /^(?:services|apps)\/([^/]+)\//.exec(path)?.[1];
}

const ROUTE_REGISTRATION =
  /\.(on|route|get|post|put|patch|delete|all)\(\s*(?:['"](GET|POST|PUT|PATCH|DELETE)['"]\s*,\s*)?['"`](\/[^'"`\s]*)['"`]/g;

/** HTTP routes a file registers: Express, Hono, Fastify-style `.get('/x')` and `.on('GET', '/x')`. */
export function endpointsIn(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(ROUTE_REGISTRATION)) {
    const method = match[2] ?? (['on', 'route', 'all'].includes(match[1]) ? 'ANY' : match[1].toUpperCase());
    found.add(`${method} ${match[3]}`);
  }
  return [...found];
}
