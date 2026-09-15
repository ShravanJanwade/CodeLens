# ADR-001: TypeScript monorepo with local-first persistence

## Status

Accepted.

## Decision

Use pnpm workspaces for `apps/web`, `apps/api`, `apps/extension`, and shared packages. Persist local domain state with SQLite and Drizzle. Retain the original Go/Python RAG code as legacy reference while the new platform is incrementally established.

## Rationale

The shared contracts avoid duplicated domain models, SQLite provides a zero-account local setup, and a modular API allows later workers and deployment adapters without discarding the existing extension.

## Consequences

SQLite is appropriate for the portfolio/local path but is not presented as a horizontally scalable production store. A future public read-only demo can use a compatible edge database adapter.
