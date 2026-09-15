# ADR-002: Typed event boundary before a durable broker

## Status

Accepted.

## Decision

Publish typed domain events through an `EventBus` interface. Phase 1 uses `InMemoryEventBus`; future local workers may replace it with a durable adapter such as Redis Streams.

## Rationale

This establishes domain decoupling without adding operational complexity before workers exist. Each event includes an ID, correlation ID, causation ID, timestamp, and schema version to support tracing, idempotency, and replay.

## Consequences

The in-memory implementation does not survive a process restart and is deliberately not advertised as a queue. Workers must persist processed event IDs and use idempotent side effects when a durable transport is introduced.
