# Two-minute recruiter demo

1. Open `/demo` and select **Database connection exhaustion**.
2. Run the scenario. The API persists deterministic metrics, a log, trace-shaped evidence, fingerprinted alert, incident, agent steps, tool calls, hypotheses, and an approval-gated plan.
3. Pause at **Approval Required**. Explain that a tool is typed as mutating and cannot run from an LLM response alone.
4. Approve the remediation. The local simulator applies the action, verifies healthy baselines, resolves the alert and incident, writes an evaluation, and offers a Markdown postmortem.
5. Open the incident detail page to inspect its timeline, evidence, root cause, hypotheses, and remediation state.

## Resume-ready description

Built CodeLens, a local-first engineering platform that connects deterministic code/incident analysis to approval-gated remediation. Implemented typed domain events, fingerprint-based alert correlation, persisted evidence and agent tool-call workflows, deterministic incident replay/evaluation, SQLite/Drizzle storage, Hono APIs, React UI, and optional local Ollama inference—without requiring a paid API.

## Technologies actually used

| Technology | Why it exists |
| --- | --- |
| React, Vite, Tailwind, React Query | Product UI and synchronized data layer |
| Hono | Small typed HTTP API |
| SQLite + Drizzle | Zero-account local persistence and explicit schema |
| pnpm workspaces | Share contracts across applications |
| DemoProvider / Ollama | Cost-free deterministic demo and optional local inference |
| Docker Compose | One-command local stack |
| Prometheus, Grafana, Jaeger profiles | Optional local inspection, not a hosted dependency |

## Local vs. public-demo scope

The local stack contains writable replay state, approval/recovery execution against a simulator, SQLite, and optional Ollama. A future public deployment must remain read-only or deterministic, have strict request limits, and use only independently verified permanent free allowances. It must never claim to operate the full local observability stack unless it actually does.
