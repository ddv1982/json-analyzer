# Project Improvement Phases

Created: 2026-06-06

This tracks the implementation order for the project assessment plan. The intent is to reduce accumulated complexity before adding major capability, while preserving the strong Rust core and current command boundary.

## Phase 0: Baseline

Status: implemented

Implemented:

- `pnpm baseline` reports revision, worktree state, largest files, script inventory, and verification commands.
- Ignored Rust service performance tests cover large generated JSON and duplicate-heavy generated JSON.
- Initial opt-in baseline on 2026-06-06: large analyze 6812 ms, large values discovery 332 ms, large values analysis 145 ms, duplicate-heavy advanced duplicates 133 ms, duplicate-heavy composite duplicates 124 ms.

Operating commands:

- `pnpm baseline`
- `pnpm check`
- `cargo test --test service performance_baseline -- --ignored --nocapture`

Success criteria:

- Baseline output is captured before broad refactors.
- Large/pathological inputs have repeatable timing numbers.
- Normal test runs remain fast because performance tests are opt-in.

## Phase 1: Frontend Simplification

Status: implemented

Implemented:

- Split the broad stylesheet into ordered files under `frontend/src/styles/app/`, leaving `frontend/src/styles/app.css` as the cascade manifest.
- Split browser mock implementation out of the dispatcher into `analysis.ts`, `curl.ts`, `config.ts`, and `problem.ts`.
- Preserved `browserMockInvoke` and `mockValuesExplorerResponse` entrypoint exports for existing callers.
- Split `ValuesExplorerView.tsx` into a stateful controller plus values panels, glyphs, constants/types, and pure helpers.
- Split `CurlExecutorView.tsx` into a stateful controller plus response/job/error panels, constants/types, and pure helpers.

Target files:

- `frontend/src/styles/app.css`
- `frontend/src/lib/browser-mocks/index.ts`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`
- `frontend/src/components/curl-executor/CurlExecutorView.tsx`

Implementation order:

1. Split broad CSS into domain files or component-owned style modules while preserving the current theme contract.
2. Split browser mocks by command family: core JSON, values, duplicates, curl, shared fixtures/helpers.
3. Keep `browserMockInvoke` as the public API so callers and tests do not churn.
4. Split large views into controller hooks, table/list sections, toolbar/filter controls, and focused presentational components.
5. Add memoization only after profiling identifies a repeated expensive render.

Success criteria:

- Existing browser mock contract tests pass unchanged.
- Largest frontend modules shrink materially without behavioral changes.
- No new global state shape is introduced.

## Phase 2: Performance And Large JSON

Status: implemented

Implemented:

- Added opt-in Rust service performance baselines for large generated JSON and duplicate-heavy generated JSON.
- Added a frontend Values Explorer regression for large grouped result pagination and page-size rendering.
- Kept React profiling and result virtualization deferred until a measured slow interaction justifies the added complexity.

Implementation order:

1. Capture initial output from the opt-in Rust performance baseline.
2. Add focused frontend tests for large result pagination, loading states, and page-size behavior.
3. Use React Profiler only around expensive views and only in development/test paths.
4. Decide whether table virtualization, stricter caps, or smaller default result windows are needed based on measurements.

Success criteria:

- Performance regressions are visible before release.
- Large JSON and duplicate-heavy inputs do not create unexpected UI freezes.
- Result caps remain explainable from config and service behavior.

## Phase 3: Security And Reliability

Status: implemented

Implemented:

- Added curl redirect reliability coverage for relative same-origin redirects.
- Existing test coverage already checks private redirects, sensitive header stripping on cross-origin redirects, credential redaction, truncation, cancellation, timeout limits, and Tauri command capability scope.
- Re-audited Tauri capability scope: the default capability still grants only `json-analyzer-commands`; no shell, filesystem, HTTP, network, or broad Tauri plugin permissions are granted.
- Tightened the Tauri capability regression test so the allowed command list must exactly match the required command list, not merely contain it.
- Kept official Tauri IPC mocks as a future option only if the current command-wrapper/browser-mock tests start diverging.

Implementation order:

1. Audit Tauri capabilities and command permissions against current commands.
2. Keep curl guardrails authoritative in Rust.
3. Add regression tests for private redirects, credential redaction, malformed URLs, truncation, cancellation, and timeout limits.
4. Prefer official Tauri IPC mocks for frontend command-boundary tests where practical.

Success criteria:

- WebView command exposure stays minimal.
- Sensitive curl data is not persisted or rendered unredacted.
- Network execution remains constrained by explicit config.

## Phase 4: Product Polish

Status: partially implemented

Implemented:

- Browser smoke check on `http://127.0.0.1:5173/`: main app rendered, Analyze completed, Values tab opened, Values Explorer expanded, no console errors, no horizontal overflow in the checked viewport.
- Refactored the main Values Explorer and Curl Executor views without changing the visible workflow or adding new global state.

Remaining:

- Run the full desktop manual smoke checklist in packaged Tauri light and dark modes during the next release-candidate pass.
- Fix any packaged-app-only spacing, overflow, disabled-state, empty-state, loading-state, or error-copy issues found there.

Implementation order:

1. Run the desktop manual smoke checklist in light and dark modes.
2. Fix clipped text, overflow, confusing disabled states, empty states, loading states, and error copy.
3. Keep operational views dense and scannable.

Success criteria:

- Main workflows are understandable without explanatory in-app text.
- Desktop layout holds at common window sizes.
- Light and dark modes have clean contrast and spacing.

## Phase 5: Release Discipline

Status: implemented

Implemented:

- Added `pnpm run release:verify` for baseline, full check, and no-bundle Tauri build verification.
- Added `docs/releases/checklist.md` with release candidate verification steps and Linux package metadata validation.

Implementation order:

1. Keep release notes factual and tied to shipped changes.
2. Use planning/review docs only for ambiguous or risky work.
3. Standardize release checks: `pnpm check`, desktop smoke, package metadata validation, local install/package test.
4. Track deferred feature ideas separately from release-blocking work.

Success criteria:

- Releases are repeatable.
- Docs explain real decisions instead of accumulating planning noise.
- Deferred scope does not block small quality releases.
