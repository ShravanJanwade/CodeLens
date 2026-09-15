# ADR-005: Local-first, read-only public demo

## Decision

Keep the complete simulator, SQLite database, Ollama, and observability stack local. If deployed publicly, serve only a bounded, read-only deterministic demo using a provider with a verified permanent free allowance.

## Consequences

No cloud deployment is checked into this repository until the provider's current terms and no-billing safeguards are verified.
