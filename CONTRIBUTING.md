# Contributing

## Guardrails

- Preserve the locked MVP architecture: Rust core/service, Tauri 2 command IPC, Vite React TypeScript UI.
- Do not add Flask, Python runtime code, a backend localhost HTTP server, Axum/OpenAPI implementation, PDF export, SQLite persistence, or broad frontend/network capabilities unless a later plan explicitly changes scope.
- Curl network execution is accepted only under `docs/decisions/0008-curl-network-execution.md`: Rust-owned executor code behind narrow Tauri commands, no general frontend HTTP capability, in-memory jobs only, strict guardrails/limits/redaction, and Rust HTTP client dependencies in the core/service boundary only.
- Keep business logic in the Rust core/application service. Tauri commands should be thin adapters.
- Do not use `serde_json::Value` as the authoritative representation for duplicate-sensitive analysis. A duplicate-preserving AST is required before analyzers are ported.
- Treat committed fixtures in `tests/fixtures/golden` as starter behavior contracts. If source behavior is ambiguous, capture or document it before implementation.

## Phase workflow

1. Read the active plan in `docs/plans/`.
2. Work only on the requested phase.
3. Update or add fixtures when behavior is clarified.
4. Keep deferred work documented separately from MVP work.
5. Summarize validation performed and any blockers.

## Fixture rules

- Fixtures should include raw inputs and expected outputs or expected observations.
- If the source app cannot express target behavior, document the source limitation and the target contract in the fixture metadata.
- Prefer small, readable fixtures that can be loaded directly by Rust service/core tests later.
- Do not depend on live Flask, source HTTP/OpenAPI services, or live external curl endpoints for tests. Curl execution coverage must use mocked Rust executor/client contracts; guardrail/parser tests must remain deterministic and offline.

## Expected checks for MVP hardening

Use the committed root pnpm scripts:

```sh
pnpm frontend:install
pnpm check
```

`pnpm check` runs Rust format/lint/tests, frontend lint/typecheck/tests/build, and `src-tauri` tests. Keep this script current as parser, service, Tauri command, and frontend behavior changes.

Before release-oriented changes, also perform the manual MVP flow from `README.md` in Tauri dev where practical. For packaging smoke, prefer:

```sh
pnpm tauri:build:no-bundle
```

If that packaging smoke is blocked by platform dependencies, long downloads, or signing/bundling requirements, keep `pnpm check` passing and document the exact blocker.

## Permission/capability review

When touching Tauri config or dependencies, verify:

- `src-tauri/capabilities/default.json` still grants only `json-analyzer-commands` to the `main` window.
- `src-tauri/permissions/json-analyzer-commands.toml` lists only app-specific command IPC wrappers, including narrow curl parse/guardrail/execute/start/poll/cancel-style operations.
- `src-tauri/Cargo.toml` has no shell, filesystem, HTTP, opener, or network plugin dependencies unless a future plan explicitly requires them.
- Curl execution uses a Rust HTTP client in core/service executor code. Add Tauri HTTP plugin dependencies or permissions only after documenting why the Rust-owned executor boundary is insufficient.
- `src-tauri/tauri.conf.json` keeps CSP enabled for local scripts/styles/assets and Tauri IPC unless a documented platform blocker requires adjustment.
- Frontend components continue to use typed wrappers from `frontend/src/lib/commands.ts` instead of raw `invoke(...)` calls and must not expose general-purpose frontend HTTP access.
