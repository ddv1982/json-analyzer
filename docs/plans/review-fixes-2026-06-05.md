# Review Fixes: Plan

## Goal
Fix the latest review findings without broad refactors or public API/DTO/permission changes.

## Work Items

### Item 1 — Rust curl cancellation active-slot lifecycle
**Goal:** Prevent canceled-but-still-running curl jobs from freeing an active job slot before their worker exits.
**Done when:** `CurlJobManager` internally counts active workers separately from public terminal status; terminal pruning does not remove worker-active records; cancellation remains user-facing; regression proves canceled blocking jobs still consume `MAX_ACTIVE_JOBS` until released.
**Key files:** `src/curl/jobs.rs`, `tests/support/curl.rs`, `tests/curl/jobs.rs`
**Validation:** `cargo test --test curl jobs`, `pnpm run check:rust`
**Status:** [x] Added internal `worker_active` tracking and canceled active-slot regression; `cargo test --test curl jobs` and `pnpm run check:rust` passed.

### Item 2 — Browser mock curl guardrail/status parity
**Goal:** Align browser mock curl validation and guardrail decisions with Rust service/guard behavior, and map unsupported upload errors to 400.
**Done when:** `mockValidateCurlGuardrail()` rejects invalid methods and empty redirect targets; browser mock guardrail handles representative IPv4/IPv6 private/special ranges and redirect blocking; `unsupported_file_upload_option` maps to status 400; browser-mock tests cover these cases.
**Key files:** `frontend/src/lib/browser-mocks.ts`, `frontend/src/lib/browser-mocks.test.ts`
**Validation:** `pnpm --dir frontend test -- browser-mocks`, `pnpm run check:frontend`
**Status:** [x] Passed `pnpm --dir frontend test -- browser-mocks` and `pnpm run check:frontend`; no allow-private override test added because no frontend request override exists.

### Item 3 — Thin adapter/fallback coverage
**Goal:** Add missing coverage without changing production command APIs: Tauri cancel adapter forwarding and frontend dev/no-Tauri command fallback selection.
**Done when:** `src-tauri/src/commands/tests.rs` directly covers `cancel_curl_job_with_service()`; a focused frontend test proves command wrappers choose `browserMockInvoke()` in dev/no-Tauri mode rather than Tauri `invoke()`.
**Key files:** `src-tauri/src/commands/tests.rs`, `frontend/src/lib/commands.browser-fallback.test.ts` or `frontend/src/lib/commands.invoke.test.ts`
**Validation:** `cargo test --manifest-path src-tauri/Cargo.toml`, `pnpm --dir frontend test -- commands`
**Status:** [x] Added Tauri cancel adapter test and `commands.browser-fallback.test.ts`; `cargo test --manifest-path src-tauri/Cargo.toml`, `pnpm --dir frontend test -- commands`, and `pnpm run check:frontend` passed.

### Item 4 — Final validation
**Goal:** Verify the combined fix set after all targeted fixes land.
**Done when:** Targeted commands and full gate pass; blockers are recorded if any.
**Validation:** `cargo test --test curl jobs`, `cargo test --manifest-path src-tauri/Cargo.toml`, `pnpm --dir frontend test -- browser-mocks commands`, `pnpm check`, optional `pnpm tauri:build:no-bundle`
**Status:** [x] `cargo test --test curl jobs`, `cargo test --manifest-path src-tauri/Cargo.toml`, `pnpm --dir frontend test -- browser-mocks commands`, `pnpm check`, and `pnpm tauri:build:no-bundle` all passed.
