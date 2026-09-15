# Deploy the full CodeLens workspace

This is the deployment for email/password accounts, GitHub OAuth, private repository access, live branches, saved investigations, CI/CD evidence, and reviewed draft pull requests. The Node service serves both the built frontend and `/api` from one HTTPS origin. SQLite must live on persistent storage. Run one service instance against that file.

The separate [Cloudflare Worker/D1 guide](free-deployment.md) publishes the public TaskForge demo. That adapter does not run the account-based workspace. Static-only hosting also cannot provide login or private repository indexing.

## 1. Prepare the release

Use Node.js 22+ and Git. From the repository root:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm verify:production
```

The smoke test creates an isolated temporary database; it checks production routing, built assets, account persistence, secure cookies, and origin protection without using your GitHub credentials. CI runs these checks too.

For this repository, the observed GitHub default branch is **master**. The trusted TaskForge workflow and edge dispatch configuration use `master`. If you fork with another default branch, update both `.github/workflows/release-rehearsal.yml` and `apps/edge/wrangler.toml` to the same reviewed ref.

Review the existing migration from the old project before committing: this workspace already contains old-directory deletions as well as the new monorepo. These commands are for your review and publishing step:

```sh
git status --short
git diff --stat
git switch -c codex/workspace-release
# Stage only after confirming every listed addition and deletion is intended.
git add -A
git diff --cached --stat
git diff --cached --check
git commit -m "Complete CodeLens account and repository workspace"
git push -u origin codex/workspace-release
```

Open a pull request to `master`, let CI finish, review the diff, and merge. `.env`, `.env.production`, local databases and dependencies are ignored. Check staged files for other secrets before pushing. No GitHub push or cloud deployment was performed by the implementation session.

## 2. Choose where the full service runs

No paid service is required by the code. You can run it on an existing machine with persistent disk. A managed host must support a long-running Node process or Docker, Git, writable temporary space, HTTPS, and a persistent volume. Do not store accounts on an ephemeral free web-service filesystem: a redeploy can erase it. No unlimited free managed hosting or uptime is promised.

For a personal portfolio deployment using your existing machine, Tailscale's free Personal plan and Funnel provide an HTTPS `ts.net` address without buying a domain. Funnel is available across plans, is currently beta, and has bandwidth limits. Your computer and the CodeLens process must stay on. This is an optional personal hosting path, not managed production infrastructure. [Personal plan](https://tailscale.com/docs/reference/free-plans-discounts), [Funnel requirements](https://tailscale.com/docs/features/tailscale-funnel).

1. Install Tailscale from its official download page, sign in to your intended Personal account, and enable MagicDNS/HTTPS as prompted.
2. Run `tailscale funnel --bg 4000`. Approve Funnel in its browser setup. Record the HTTPS origin printed by the command; `tailscale funnel status` shows it again.
3. Use that origin in the environment and OAuth setup below. Start CodeLens on port 4000. The tunnel may show an upstream error until the app starts.
4. Keep the machine, Tailscale, and CodeLens running. The background Funnel setting survives restarts; your app also needs a startup service/task. `tailscale funnel --https=443 off` stops public sharing. [CLI reference](https://tailscale.com/docs/reference/tailscale-cli/funnel).

You can instead use an existing server's HTTPS reverse proxy. Forward the complete site to `http://127.0.0.1:4000`, including `/api`, without rewriting paths or dropping cookies. Restrict direct access to the backend port. Configure the proxy to replace client-supplied IP headers if you use them for rate limiting.

## 3. Set the production environment

Copy `.env.production.example` to `.env.production`, or enter its variables in your host's secret settings. On Windows:

```powershell
Copy-Item .env.production.example .env.production
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Put the two different generated values into the fields below. Do not share or commit the completed file.

| Variable | Value / purpose |
| --- | --- |
| `NODE_ENV` | `production`; enables secure cookies and serves the built frontend. |
| `PORT` | `4000`, or the port assigned by your host. |
| `APP_ORIGIN` | Your public HTTPS origin, such as `https://device.tailnet.ts.net`. No trailing slash. |
| `CORS_ORIGIN` | Exactly the same origin. |
| `DATABASE_URL` | Absolute SQLite file path. Docker: `/data/codelens.db`. Windows direct Node: `C:/CodeLensData/codelens.db`; create its parent directory. |
| `JWT_SECRET` | First unique random value, at least 32 characters. |
| `TOKEN_ENCRYPTION_KEY` | Second unique random value, at least 32 characters. Encrypts stored GitHub tokens and webhook secrets. Keep it stable and backed up separately from the database. |
| `GITHUB_CLIENT_ID` | OAuth App client ID from step 4. Not an installation ID or personal access token. |
| `GITHUB_CLIENT_SECRET` | OAuth App client secret from step 4; server-side only. |
| `AI_PROVIDER` | `demo` needs no key. `gemini` or `ollama` is optional. |
| `GEMINI_API_KEY` | Only for `AI_PROVIDER=gemini`; create in Google AI Studio. |
| `GEMINI_MODEL` | An enabled model ID for your account; check its current free-tier eligibility and quota. |
| `PUBLIC_DEMO` | `false` for account features. `true` blocks account mutations. |
| `PLAYWRIGHT_JOURNEYS` | `false` by default. HTTP fixture checks work without Chromium. |

The remaining limits in the template bound indexing and request volume. `MAX_REPOSITORY_SIZE` limits indexed text bytes; the GitHub metadata guard also rejects repositories reported above 100 MB. `TASKFORGE_DATABASE_URL` is optional and must point to a dedicated fixture PostgreSQL database, never your application's production data. Its fixture tables are reset during measurements.

For Gemini, use the [official key setup](https://ai.google.dev/gemini-api/docs/api-key) and [current model quotas](https://ai.google.dev/gemini-api/docs/rate-limits). Source content sent for AI analysis leaves the API host for the configured provider. With `demo`, deterministic source answers and CI evidence work without an external AI service.

Never put secrets in `VITE_*` variables: those are bundled into browser JavaScript. Leave `VITE_API_URL` unset for this deployment; the frontend uses same-origin `/api/v1`. GitHub Actions' optional `GITHUB_DISPATCH_TOKEN` and `REHEARSAL_CALLBACK_TOKEN` belong to the separate public edge demo and are not needed for OAuth accounts.

Run `corepack pnpm check:config`. It reports missing fields without printing secret values. The production start command automatically validates configuration and applies additive database migrations.

## 4. Create the GitHub OAuth App

In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**. Use an OAuth App for this implementation, not a GitHub App installation. [GitHub's registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).

| GitHub field | Value |
| --- | --- |
| Application name | `CodeLens` |
| Homepage URL | Your exact `APP_ORIGIN` |
| Application description | Repository intelligence, investigations and delivery monitoring |
| Authorization callback URL | `APP_ORIGIN` followed by `/api/v1/auth/github/callback` |
| Device Flow | Leave disabled; this app uses the browser authorization-code flow. |

Register, copy the client ID, generate a client secret, and set both server variables. Restart the service after changing them. For example, if your origin is `https://codelens.example.org`, the callback is `https://codelens.example.org/api/v1/auth/github/callback`.

For local development, create a separate OAuth App with homepage `http://localhost:3000` and callback `http://localhost:3000/api/v1/auth/github/callback`. Set those same origins in `.env`. If using the current alternative dev port, use `http://127.0.0.1:3010` consistently in both places. Do not mix `localhost` and `127.0.0.1` during one login.

Basic GitHub sign-in requests profile and verified-email access. After login, **Account & GitHub → Connect GitHub** requests `repo`, `workflow`, and `security_events` in addition to identity scopes. These support private repositories, reviewed workflow edits, hooks, and eligible security alert reads. GitHub OAuth scopes can be broad; review the authorization screen and your organization's approval requirements. CodeLens does not silently link an existing password account by email; sign into that account first and connect GitHub from within it. [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

## 5. Start the service

### Direct Node

After the build and environment setup:

```sh
corepack pnpm check:config
corepack pnpm start
```

Open the HTTPS origin, not the backend's plain HTTP address, to use production login. `/health` should return `status: ok`. The start command reads `.env.production`; environment variables already supplied by the host take precedence. Configure your process manager to restart this command from the repository root. Keep one instance. Do not use the Vite development server in production.

On Windows, a Task Scheduler task can run the installed `node.exe` with arguments `--env-file-if-exists=.env.production scripts/start-production.mjs`, with **Start in** set to the repository root. Select your intended service account, an at-startup trigger, and restart-on-failure settings. Keep the database directory writable by that account. This setup is a user deployment action; no startup task has been created automatically.

### Docker Compose

Install Docker with Linux containers, fill `.env.production`, and run:

```sh
docker compose -f compose.production.yml up -d --build
docker compose -f compose.production.yml logs --tail 100 codelens
```

The image includes Git and Node dependencies, runs as an unprivileged user, builds the frontend, and migrates on startup. Compose retains the database in `codelens-data` and binds the backend to host loopback. Put your HTTPS proxy or Funnel on the host. Do not run `down --volumes` when retaining accounts. Managed Docker hosts should mount persistent storage at `/data`, keep the service user's write permission, and send traffic to port 4000.

The Dockerfile deliberately retains TypeScript runtime dependencies because workspace packages execute through `tsx`. Chromium and PostgreSQL are optional and are not installed by this image. Docker itself was unavailable in the implementation environment; validate its build on your Docker host. The equivalent Node production process passed its local smoke test.

## 6. Connect a repository and CI/CD

1. Create an email/password account or sign in through GitHub. Email registration needs a password of at least 12 characters. Sign in first before connecting an existing password account to GitHub.
2. Connect GitHub in **Account & GitHub**, then choose a repository in **Repositories → Connect repository**. Public URLs can also be entered directly.
3. Open the repository, sync branches, choose the desired branch, and select **Index latest code**. GitHub is queried again at indexing time; deleted branches produce an error instead of silently selecting a different branch. Historical snapshots retain their original commit.
4. Open **CI/CD monitoring** for workflow runs and job steps, reported deployments, pull-request mergeability, and accessible Dependabot/code/secret-scanning alerts. Empty, unavailable, pending and failing evidence have distinct states.
5. Choose **Investigations → Your own repository** to compare baseline and candidate branches or exact commits. Save/export the report. Only workflow runs matching the candidate commit count as candidate CI evidence.
6. For source/workflow fixes, choose **Prepare changes**, load a file or use the starter CI workflow, edit, and review before/after contents. The final button creates a new branch and draft PR on GitHub. It does not push to the base branch or merge. If the base moved, refresh and review again.

CI monitoring shows what GitHub reports. The supplied `.github/workflows/ci.yml` runs type checks, integration tests, production builds and the production smoke check. Deployment records appear only if your hosting provider or deployment workflow reports them through GitHub Deployments. Connect your provider's repository integration, set its build/start configuration, select the intended production branch, and enable its deployment reporting. A generic “deploy everywhere” credential is not part of this app.

For self-hosting, deploy a reviewed commit with the direct Node or Compose commands above; configure your own CI deployment job if you want unattended updates. Keep that job's SSH key or deploy-hook URL in GitHub Actions secrets, use the production environment's approval controls, and scope its permission to the deployment target. CodeLens can monitor the resulting workflow and deployment records. Recommendations are evidence-based investigation steps, not automatic conflict resolution or proof of security.

## 7. Enable signed webhooks

From a connected repository's **CI/CD monitoring → Webhook** panel, choose the action to connect its webhook. The server must already have the public HTTPS `APP_ORIGIN`, and your GitHub identity must have permission to manage repository hooks.

CodeLens creates a repository-specific endpoint at `/api/v1/integrations/github/webhook/REPOSITORY_ID`, generates a secret, encrypts it in SQLite and configures GitHub. You do not need to copy a webhook secret into `.env` for this flow. Push events index the affected branch; workflow, check, pull-request and deployment events are retained as delivery evidence. Signatures are verified before accepting data, and delivery IDs are deduplicated. Fork PR code is not executed by a webhook.

Check **GitHub repository → Settings → Webhooks → Recent deliveries** for a successful delivery, then check CodeLens's event list. If an indexing attempt fails or a different branch is already being indexed, sync manually after resolving the error. The older shared endpoint uses `GITHUB_WEBHOOK_SECRET`; prefer the repository-specific setup for accounts.

Deleting a CodeLens repository removes its local source/evidence connection, not the GitHub repository. Remove its hook in GitHub settings first if you no longer want deliveries. Disconnecting GitHub clears stored API access while retaining the account's GitHub sign-in identity; revoke the OAuth App from GitHub settings to revoke authorization at GitHub too.

## 8. Verify and operate the deployment

Verify from the public URL: landing page, email signup/logout/login, OAuth login, account connection, own/private repo visibility, branch selection, latest indexing, saved investigation, CI job details, a deliberate draft PR in a test repository, and webhook delivery. Repeat login after a service restart to confirm the database persists. The live OAuth, webhook creation and GitHub write checks require your credentials and were not performed against your account during implementation.

Back up the SQLite database and its encryption key. For a simple consistent backup, stop the service, copy the database and any `-wal`/`-shm` companions as one set, then restart; do not copy a live database file alone. Keep backups off the service disk. Before a release, retain a database backup and the previous deployable commit/image. Restore the matching backup if a later migration is incompatible with a code rollback. Existing additive migrations do not replace your accounts.

| Symptom | Check |
| --- | --- |
| Login returns to signed out | Use HTTPS; verify `APP_ORIGIN`, cookies, and proxy behavior. |
| GitHub button is disabled | Both OAuth variables must be set; restart the API. |
| OAuth callback mismatch | The GitHub callback must match protocol, host, port, and full path. |
| Existing account email during OAuth | Sign in with the password first, then connect GitHub. |
| Repository/security section says unavailable | Review OAuth scopes, organization approval, repository role and enabled GitHub security features; it does not mean zero alerts. |
| Branch no longer exists | Sync branches and select a live branch; historical commits remain viewable. |
| Index has fewer files than GitHub | Inspect coverage limits: text size, file count, supported formats and ignored/generated directories. |
| Draft PR rejected after editing | Base branch moved, token lacks write/workflow permission, or branch rules reject it; refresh and review again. |
| No deployments shown | Your host must report GitHub Deployments; a passing build alone is not a deployment. |
| Accounts disappear after redeploy | The database path is not on persistent storage, or changed between releases. |
| OAuth token cannot decrypt | Restore the original encryption key or reconnect the affected accounts. |

Current boundaries: email login has no outbound verification or password-reset mail service; plan an account recovery process before opening registration broadly. Arbitrary repository application execution and performance benchmarking are not implemented: own-repository investigations use source and GitHub CI evidence. Measured runtime rehearsals remain limited to the prepared TaskForge fixture. The single-instance SQLite deployment is intended for a bounded workload, not a horizontally scaled multi-tenant service.
