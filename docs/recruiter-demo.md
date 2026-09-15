# A problem-first CodeLens demonstration

Start on `/`, signed out. Explain the problem: joining an unfamiliar codebase and reviewing a change usually means switching between source files, AI chat, build results, and deployment pages. CodeLens keeps the source revision and its evidence together so the next decision is easier to explain.

## A two-minute walkthrough without an account

1. Choose **Explore a real investigation**. This opens an actual recorded TaskForge run; show its timestamp and SQLite environment label.
2. Show the private-project journey returning 200 when 403 was required. Inspect the trace, then the repeated-query defect: 22 queries at page size 20, versus 2 in the baseline/correction.
3. Open Investigation. The smaller-page probe tests whether query count grows with issue count. Open its exact recorded source, which is available without login.
4. Open Experiments. A supplied correction is measured again. Show held-out results and any inconclusive timing checks, then export the report.

## Continue with your own repository

1. Sign in with email/password or GitHub. Connect GitHub from **Account & GitHub** to select accessible private repositories, or connect a public repository URL.
2. Choose a live branch and index it. Code opens automatically when the index completes. Show the immutable commit identifier and expandable folder tree.
3. Open a short function. Select text or click a line number and Shift-click another, then choose **Ask about lines**. Ask what it does or what to test before changing it. Show the provider, attached context, and clickable citations.
4. Open **File connections** to inspect imports and files that use the selected file. Open **Findings & review** to explain how a source warning becomes a code review task. A warning alone is not proof of a runtime defect.
5. Choose **Investigate**. Use the latest-commit/parent shortcut or pick a baseline and candidate. Follow **Choose revisions → Review changes → Checks & journeys → Decide next steps**. Open the real diff and matching CI jobs; missing CI is inconclusive.
6. Review the suggested action. Preview a small change or CI workflow in **Prepare a change**. Publishing a draft PR is an explicit reviewed action; do not publish to someone else's repository during a demonstration.
7. Return to the repository's **Investigations** tab to reopen the saved comparison. CI/CD monitoring adds repository-wide deployments, workflows, accessible security alerts and pull-request status. Signed webhooks require a publicly reachable deployment.

For a fresh measured example, open the TaskForge workspace → Releases → Run fresh rehearsal. Show the persisted stages, measurements and cancellation control. Arbitrary imported applications use their own GitHub CI tests; the built-in runtime executor is scoped to TaskForge.

Prepared defects are explicitly labeled. Never describe a recorded run as live, or a fixture observation as a universal production diagnosis.

## Resume statements supported by implementation

- Built a React/TypeScript repository-intelligence workspace with commit-scoped source snapshots, compiler-based JS/TS symbol extraction, partial import navigation and navigable source citations.
- Implemented a persisted release-rehearsal executor with idempotent run creation, leased worker ownership, checkpointed stage evidence, bounded retries and cancellation.
- Verified a prepared permission regression and measured a repeated-query defect: 22 SQL queries/request at page size 20, compared with 2 in the baseline and supplied correction, using actual local SQLite/HTTP instrumentation.
- Integrated a bounded Gemini investigator with deterministic fallback and a separate Cloudflare D1 / GitHub Actions deployment path for allowlisted fixture execution.

Do not add production scale, cost savings, deployment uptime, general repository execution or independently evaluated AI accuracy until those are actually measured.
