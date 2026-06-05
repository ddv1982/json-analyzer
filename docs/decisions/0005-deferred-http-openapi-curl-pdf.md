# ADR 0005: Defer Axum/OpenAPI, curl execution, and PDF export

## Status

Accepted for MVP.

## Decision

Do not implement Axum routes, OpenAPI generation, generated clients, curl execution, async jobs, network guardrails, SQLite job storage, or PDF export for MVP.

## Consequences

- MVP focuses on the local desktop JSON-analysis slice.
- Source OpenAPI and curl/PDF code may be read as references only; they must not shape the MVP runtime.
- If browser/headless API compatibility is required after MVP, add HTTP as a thin adapter over `JsonAnalyzerService`.
- Curl and PDF work remain explicitly documented as deferred milestones.
