# Free public demo design

The complete platform runs locally. A public portfolio demo should use deterministic sample data and the `DemoProvider`; it must not expose a local SQLite instance or Ollama endpoint. The only permitted public state change is approval of an isolated deterministic scenario, which never targets a real service or external account.

| Service | Purpose | Free allowance / expectation | $0 safeguard |
| --- | --- | --- | --- |
| Cloudflare Pages | Static React frontend | Verify current free limits before deployment | Static-only site; disable deployments if a limit changes |
| Cloudflare Workers | Optional read-only demo API | Verify current free limits before deployment | Apply a request limit and return sample data after the limit |
| Cloudflare D1 | Optional demo data store | Verify current free limits before deployment | Read-only demo data, bounded retention, no uploads |
| Local Docker stack | Full platform and development | Open-source software on the developer machine | Not publicly exposed |
| Ollama | Local model inference | Open-source local runtime | Optional; never required by the public demo |

No public provider has been configured in this repository. This is intentional: vendor allowances and billing policies change. Build the static client with `VITE_API_URL` set to the separately deployed API, and ensure the host rewrites SPA routes to `index.html` (the included `apps/web/public/_redirects` covers compatible static hosts). Before deployment, validate the provider's current permanent free allowance, enable every available spend/usage guard, set hard application limits, and record the result in `docs/cost-audit.md`. Do not add a credit card or a paid API to make the demo work.

To remove a public deployment, delete its project and any database binding in the provider dashboard, revoke deployment tokens, and remove local environment secrets. The local project remains runnable with no cloud account.
