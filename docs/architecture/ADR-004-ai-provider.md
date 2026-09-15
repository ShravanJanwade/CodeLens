# ADR-004: Local Ollama plus deterministic demo provider

## Decision

The platform defaults to `DemoProvider`; `OllamaProvider` is optional and local.

## Consequences

The full project is runnable without a commercial model, API key, billing account, or network request. Public demos must disclose deterministic mode rather than imply live inference.
