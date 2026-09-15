# Verification record

The automated integration suite currently checks compiler parsing, revision-aware repeatable indexing, source references, real HTTP/query measurements, unchanged comparison logic, permission regression detection, supplied correction, held-out correctness, timing inconclusiveness, durable checkpoint recovery, idempotency, expired leases, cancellation, fixture cleanup, arbitrary-target rejection and repository isolation.

Local results: 22 API tests (eleven rehearsal/source integration tests, nine account/repository integration tests and two Gemini boundary tests) and the event-bus test pass: **23 total**. The measured query counts are baseline 2, defective 22 and corrected 2 per issue-list request at page size 20. Browser inspection confirmed repository navigation, source browsing, source-grounded question citations, recorded performance evidence and the mobile drawer at a 390-pixel viewport without horizontal overflow. Workspace type checks and formatting checks pass.

The first timing assertion in the test suite incorrectly assumed every absolute budget would pass on a busy development host. It was corrected to distinguish deterministic contract failures from actual measured timing outcomes. Timing evidence is preserved rather than adjusted to force a passing report.

The final React and API production builds pass. A fresh baseline-to-baseline run started through the browser completed with nine passing checks and zero failures. The bundled defective run separately detected the prepared permission, repeated-query and background-contention failures; its supplied correction passed all nine comparison checks. These are observations from these runs, not performance guarantees across hosts.

The full Node production smoke test passes with an isolated temporary database: landing/login/workspace deep links return the built SPA, JavaScript assets resolve, missing APIs return JSON 404s, registration persists a session, cookies carry Secure/HttpOnly/SameSite flags, and cross-origin logout is rejected. The Docker build remains unverified locally because Docker is not installed.

On September 13, 2026, the browser flow created a synthetic email account, connected `ShravanJanwade/CodeLens`, retrieved the actual default branch `master`, and indexed commit `8a2db58ae77f2abff26957865daad9d01faa5a73` (53 files). The delivery UI retrieved a real successful GitHub workflow and its job. An own-repository investigation compared `d870f25b73a87da98455e2022cf1bb50eefdf5e3` to that commit, saved two changed files, and correctly reported missing matching candidate CI as inconclusive. The test connection was deleted through the confirmation UI afterward.

Account integration tests cover cookie ownership boundaries, CSRF, PKCE and one-time OAuth state, encrypted credentials, live branch selection, stale branch rejection, exact-revision investigations, security-secret redaction, stale-base publishing rejection, draft retry deduplication, HMAC webhook deduplication, cascading repository deletion, logout, and retained OAuth identity after disconnect. Credentialed GitHub responses are mocked: no live OAuth authorization, external draft PR or remote webhook was created during these tests. Those checks require your deployment credentials and a chosen test repository.

The new landing page, email login and two-card investigation entry were also checked at a 390-pixel viewport without horizontal overflow. Reviewed publishing preserves existing executable file modes and refuses directory, symlink and submodule replacement.

The guided workspace now opens Code after an index completes. The live browser check indexed the repository above, searched its nested file tree, selected `codelens-ai/gateway/internal/middleware/auth.go` lines 20–25, and received a Gemini explanation with the correct source citation. Gemini initially returned a temporary 503; one bounded retry now handles 502/503/504 responses, with an explicitly labeled source fallback if generation remains unavailable. The configured provider and model are visible in the assistant. Tests verify exact indexed selection boundaries and invalid selection rejection, as well as the retry behavior.

Own-repository investigations were verified through Choose revisions → Review changes → Checks & journeys → Decide next steps. The live comparison retained the exact commits and two changed files and reported missing matching CI as inconclusive. No application journey or performance result is fabricated for imported repositories. Branch tests also verify that selecting an unindexed branch does not return another branch's snapshot. Workspace pages require a current session; anonymous legacy workspace API routes return 401. The landing page, documentation, and recorded evidence/source remain public.

Local rehearsal tests explicitly use the included SQLite fixture and disable optional Chromium journeys so a developer's PostgreSQL environment setting cannot redirect the automated fixture tests to a separate database.

Two local D1 migrations have been applied through Wrangler. Ten local Worker/D1 adapter checks pass, covering the source catalog, authenticated evidence import, duplicate-result immutability, repository boundaries, findings and report download. Target cloud publishing and live GitHub dispatch require account credentials and are not claimed as verified. Docker/PostgreSQL and Chromium CI execution have configuration and runnable stages; report their verification separately from local SQLite.

To reproduce:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:migrate
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm verify:production
corepack pnpm rehearsal:record
```

The static recording lives in `apps/web/public/evidence/taskforge-recorded.json`. It carries its own timestamp, run IDs, immutable revisions, database engine, stage checks and raw evidence. Never substitute an expected answer for those results.
