# ADR 0008: Guarded curl network execution

## Status

Accepted for post-parse Curl Executor parity.

## Context

Curl Executor parity requires outbound REST execution, but the desktop architecture remains Rust core/service logic behind Tauri 2 command IPC. The current app already supports curl parse/preview and guardrail validation without network execution, HTTP client dependencies, Tauri HTTP plugin permissions, or general frontend networking.

Network execution must be designed before adding any HTTP client dependency so that the permission boundary, job lifecycle, redaction rules, and resource limits are explicit.

## Decision

Implement Curl Executor network execution as Rust-owned service/executor behavior behind narrow Tauri commands.

- **Runtime boundary:** frontend code may request only app-specific curl operations through typed Tauri command wrappers. Do not expose a general frontend HTTP capability, raw browser `fetch` replacement, or arbitrary URL permission to the UI.
- **Command shape:** future execution commands must be narrow operations such as execute one parsed curl request, start/poll/cancel an in-memory job, and fetch bounded results. Tauri handlers stay thin adapters over `JsonAnalyzerService` and curl executor modules.
- **Dependency choice:** default to a Rust HTTP client in the core/service executor implementation when Item 16 starts. Do not add Tauri HTTP plugin dependencies or permissions by default. Add the Tauri HTTP plugin only if implementation proves a concrete platform requirement that the Rust service executor cannot satisfy, and document that follow-up decision before granting plugin permissions.
- **Jobs:** use in-memory jobs only. Do not add SQLite persistence, filesystem-backed job state, or durable request/response history for curl execution. Batch jobs may use bounded in-memory concurrency and must retain generic input-value metadata only for result traceability.
- **Batch model:** keep batch execution domain-neutral. Callers provide one curl command, an optional selected placeholder, and generic input values; the Rust service expands and validates generated requests before enqueueing. Job/result DTOs must not encode API-specific concepts.
- **Network guardrails:** keep private and sensitive network protections in Rust before dispatch. Private/internal network access is configurable and may be allowed by default for desktop REST workflows, but strict mode must still deny or explicitly guard requests to loopback, link-local, private RFC1918/RFC4193 ranges, multicast, unspecified addresses, and other sensitive local metadata/service ranges. Resolve and validate the final destination before connecting, and re-check redirect targets.
- **Timeouts and limits:** require bounded connect/request timeouts and bounded response-size capture. Return structured timeout/limit errors instead of streaming unbounded bodies into memory. Store only bounded previews/results in job state.
- **Redirect policy:** use a conservative redirect policy. Redirects must be capped, must preserve guardrail checks for each hop, and must not forward sensitive headers across origin changes.
- **Sensitive data:** redact sensitive request headers, auth tokens, cookies, API keys, and similar secrets from previews, logs, errors, job summaries, and UI-facing response metadata. Keep raw sensitive request material only as long as needed to execute the request in memory.
- **Cancellation:** cancellation is best-effort for in-flight network work and authoritative for queued/not-yet-started work. A canceled job reaches a terminal canceled state; subsequent polling must not restart it. Partial bounded results may be omitted or marked partial, but secrets remain redacted.
- **Tauri permissions:** adding execution commands requires updating the app-specific `json-analyzer-commands` permission list only for those commands. Do not grant shell, filesystem, opener, broad network, or Tauri HTTP plugin permissions as part of the default design.

## Consequences

- Curl execution can be added for desktop parity without changing the app into a browser/headless HTTP API or enabling general frontend networking.
- Security-sensitive behavior remains centralized in Rust, testable without the UI, and reusable by any future optional adapter.
- Item 16 must add HTTP dependencies only with the executor implementation and tests; Item 15 itself adds no dependency, command, permission, or UI behavior.
- If a future browser/headless API or Tauri HTTP plugin requirement emerges, it needs a separate ADR/update that explains why the Rust-owned executor boundary is insufficient.
