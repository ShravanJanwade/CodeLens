# ADR-003: Evidence-first deterministic orchestration

## Decision

Use a persisted orchestrator workflow with focused metrics, logs, traces, deployment, dependency, root-cause, and remediation steps. The deterministic demo executes a fixed, inspectable tool sequence; local Ollama may provide interpretation only after deterministic evidence is collected.

## Rationale

This prevents an LLM from inventing operational facts, makes the recruiter demo reproducible, and leaves a measurable record for evaluation.
