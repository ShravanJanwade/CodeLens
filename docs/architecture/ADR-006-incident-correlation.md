# ADR-006: Fingerprint-based incident correlation

## Decision

Use a stable service-and-scenario fingerprint to deduplicate active alerts into one incident.

## Rationale

It prevents alert storms and makes replay idempotent. A production implementation can extend the fingerprint with normalized labels and a temporal correlation window.
