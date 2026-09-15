# Free CodeLens deployment

For email/password accounts, GitHub OAuth, private repositories and live delivery monitoring, use the [full workspace deployment guide](deploy-full-workspace.md). This Worker adapter hosts the public TaskForge demo, not the Node account API. The full guide includes an optional free personal hosting path on existing hardware.

The reviewable implementation has two deployable pieces: a static React build with actual recorded evidence, and an optional Worker/D1 control plane that dispatches trusted fixture executions to a public GitHub repository. No deployment has been published by this implementation session.

## Verified provider terms

Checked against official documentation in September 2026:

- Workers static asset requests are free and unlimited; requests that invoke Worker code count toward the Worker plan. Workers Free currently allows 100,000 requests/day. [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).
- D1 Free includes 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. Exceeding the free allowances produces errors rather than unlimited execution. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
- Standard GitHub-hosted runners are free for public repositories; larger runners and private repositories have different billing rules. Keep the fixture project public and use `ubuntu-latest`. [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage).
- Gemini quotas depend on project, model and usage tier. Select a currently enabled free-tier model through `GEMINI_MODEL`; no fixed unlimited quota is promised. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

Keep the account on its Free plan. The application enforces ten public run creations per UTC day, at most three active/queued requests, one GitHub workflow concurrency group and a bounded executor. CI artifacts expire after one day; raw D1 stage evidence expires after seven days, while compact reports/findings persist. Recheck provider terms before publishing.

## Static recorded demo

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:migrate
corepack pnpm rehearsal:record
corepack pnpm build:web
```

Upload `apps/web/dist` to a free static host with SPA fallback. `/recorded` requires no API. On static-only hosting, fresh runs and general repository connections need a separately configured API. The included `_redirects` file is for Pages-compatible static hosts; Workers assets use their own `not_found_handling` configuration.

## Worker + D1 + public CI

1. Put this reviewed project and `.github/workflows/release-rehearsal.yml` in a public GitHub repository. The workflow checks out the trusted `master` branch and accepts only prepared candidate names. Adjust the fixed trusted ref if your default branch differs; never accept a user-supplied ref.
2. Authenticate Wrangler to the intended free Cloudflare account. Create D1 with `corepack pnpm --filter @codelens/edge exec wrangler d1 create codelens-metadata`.
3. Fill `database_id`, `GITHUB_REPOSITORY` and the fixed `GITHUB_REF` in `apps/edge/wrangler.toml`.
4. Set a repository-scoped GitHub token with Actions write permission as the Worker secret `GITHUB_DISPATCH_TOKEN`. It never appears in client code. Set an independent `REHEARSAL_CALLBACK_TOKEN` as a Worker secret and as the same GitHub Actions repository secret. Use `wrangler secret put NAME` or the provider dashboards; do not paste secrets into source files.
5. Apply D1 migrations with `corepack pnpm --filter @codelens/edge db:migrate` after confirming the target database. The edge schema deliberately uses the same repository/run/attempt/finding concepts, with a limited source archive adapter; Node's local database is not uploaded or reused as a Worker client.
6. Build the frontend with a freshly generated catalog from this exact fixture code. The edge scripts prepare a separate Workers asset directory without the Pages `_redirects` file. Publish with `corepack pnpm --filter @codelens/edge deploy` when account authorization is available.
7. Set the GitHub Actions repository variable `REHEARSAL_CALLBACK_URL` to the resulting HTTPS `workers.dev` origin. Set the callback secret from step 4. The Worker must have the same current fixture catalog as the CI checkout; mismatched source revisions are rejected rather than silently associated.
8. Verify the deployed recorded route, indexed file links, fresh-run queue, CI checkpoints, cancellation, report download and quota failure states. Test a baseline-as-candidate run as well as the prepared defective candidate.

The supplied workflow starts a PostgreSQL service, installs Playwright Chromium, executes the bounded fixture, uploads short-lived artifacts, and posts authenticated checkpoints. It does not pass user commands or targets to a shell. Gemini is optional and defaults to deterministic mode in public CI; enable it only with a server-side key and an explicitly chosen model/account quota.

## Local edge validation

```sh
corepack pnpm --filter @codelens/edge exec wrangler d1 migrations apply codelens-metadata --local
corepack pnpm --filter @codelens/edge dev --local --port 8787
```

Wrangler local mode is useful for metadata, archived-source, callback and quota validation without publishing. Without dispatch credentials, fresh hosted runs return a useful configuration error and recorded evidence remains accessible. A stale CI run becomes interrupted after 15 minutes. Cross-CI automatic redispatch is not implemented; completed checkpoints survive and operators can inspect the retained report.

## Target verification still required

Cloudflare account bindings, GitHub workflow dispatch permissions, PostgreSQL/Chromium CI execution and live Gemini responses need their actual target accounts/runtimes. The repository includes code and instructions, not a claim that these external integrations were already published or verified.
