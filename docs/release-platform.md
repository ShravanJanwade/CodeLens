# CodeLens: repository intelligence and Release Rehearsal

CodeLens helps developers understand their repositories and verify how code changes affect application behavior and performance.

## Implemented workflow

Sign in → connect an authorized GitHub repository → choose a live branch and index its latest commit → browse files, symbols and partial import dependencies → ask questions with revision/line references. Own-repository investigations compare exact commits with matching GitHub CI evidence. In TaskForge, continue to baseline/candidate selection → HTTP assertions and measurements → a bounded query-count probe → optional Gemini investigation → supplied-fix verification → worker experiments and held-out validation → retained findings and downloadable evidence.

Repository intelligence remains the primary navigation. Incident examples, services, evaluations and existing CI triage are preserved as secondary tools. The browser extension and older Go/Python services are not the execution path for Release Rehearsal.

## Domain and persistence

- `repositories` is the shared ownership boundary.
- `code_analysis_runs` is an index snapshot: immutable `commit_sha`, progress, coverage, failures, counts and summary.
- `repository_files` retains content, content hash, symbols and imports for its snapshot. `repository_edges` and `code_findings` retain the same snapshot scope.
- `rehearsal_runs` records repository, revision identities, idempotency key, workload/tool settings, status and a worker lease.
- `rehearsal_attempts` records each stage attempt. Successful evidence commits are idempotent and protected by current ownership.
- `release_findings` stores observed/confirmed findings, endpoint/signature, exact revision, source mapping and evidence IDs. Run reports preserve successful and unsuccessful correction/configuration checks.

Reindexing never deletes previous snapshots. Identical files have stable content hashes; content blobs are currently stored per snapshot rather than deduplicated across snapshots. JS/TS symbols/imports use the TypeScript compiler AST. Python/Java static checks are heuristic. Import edges resolve only relative paths; aliases, dynamic targets and complete call graphs are outside coverage. Indexing limits are recorded; supported source files, symlinks, binaries and excluded directories are handled explicitly.

## Supported executor

Only the trusted `examples/taskforge` application is executable. Users cannot supply shell commands, URLs, arbitrary environment variables or application code through this interface. Source indexing can inspect other public repositories without executing their code.

TaskForge contains users, projects, memberships, issues, comments, pagination/search, a small browser interface and CPU-bound background reports. Three prepared versions run actual code: baseline, defective and corrected. The defective configuration contains a permission bypass, per-issue SQL work and excessive background concurrency. Expected labels remain in test assertions; the investigator sees measurements, not the evaluation answers.

The fixture materializer creates actual Git commits for each supported configuration and a source-content digest. The runner verifies its source digest before executing or recovering a run. The app implementation is shared; the selected, committed configuration determines which behavior executes. This is a prepared configuration-based revision fixture, not a general checkout/build engine.

Local default storage is a fresh in-memory SQLite database per experiment. Setting `TASKFORGE_DATABASE_URL` enables PostgreSQL, using an isolated generated schema per experiment. Normal completion/cancellation drops that schema. A machine/process crash can leave a PostgreSQL schema; use an ephemeral CI service container or remove abandoned `fixture_*` schemas from the dedicated fixture database. Never use a production database for the fixture.

## Measurement and interpretation

Each version runs sequentially, with identical seeded data. Four warmup requests are excluded from the two measurement repetitions, each containing 16 serial requests. Metrics include latency distributions, achieved throughput, errors, instrumented SQL counts/durations and request traces. Resource counters are explicitly labeled as the entire Node process, including the runner. They do not establish isolated application CPU, memory, pool or queue utilization.

Checks cover member access, non-member denial, anonymous denial, response shape/business values, search, bounded report completion and query/latency budgets. Generated report IDs are used for polling rather than equality comparison. Issue values and ordering are not normalized away. Failure requests are replayable; no global minimal-reproducer claim is made.

Latency fails the relative check only when both repetitions exceed 1.30× baseline and the difference exceeds 2 ms. Mixed or small threshold-crossing results are inconclusive. The absolute foreground/report budget is 150 ms. A busy machine can fail an absolute budget even when the application has not changed. Tests assert deterministic correctness and real measurement collection, not universally passing timing values.

One bounded investigator can select page size 5 or 10 for a discriminator experiment. Gemini output is validated against this tool allowlist and parameter space. A deterministic fallback selects page size 5. Measurements, thresholds, permissions, budgets and commits are deterministic. Explanations separate observation from hypothesis. The corrected version is measured anew; worker counts 1 and 2 are tested, with page size 10 as held-out validation for the best tested passing worker count. If neither passes, no passing configuration is reported. No global optimum or cloud savings is claimed.

Two repetitions of five paired report/list requests measure foreground latency during background work. The relative contention check fails only when both repetitions exceed 1.50× baseline by more than 10 ms; mixed results remain inconclusive. This is an instrumented process-sharing experiment, not isolated CPU telemetry. Prior confirmed findings are retrieved only for the same repository and revision and are remeasured before reuse.

`PLAYWRIGHT_JOURNEYS=true` enables optional Chromium journey stages for the baseline, candidate and correction. The included CI workflow installs Chromium. The ordinary local report is HTTP-only unless this flag and browser runtime are supplied; browser results live in separately labeled evidence stages.

## Recovery

Queued runs are claimed with a database transaction. One global live lease permits one active run. Ownership renews every 3 seconds with a 30-second expiry. A new worker marks unfinished attempts interrupted and reruns their entire stage with fresh data. Completed stages are reused by stable attempt IDs. Stage failures retry at most twice in total. Runs have a 120-second execution budget. Cancellation is checked by the worker and before committing evidence; environments are closed in `finally` blocks. A retry never splices partial measurements into a completed experiment.

The in-memory event bus is used only by legacy incident examples; it is not the rehearsal durability mechanism.

## Deployment boundary

The local Hono API uses Node and libSQL. The Cloudflare app is a separate Worker with a deliberate D1 metadata adapter; it does not import the Node SQLite client or clone repositories in requests. Its public source catalog comes from the recorded fixture bundle. D1 stores fresh runs, checkpoints, findings and archived source snapshots. GitHub Actions executes the trusted fixture and posts authenticated checkpoints. Cancellation is polled by CI. A stale hosted run becomes interrupted after 15 minutes; automatic cross-CI redispatch is not implemented.

Fresh hosted runs are limited to baseline → allowlisted candidate → corrected; one workflow concurrency group, three queued/running requests and ten creations per UTC day. CI artifacts retain raw evidence for one day. D1 raw stage data expires after seven days; final reports and compact findings remain. Recorded bundled results remain available even when D1, Actions or Gemini is unavailable.

## Explicit limitations

- No arbitrary application startup/build support, k6 arrival-rate workloads or OpenTelemetry collector. Traces and SQL evidence come from explicit fixture instrumentation.
- The account workspace supports encrypted private-repository credentials and owner isolation on a single persistent Node/SQLite service. Horizontal scaling, outbound email verification/recovery and arbitrary remote executors are outside this implementation. Legacy anonymous connections are read-only.
- No semantic memory store or autonomous code repair. Users can edit and review source/workflows before creating a draft PR. Historical findings require revision applicability review. Confirmation is a human action, not a fabricated confidence score.
- Gemini free-tier behavior depends on the configured model/account and quota. No live Gemini verification is claimed without an available key.
- PostgreSQL, Chromium-in-CI and public Cloudflare/GitHub dispatch must be verified in the target environment. Local SQLite evidence does not prove PostgreSQL or production performance.
