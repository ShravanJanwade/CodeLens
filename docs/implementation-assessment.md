# Repository and release platform assessment

The September 2026 starting workspace contains a React/Vite app, a Hono Node API, Drizzle/libSQL metadata, deterministic incident demos, GitHub cloning, heuristic static findings, source browsing and import edges. The workspace was already extensively modified; this implementation preserves the migration and legacy feature routes.

Confirmed gaps: indexing deletes previous source snapshots, counts files as symbols, blocks the API while cloning, and can show findings from unrelated revisions. Repository reads and mutations have no ownership gate. The default AI demo is unsuitable for runtime diagnosis. The frontend has an unconditional online indicator, intrusive onboarding and incident-first navigation. No real rehearsal executor or Gemini provider existed.

Implementation order: preserve revision snapshots and strengthen parsing/citations; integrate a repository-first responsive UI; add a fixed TaskForge executor with real HTTP/database evidence; persist attempts, leases, cancellation and findings; exercise unchanged/defective/corrected comparisons; provide recorded evidence and deployment instructions.

Reuse: existing repository and analysis tables (an analysis run is an index snapshot), React Query, shared visual primitives, Hono, Drizzle, authentication and AI interface. Add commit/coverage metadata and symbols to the existing index model. Add repository-linked rehearsal runs, stage attempts and validated findings. Separate the trusted fixture runner from any edge-hosted control plane.

Verification must distinguish local SQLite fixture measurements from PostgreSQL/container measurements. Never publish old simulated incident metrics as release evidence. Hosted arbitrary targets and shell output from AI are out of scope for the supported executor.
