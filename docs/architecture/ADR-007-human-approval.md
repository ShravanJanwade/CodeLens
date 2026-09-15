# ADR-007: Human approval for mutating remediation

## Decision

Persist remediation as `awaiting_approval` before executing. Only the approval transition may invoke a typed mutating tool; recovery is then verified and recorded.

## Consequences

The system favors operator control over automatic speed. The deterministic public-demo endpoint is explicitly restricted to demo mode and never controls an external service.
