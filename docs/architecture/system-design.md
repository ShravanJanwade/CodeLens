# System design discussion guide

## Flow

`Scenario → telemetry events → fingerprinted alert → incident → evidence-only investigation → approval → typed remediation → recovery verification → postmortem + evaluation`

The deterministic simulator makes this flow repeatable without paid infrastructure or a commercial LLM. API data is persisted in SQLite. The public demo may run the deterministic provider only; the full local mode may replace interpretation with Ollama.

## Failure and idempotency

Alert fingerprints use `scenario:<scenario-id>:<service-id>`. A firing alert with the same fingerprint returns the existing incident rather than creating another one. Once recovery is verified, the alert is resolved and the scenario may be replayed.

Domain events carry event ID, correlation ID, causation ID, and schema version. The current in-memory bus is intentionally local-only. A durable event adapter must persist processed event IDs and make all effecting handlers idempotent before it is used for production-style recovery.

## Safety

The agent cannot directly execute system commands. Tools are typed as read-only or mutating; the latter have a persisted remediation plan and require an approval transition. The unauthenticated approval endpoint exists only when `AI_PROVIDER=demo` and modifies only deterministic local state. The authenticated approval endpoint is the normal path.

## Scaling discussion

Replace SQLite with a database-backed cloud adapter for a read-only demo and replace the event bus with Redis Streams for durable consumers. Partition telemetry by service and time, bound event ingestion, and use idempotency keys for detection, remediation, and evaluation writes. Keep LLM calls behind the provider interface, cap steps/tool calls, and cache deterministic evidence queries.
