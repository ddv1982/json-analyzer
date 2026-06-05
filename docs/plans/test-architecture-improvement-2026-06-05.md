# Test Architecture Improvement: Plan

## Goal
Restructure the repository's Rust and frontend tests so they stay easy to navigate, preserve existing behavior coverage, and support phased execution through the existing `pnpm check` gate. This is a test-architecture cleanup only: no production behavior changes and no broad fixture redesign unless required to split tests safely.

## Background
- The repository already treats testing as layered: golden source fixtures, Rust core tests, service tests, Tauri command smoke tests, and frontend tests were called out in the rewrite plan (`docs/plans/rewrite-json-analyzer-csv-align-stack-2026-06-02.md:310-344`). The current root gate matches that intent: `pnpm check` runs Rust fmt/clippy/tests, frontend lint/typecheck/test/build, and Tauri fmt/clippy/tests (`package.json:5-9`). CI delegates to `pnpm check` before the Tauri smoke build (`.github/workflows/ci.yml:18-53`, `.github/workflows/ci.yml:55-105`).
- Rust integration tests are currently valid but concentrated in a few large files: `tests/service.rs` is about 1,800 lines and combines service routing, config, DTO serialization, values, duplicates, errors, and parity contracts; `tests/curl.rs` is about 1,100 lines and combines parser, guardrail, executor, job manager, mocks, async polling, redirects, and redaction; `tests/analyzers.rs` is about 940 lines with direct analyzer contracts and large inline fixtures.
- `tests/curl.rs` has shared helper seams already suitable for extraction: `PARITY_CONTRACTS` is loaded at `tests/curl.rs:8`; job polling helpers live at `tests/curl.rs:919` and `tests/curl.rs:938`; mock clients live at `tests/curl.rs:978`, `tests/curl.rs:1015`, and `tests/curl.rs:1032`; `mock_response` lives at `tests/curl.rs:1044`. The first test starts with parser parity at `tests/curl.rs:10`, and guardrail tests continue later in the same file around `tests/curl.rs:1056`.
- Source-private Rust unit tests should not be moved just to satisfy file organization: private AST formatting/number internals are tested in `src/ast.rs:425`; the private curl response read-limit helper is tested in `src/curl/executor.rs:561`; `src/curl/jobs.rs:11-12` uses a test-only retention byte cap. Cargo integration tests can only exercise public APIs, so private-helper tests belong next to their implementation.
- Rust fixture policy already exists: `tests/fixtures/README.md:1-9` says golden files are data-only contracts and warns not to add runtime/helper surfaces just to consume them. CONTRIBUTING also treats `tests/fixtures/golden` as starter behavior contracts and requires ambiguous source behavior to be captured or documented before implementation (`CONTRIBUTING.md:10-25`).
- Frontend tests are also concentrated: `frontend/src/App.test.tsx` is about 1,488 lines and mocks every command wrapper at `frontend/src/App.test.tsx:38-69`, then defines shared config/fixture data starting at `frontend/src/App.test.tsx:71`. `frontend/src/lib/commands.test.ts` is about 601 lines and mixes command wrapper payload tests with browser mock contracts. `frontend/src/components/common/dropdown-primitives.test.tsx` is already a focused component test file.
- Frontend global setup is centralized in `frontend/src/test/setup.ts:1-74`: it installs jest-dom, Testing Library cleanup, localStorage and matchMedia mocks, theme helper `setMockPrefersColorScheme`, and reset logic. Vitest uses jsdom and this setup file (`frontend/vite.config.ts:10-13`).
- Browser/Tauri seams are split today: `frontend/src/lib/commands.ts:726-744` chooses browser mocks only outside test mode; app tests mock `./lib/commands` directly (`frontend/src/App.test.tsx:38-55`); command tests mock `@tauri-apps/api/core` directly (`frontend/src/lib/commands.test.ts:1-27`); `frontend/src/lib/browser-mocks.ts` is about 1,548 lines and combines command dispatch, JSON/value/duplicate/curl/config fake implementations, and fixture projection helpers.
- Official Rust/Cargo guidance: top-level files in `tests/` compile as separate integration-test crates; shared helpers can live in modules like `tests/common/mod.rs`; many integration-test crates can be slower, so a single top-level integration crate split into submodules is acceptable for larger suites. Reference: https://doc.rust-lang.org/cargo/reference/cargo-targets.html#tests
- Official Vitest guidance: default discovery includes `*.test.*` and `*.spec.*` files, and `setupFiles` run before test files. The current colocated frontend tests are compatible with default discovery. References: https://vitest.dev/config/include and https://main.vitest.dev/config/setupfiles
- Official Tauri v2 guidance: frontend tests can use `@tauri-apps/api/mocks`, especially `mockIPC`, and mocks should be cleared after each test. Reference: https://v2.tauri.app/develop/tests/mocking/

## Approach
Use a phased reorganization that moves tests before improving them. The order intentionally starts with `tests/curl.rs` because its helper seams are explicit and it can be validated with `cargo test --test curl`; this makes it a low-risk pilot before touching the larger `tests/service.rs` and frontend workflow suites.

Keep one top-level Rust integration test crate per existing domain (`tests/curl.rs`, `tests/service.rs`, `tests/analyzers.rs`) and split each into submodules via `#[path = "..."] mod ...;`. This preserves existing `cargo test --test <name>` workflows and avoids multiplying top-level integration crates. Each crate root should declare `mod support;`/domain modules once; nested modules should import helpers through `crate::support::...` and keep their own local `use` statements rather than relying on crate-root glob imports.

For frontend tests, extract a shared App test harness before moving workflow tests. Split files must import the harness rather than importing `App` directly so command mocks are installed before render. The harness should be the only module that imports `App`, installs `vi.mock('../lib/commands', ...)`, exports typed command mock handles, and provides `renderApp()` plus fixture/setup helpers. Keep `frontend/src/test/setup.ts` focused on global jsdom cleanup and environment mocks; put workflow-specific render/default-command helpers in the new harness.

Do not refactor production code, golden fixtures, or `browser-mocks.ts` implementation in this plan. `browser-mocks.ts` may receive focused tests, but splitting that large dev/mock implementation is a separate riskier cleanup. Do not add Tauri plugin permissions, frontend HTTP/fetch access, Flask/Python helpers, SQLite persistence, or new production seams to make test movement easier.

## Recommended Target Layout

The filenames below are the preferred shape for unattended execution. Implementers may adjust minor grouping if verbatim moves reveal a cleaner seam, but they should record any deviation in the PR summary and preserve the same domain boundaries.

### Rust integration tests
```text
tests/
  curl.rs
  curl/
    parser.rs
    guardrail.rs
    executor.rs
    jobs.rs
  service.rs
  service/
    validation_format_analysis.rs
    config_errors.rs
    values.rs
    advanced_duplicates.rs
    dto_serialization.rs
    parity_contracts.rs
  analyzers.rs
  analyzers/
    structure_statistics.rs
    duplicates.rs
    min_max.rs
    values.rs
    advanced_duplicates.rs
  support/
    curl.rs
    service.rs
    analyzers.rs
```

`tests/core_primitives.rs` stays as-is unless later evidence shows it needs splitting.

### Tauri tests
```text
src-tauri/src/
  commands.rs
  commands/tests.rs
```

### Frontend tests
```text
frontend/src/
  App.shell-theme.test.tsx
  App.analysis.test.tsx
  App.values.test.tsx
  App.curl.test.tsx
  test/
    setup.ts
    app-test-harness.tsx
  lib/
    commands.invoke.test.ts
    browser-mocks.test.ts
```

## Work Items

### Item 0 — Baseline and execution guard
**Goal:** Capture the current passing state and establish stop criteria before moving tests.

**Done when:** `pnpm check` passes before any split; baseline `cargo test -- --list`, `cargo test --manifest-path src-tauri/Cargo.toml -- --list`, and Vitest output counts are captured in implementation notes or the PR summary; implementation stops instead of reorganizing if the baseline is already red.

**Key files:** `package.json:5-9`, `.github/workflows/ci.yml:18-53`, `docs/plans/test-architecture-improvement-2026-06-05.md`

**Dependencies:** None

**Size:** S

**Validation:**
```sh
pnpm check
cargo test -- --list
cargo test --manifest-path src-tauri/Cargo.toml -- --list
pnpm -C frontend run test
```

### Item 1 — Rust curl split pilot
**Goal:** Split `tests/curl.rs` into focused modules using existing helper seams, without changing assertions or production visibility.

**Done when:** `cargo test --test curl` passes; `pnpm run check:rust` passes; curl test count is unchanged; helper types/functions are `pub(crate)` in test support only.

**Key files:** `tests/curl.rs`, `tests/curl/parser.rs`, `tests/curl/guardrail.rs`, `tests/curl/executor.rs`, `tests/curl/jobs.rs`, `tests/support/curl.rs`; helper sources at `tests/curl.rs:8`, `tests/curl.rs:919`, `tests/curl.rs:938`, `tests/curl.rs:978`, `tests/curl.rs:1015`, `tests/curl.rs:1032`, `tests/curl.rs:1044`

**Dependencies:** Item 0

**Size:** M

**Validation:**
```sh
cargo test --test curl
pnpm run check:rust
```

**Implementation notes:** Use `tests/curl.rs` as the integration-crate root and module declarations such as `#[path = "curl/parser.rs"] mod parser;`. Put curl mock clients and polling helpers in `tests/support/curl.rs`, declared from the crate root and imported by moved modules as `crate::support::...`. Move tests verbatim first; keep per-module imports explicit; only deduplicate imports after the moved suite passes.

### Item 2 — Rust service test split
**Goal:** Split `tests/service.rs` by service contract area while preserving every service-level assertion and fixture contract.

**Done when:** `cargo test --test service` passes; `pnpm run check:rust` passes; service test count is unchanged; golden fixtures remain data-only and are not reshaped.

**Key files:** `tests/service.rs`, `tests/service/validation_format_analysis.rs`, `tests/service/config_errors.rs`, `tests/service/values.rs`, `tests/service/advanced_duplicates.rs`, `tests/service/dto_serialization.rs`, `tests/service/parity_contracts.rs`, `tests/support/service.rs`, `tests/fixtures/README.md:1-9`

**Dependencies:** Item 1

**Size:** L

**Validation:**
```sh
cargo test --test service
pnpm run check:rust
```

**Implementation notes:** Move validation/format/analyze, config/error, Values Explorer, advanced duplicates, DTO serialization, and parity-contract groups into modules. Extract only shared constants and small assertion helpers after a verbatim module move passes.

### Item 3 — Rust analyzer test split
**Goal:** Split direct analyzer contracts into focused modules and extract repeated inline fixtures/assertion helpers where doing so reduces duplication.

**Done when:** `cargo test --test analyzers` passes; `pnpm run check:rust` passes; analyzer test count is unchanged; analyzer public APIs and fixture meanings remain unchanged.

**Key files:** `tests/analyzers.rs`, `tests/analyzers/structure_statistics.rs`, `tests/analyzers/duplicates.rs`, `tests/analyzers/min_max.rs`, `tests/analyzers/values.rs`, `tests/analyzers/advanced_duplicates.rs`, `tests/support/analyzers.rs`

**Dependencies:** Item 2

**Size:** M

**Validation:**
```sh
cargo test --test analyzers
pnpm run check:rust
```

### Item 4 — Tauri command test extraction
**Goal:** Move Tauri command tests out of `commands.rs` while preserving command/capability/permission alignment coverage.

**Done when:** `src-tauri/src/commands.rs` keeps command handlers unchanged and delegates tests with `#[cfg(test)] mod tests;`; `src-tauri/src/commands/tests.rs` contains the moved tests; Tauri tests pass; capability and permission assertions still cover the command list.

**Key files:** `src-tauri/src/commands.rs`, `src-tauri/src/commands/tests.rs`, `src-tauri/capabilities/default.json`, `src-tauri/permissions/json-analyzer-commands.toml`, `src-tauri/Cargo.toml`

**Dependencies:** Item 1. This item is parallelizable after the curl split; it does not need to wait for service/analyzer or frontend work.

**Size:** S

**Validation:**
```sh
cargo test --manifest-path src-tauri/Cargo.toml
pnpm run check:tauri
```

**Implementation notes:** Child test modules can access parent-private items through `super::...`; do not change command visibility just to move tests.

### Item 5 — Frontend App test harness extraction
**Goal:** Extract shared App workflow test mocks, fixtures, render helpers, clipboard setup, curl unlock helper, and `deferred<T>()` without moving tests yet.

**Done when:** Existing `frontend/src/App.test.tsx` uses `frontend/src/test/app-test-harness.tsx`; all current App tests still pass; `frontend/src/test/setup.ts` remains the global jsdom/environment reset layer.

**Key files:** `frontend/src/App.test.tsx`, `frontend/src/test/app-test-harness.tsx`, `frontend/src/test/setup.ts:1-74`, command mock seam at `frontend/src/App.test.tsx:38-69`, shared data at `frontend/src/App.test.tsx:71`

**Dependencies:** Item 0

**Size:** M

**Validation:**
```sh
pnpm -C frontend exec vitest run src/App.test.tsx
pnpm run check:frontend
```

**Implementation notes:** The harness should own command mock installation, the only `App` import used by split App tests, mocked command handles, default config/fixtures, `installClipboardMock()`, `setupDefaultAppMocks()`, `renderApp()`, `unlockCurlBatchMode()`, and `deferred<T>()`. Split test files should call harness APIs rather than importing `App` or recreating command mocks. Keep import order explicit so mocks are registered before `App` is imported/rendered.

### Item 6 — Frontend App workflow split
**Goal:** Move the large App suite into shell/theme, analysis, values, and curl workflow files using the shared harness.

**Done when:** `frontend/src/App.test.tsx` is removed or contains no tests; all moved tests pass; frontend lint/typecheck/test/build pass; timer cleanup remains reliable.

**Key files:** `frontend/src/App.test.tsx`, `frontend/src/App.shell-theme.test.tsx`, `frontend/src/App.analysis.test.tsx`, `frontend/src/App.values.test.tsx`, `frontend/src/App.curl.test.tsx`, `frontend/src/test/app-test-harness.tsx`

**Dependencies:** Item 5

**Size:** L

**Validation:**
```sh
pnpm -C frontend exec vitest run src/App.shell-theme.test.tsx src/App.analysis.test.tsx src/App.values.test.tsx src/App.curl.test.tsx
pnpm run check:frontend
```

**Implementation notes:** Move tests by workflow, preserving names first. Ensure split files import the harness and do not each recreate local command mocks or clipboard setup. Keep fake timer cleanup centralized or visibly duplicated only where necessary.

### Item 7 — Frontend command and browser mock test split
**Goal:** Separate Tauri command wrapper tests from browser mock contract tests.

**Done when:** `frontend/src/lib/commands.test.ts` is removed or fully replaced; wrapper tests mock `@tauri-apps/api/core`; browser mock tests call `browserMockInvoke` directly; frontend gate passes.

**Key files:** `frontend/src/lib/commands.test.ts`, `frontend/src/lib/commands.invoke.test.ts`, `frontend/src/lib/browser-mocks.test.ts`, `frontend/src/lib/commands.ts:726-744`, `frontend/src/lib/browser-mocks.ts`

**Dependencies:** Item 5. Prefer running after Item 6 if the same person is actively editing frontend tests, but it is technically parallelizable once the App harness exists because command-wrapper and browser-mock tests are mostly independent of App workflow files.

**Size:** M

**Validation:**
```sh
pnpm -C frontend exec vitest run src/lib/commands.invoke.test.ts src/lib/browser-mocks.test.ts
pnpm run check:frontend
```

**Implementation notes:** Keep wrapper payload/error-normalization assertions in `commands.invoke.test.ts`. Keep fixture-backed dev/browser behavior in `browser-mocks.test.ts`. Consider official Tauri `mockIPC` only for future app-level tests that exercise actual `invoke`; do not replace the direct command-wrapper mocks as part of this split unless needed.

### Item 8 — Final cleanup, documentation, and unattended gate
**Goal:** Remove orphan imports/files, update the plan or PR summary with the final layout, and verify the complete unattended gate.

**Done when:** `pnpm check` passes; `pnpm tauri:build:no-bundle` passes or a platform-dependency blocker is recorded; no production files changed except Tauri test-module extraction if performed; all moved tests remain deterministic/offline.

**Key files:** `docs/plans/test-architecture-improvement-2026-06-05.md`, all changed test files, `package.json:5-9`, `.github/workflows/ci.yml:18-53`

**Dependencies:** Items 1-7. Items 4 and 7 may complete earlier if run in parallel as noted above.

**Size:** S

**Validation:**
```sh
pnpm check
pnpm tauri:build:no-bundle
```

## Implementation Status
- [x] Item 0 — Baseline and execution guard: `pnpm check` passed before reorganization. Baseline counts captured: Rust 102 tests (`tests/curl.rs` 28, `tests/service.rs` 29, `tests/analyzers.rs` 21, `tests/core_primitives.rs` 8, `src/lib.rs` 16), Tauri 3 tests, frontend 3 files / 59 tests.
- [x] Item 1 — Rust curl split pilot: split into `tests/curl/{parser,guardrail,executor,jobs}.rs` plus `tests/support/curl.rs`; `cargo test --test curl` passed with 28 tests and `pnpm run check:rust` passed.
- [x] Item 2 — Rust service test split: split into planned `tests/service/` modules plus `tests/support/service.rs`; `cargo test --test service` passed with 29 tests and `pnpm run check:rust` passed.
- [x] Item 3 — Rust analyzer test split: split into planned `tests/analyzers/` modules plus `tests/support/analyzers.rs`; `cargo test --test analyzers` passed with 21 tests and `pnpm run check:rust` passed.
- [x] Item 4 — Tauri command test extraction: moved command tests to `src-tauri/src/commands/tests.rs`; Tauri list/test/check all passed with 3 tests.
- [x] Item 5 — Frontend App test harness extraction: added `frontend/src/test/app-test-harness.tsx`, updated `App.test.tsx` to use it, App tests passed with 33 tests and `pnpm run check:frontend` passed.
- [x] Item 6 — Frontend App workflow split: removed empty `App.test.tsx`, added four workflow suites, App split tests passed with 33 tests and full frontend gate passed with 59 tests.
- [x] Item 7 — Frontend command and browser mock test split: replaced `commands.test.ts` with `commands.invoke.test.ts` and `browser-mocks.test.ts`; focused lib tests passed with 19 tests and full frontend gate passed with 59 tests.
- [x] Item 8 — Final cleanup, documentation, and unattended gate: no orphan imports/files or stale active test-runner references required cleanup; `pnpm check` passed; `pnpm tauri:build:no-bundle` passed and built `src-tauri/target/release/json-analyzer-app`. Final counts observed: Rust 102 tests, Tauri 3 tests, frontend 7 files / 59 tests.

## Stop Criteria and Rollback
- Stop before reorganizing if the baseline `pnpm check` is red.
- Stop a phase if its focused command fails for reasons unrelated to moved imports/modules; keep the previous file intact and revert only that phase.
- Do not change production behavior, fixture semantics, Tauri permissions, or frontend HTTP/Tauri capability boundaries to make a test split easier.
- Preserve test names during moves so count/list diffs can catch accidental omissions.

## Open Questions
None blocking. The plan chooses curl before service because it is the lower-risk pilot, and chooses frontend harness extraction before workflow splitting to reduce Vitest mock-ordering risk.

## References
- Cargo test target layout: https://doc.rust-lang.org/cargo/reference/cargo-targets.html#tests
- Vitest test discovery: https://vitest.dev/config/include
- Vitest setup files: https://main.vitest.dev/config/setupfiles
- Tauri frontend IPC mocking: https://v2.tauri.app/develop/tests/mocking/
- Existing gate: `package.json:5-9`, `.github/workflows/ci.yml:18-53`
- Fixture policy: `tests/fixtures/README.md:1-9`, `CONTRIBUTING.md:10-25`
