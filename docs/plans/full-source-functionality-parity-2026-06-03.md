# Full Source Functionality Parity: Plan

## Goal

Define the remaining work required for `json-analyzer` to reach full user-visible functionality parity with `/Users/vriesd/projects/qa-toolbox/json-analyzer`, while preserving the target architecture: Rust core/service, Tauri 2 command IPC, Vite React TypeScript UI, no Flask/Python runtime, no default backend localhost server, and duplicate-key-preserving JSON analysis. Curl Executor outbound REST calls are in scope, but must be implemented as guarded Rust service behavior rather than general frontend network access.

The intended outcome is a staged execution plan that an implementation workflow can run phase by phase without rediscovering the source app surface area.

## Background

### Current target app seams

- Frontend command wrappers currently expose seven Tauri IPC operations: `validate_json`, `analyze_json`, `get_fields`, `find_duplicates`, `min_max_filled`, `get_config`, and `get_health` in `frontend/src/lib/commands.ts:6-15`; wrappers call `invokeCommand` in `frontend/src/lib/commands.ts:247-273`.
- The main UI currently imports and uses `validateJson`, `analyzeJson`, and `normalizeCommandError` in `frontend/src/App.tsx:2-16`, with validate/analyze handlers at `frontend/src/App.tsx:47-79`.
- Current result tabs cover dashboard, structure, statistics, fields, exact duplicates, and min/max in `frontend/src/App.tsx:20-28` and `frontend/src/App.tsx:218-236`.
- Tauri commands delegate to `JsonAnalyzerService` through command helpers in `src-tauri/src/commands.rs:21-100`; service state and handlers are registered in `src-tauri/src/main.rs:9-21`.
- Tauri capabilities currently allow only the JSON Analyzer command permission set in `src-tauri/capabilities/default.json:1-7`; allowed commands are listed in `src-tauri/permissions/json-analyzer-commands.toml:1-12`.
- `JsonAnalyzerService` owns the transport-neutral operation surface in `src/service.rs:23-92`; parsing/request validation flows through `src/service.rs:94-141`.
- The Rust parser preserves duplicate object keys by storing ordered object members in `src/parser.rs:121-150`; `parse_json` rejects trailing roots in `src/parser.rs:7-20`, while `parse_json_documents` provides explicit adjacent-root parsing in `src/parser.rs:26-43`.
- Implemented analyzers include structure (`src/analysis/structure.rs:59-73`), statistics (`src/analysis/statistics.rs:54-91`), field patterns (`src/fields.rs:18-43`), exact duplicates (`src/analysis/duplicates.rs:55-92`), field duplicates (`src/analysis/duplicates.rs:98-158`), and min/max filled (`src/analysis/minmax.rs:40-92`).
- Browser mocks are fixture-backed and cover all seven current commands in `frontend/src/lib/browser-mocks.ts:74-113`.
- Regression coverage exists in `tests/analyzers.rs`, `tests/core_primitives.rs`, `tests/service.rs`, and Tauri command tests in `src-tauri/src/commands.rs:116-274`.

### Existing parity decisions and deferred scope

- MVP architecture is locked as Rust core/service, Tauri 2 command IPC, and Vite React TypeScript UI; Flask/Python runtime and a backend localhost HTTP server remain out of the target runtime (`docs/plans/rewrite-json-analyzer-csv-align-stack-2026-06-02.md:17`, `README.md:3`, `CONTRIBUTING.md:5`).
- Duplicate-key preservation is an intentional target improvement over the source Python app, whose `json.loads` path collapses duplicate keys (`docs/plans/rewrite-json-analyzer-csv-align-stack-2026-06-02.md:66`, `docs/research/source-contract-notes.md:27`, `tests/fixtures/README.md:5`).
- Prior MVP exclusions explicitly deferred Axum/OpenAPI, curl execution, PDF export, SQLite job storage, advanced cache tuning, and advanced Values Explorer parity (`docs/plans/rewrite-json-analyzer-csv-align-stack-2026-06-02.md:26`, `README.md:213`, `CONTRIBUTING.md:6`).
- The existing backlog names MVP+ fixture needs for composite duplicates, advanced Values Explorer behavior, full OpenAPI route parity, curl behavior, PDF output shape, and optional Axum/OpenAPI adapter behavior (`docs/research/remaining-fixtures-backlog.md:20-26`).

### Source app functionality originally compared for parity

- Source frontend is a Next.js app with a home route, theme toggle, and Curl Executor link in `frontend/app/page.tsx:14-67`, plus a dedicated Curl Executor route at `frontend/app/tools/curl-executor/page.tsx:12-25`.
- Source Flask app serves static frontend routes and a catch-all in `json_analyzer/api/app.py:167-180`, and registers the `/api/v2` route surface in `json_analyzer/api/app.py:162-170`.
- Source HTTP API includes health/config/openapi/metrics routes in `json_analyzer/api/routes/health.py:55-116`; `openapi/openapi.yaml:9-364` enumerates the implemented route contract.
- Source app has problem-details errors, CORS, request IDs, logging, and schema validation hooks in `json_analyzer/api/app.py:70-145` and `json_analyzer/api/app.py:198-304`, with supporting modules `json_analyzer/api/problem.py` and `json_analyzer/api/request_id.py`.
- Source JSON input supports debounced validation, loading example JSON, formatting, clearing, and a “flatten nested arrays” option in `frontend/components/json-input/json-input.tsx:42-138` and `frontend/components/json-input/json-input.tsx:202-243`; backend analyze accepts `flatten` in `json_analyzer/api/routes/analysis.py:89-99`.
- Source analysis dashboard syncs tabs and Values Explorer state to URL query params in `frontend/components/analysis/analysis-dashboard.tsx:19-67` and `frontend/lib/url.ts:7-50`.
- Source Values Explorer is a major UI module in `frontend/components/analysis/values-explorer.tsx:84-434`, backed by hooks in `frontend/components/analysis/values-explorer/use-values-analysis.ts:101-410`.
- Values Explorer supports field discovery, multi-select up to max fields, filtering, sorting, pagination/page-size changes, and debounced value search in `frontend/components/analysis/values-explorer.tsx:140-355` and `frontend/components/analysis/values-explorer/use-values-analysis.ts:255-410`.
- Source duplicate analysis supports richer single-field duplicate output with all values and parent items in `json_analyzer/api/routes/analysis.py:102-140` and `json_analyzer/analyzers/duplicates.py:22-55`.
- Source composite/multi-field duplicate analysis validates 2–5 unique fields in `json_analyzer/api/routes/analysis.py:142-177`; frontend sends `field_paths` from `frontend/components/analysis/values-explorer/use-values-analysis.ts:101-113`.
- Source duplicate analysis supports filtering by another field/value through normalization in `json_analyzer/api/routes/analysis.py:33-61`, applied at `json_analyzer/api/routes/analysis.py:127-135` and `json_analyzer/api/routes/analysis.py:169-172`.
- Source duplicate PDF export is initiated from `frontend/components/analysis/values-explorer.tsx:236-267` and `frontend/components/analysis/values-explorer.tsx:413-423`, fetches all duplicate pages in `frontend/lib/api.ts:270-353`, shapes report data in `frontend/components/analysis/values-explorer/report-data.ts`, and generates PDFs in `frontend/components/analysis/values-explorer/report-pdf.ts`.
- Source Curl Executor includes a dedicated route, instructions, single curl execution, async polling, cancel/stop, bearer token extraction, batch mode, progress display, large-batch confirmations, result rendering, and copy actions across `frontend/components/curl-executor/*` and `json_analyzer/api/routes/curl.py:62-465`.
- Source curl backend internals include curl parsing in `json_analyzer/curl_parser.py:14-344`, network guardrails in `json_analyzer/infrastructure/network_guard.py`, job managers in `json_analyzer/services/batch.py`, `json_analyzer/services/single.py`, `json_analyzer/services/curl_jobs.py`, and SQLite persistence in `json_analyzer/infrastructure/sqlite_job_store.py`.
- Source config is consumed by both Curl Executor defaults and Values Explorer page sizes through `json_analyzer/api/routes/health.py:73-109`, `frontend/lib/api.ts:196-201`, `frontend/components/curl-executor/curl-executor-provider.tsx:110-128`, and `frontend/components/analysis/values-explorer/use-values-analysis.ts:371-410`.
- Source metrics endpoint and counters live in `json_analyzer/api/routes/health.py:115-116`, `json_analyzer/services/metrics.py:19-37`, and curl route instrumentation in `json_analyzer/api/routes/curl.py:81-157`.

### Follow-up decisions, research, and final parity outcome on 2026-06-03

- The user confirmed Curl Executor outbound REST calls should be possible, so guarded network execution is now in scope rather than an open decision.
- The user confirmed SQLite job persistence is not needed; curl jobs should be in-memory for the desktop app unless a later product requirement changes this.
- Source config is user-visible through frontend consumption: `/api/v2/config` returns pagination, limits, cache, curl defaults, and runtime values in `json_analyzer/api/routes/health.py:73-107`; the frontend caches config in `frontend/lib/api.ts:196-201`. Config parity remains in scope.
- Source metrics are diagnostics-only: `/api/v2/metrics` is exposed in `json_analyzer/api/routes/health.py:115-117`, generated by `json_analyzer/services/metrics.py:37-53`, and referenced by OpenAPI/generated client code, but no first-party frontend feature consumes it outside generated API types. Metrics should stay out of user-visible parity unless a diagnostics UI is later requested.
- Source OpenAPI is an HTTP contract for the Flask app (`openapi/openapi.yaml:1-90`), but desktop parity can map source operations to Tauri IPC. Recommendation: do not add Axum/OpenAPI for this plan; document it as a future optional adapter only if browser/headless API compatibility becomes a product requirement.
- Tauri 2 HTTP guidance shows the HTTP plugin can expose Rust-backed HTTP and JavaScript `fetch` with scoped URL permissions, but this app should avoid general frontend HTTP access. Implement curl execution in Rust-owned service modules called through narrowly scoped Tauri commands so parsing, guardrails, redaction, limits, jobs, and cancellation stay centralized. See <https://tauri.app/plugin/http-client/> and <https://v2.tauri.app/security/capabilities/>.
- Final Item 18 validation treats Items 1–10 and 12–17 as complete, Item 11 PDF export as intentionally deferred by product decision, and non-matched source behavior as documented scope boundaries: PDF export UI/download, SQLite curl persistence, HTTP/OpenAPI adapter/generated client, and metrics UI.

## Approach

Use staged expansion instead of a broad rewrite.

1. Lock behavior contracts and DTO shapes before adding UI surface area.
2. Keep business logic in Rust core/service modules.
3. Treat Tauri commands as thin adapters over `JsonAnalyzerService`.
4. Add frontend feature modules before the UI grows beyond the current single `App.tsx` structure.
5. Translate source `/api/v2` behavior into desktop-native Tauri command/service operations by default.
6. Keep HTTP/OpenAPI deferred; it is not required for desktop user-visible parity. If later required, it must be an optional adapter over the same service.
7. Implement Curl Executor outbound REST calls in Rust service code with explicit guardrails, limits, redaction, and in-memory jobs. Do not expose a general-purpose frontend HTTP capability.
8. Use desktop-local UI state for Values Explorer by default. Do not implement URL/query-param state unless a later decision explicitly asks for deep links or session restoration.

### Resolved decisions

1. **Curl network execution:** enabled for parity. Implement guarded outbound REST calls from Rust service code behind Tauri commands.
2. **Persistent curl job storage:** not needed. Use in-memory jobs for desktop execution and cancellation.
3. **HTTP/OpenAPI compatibility:** not recommended for this parity plan. Keep Tauri IPC as the desktop runtime boundary; reserve Axum/OpenAPI for a future optional adapter if browser/headless API compatibility becomes a product requirement.
4. **Metrics:** diagnostics-only. Do not add user-facing metrics work unless a later diagnostics feature asks for it.

## Work Items

### Item 1 — Contract and fixture expansion foundation

**Status:** Complete on 2026-06-03. Implemented `tests/fixtures/golden/full-source-parity-contracts.json`, updated the fixture backlog/README, and added a Rust regression that locks the Item 1 contract fixture.

**Goal:** Turn starter fixtures into full parity contracts for Values Explorer, advanced duplicates, PDF report data, curl behavior, config, and error shapes.

**Done when:**

- `tests/fixtures/golden/` contains source-derived or target-decided fixtures for Values Explorer field/value analysis, duplicate filtering, composite duplicates, parent item inclusion, pagination/sorting/search, PDF report input shape, curl parser examples, guardrail outcomes, and config values consumed by the frontend.
- `docs/research/remaining-fixtures-backlog.md` marks captured items complete or deliberately deferred.
- New fixtures are used by at least one Rust or frontend regression test before feature implementation depends on them.

**Key files/modules:** `tests/fixtures/golden/source-mvp-starter-fixtures.json`, new files under `tests/fixtures/golden/`, `docs/research/remaining-fixtures-backlog.md`, `tests/service.rs`, `tests/analyzers.rs`.

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Service DTO expansion for parity operations

**Status:** Complete on 2026-06-03. Added additive transport-neutral parity DTOs, public re-exports, and serialization-shape regressions while preserving existing command DTOs.

**Goal:** Define transport-neutral request/response DTOs for upcoming parity features before adding Tauri commands or UI.

**Done when:**

- `src/dto.rs` includes additive DTOs for values analysis, duplicate filtering, composite duplicate requests, pagination, PDF report data generation, expanded config, curl parse, curl execution, and in-memory curl job shapes. Metrics DTOs are not part of user-visible parity unless a later diagnostics feature requests them.
- `src/lib.rs` re-exports new public DTOs.
- Existing seven command DTOs remain backward-compatible.
- Serialization tests verify stable JSON shape for new DTOs.

**Key files/modules:** `src/dto.rs`, `src/lib.rs`, `src/error.rs`, `tests/service.rs`.

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Frontend module split without behavior change

**Status:** Complete on 2026-06-03. Split `frontend/src/App.tsx` into state, JSON input, analysis views, and common UI modules without adding new behavior or commands; review follow-ups moved sample data to a neutral module and refreshed header wording.

**Goal:** Prepare the UI for full parity by decomposing the current single-file MVP UI while keeping visible behavior unchanged.

**Done when:**

- `frontend/src/App.tsx` delegates to smaller components without changing the current MVP flow.
- Initial component directories exist for JSON input, analysis views, common UI, and shared state.
- Existing `App.test.tsx` still passes with only assertion updates required by markup movement.
- No new Tauri commands are introduced in this item.

**Key files/modules:** `frontend/src/App.tsx`, `frontend/src/styles.css`, new `frontend/src/components/**`, `frontend/src/App.test.tsx`.

**Dependencies:** None; best after Item 2 has DTO direction.

**Size:** Medium.

### Item 4 — JSON input UX parity

**Status:** Complete on 2026-06-03. Added debounced/manual validation, load example, duplicate-preserving Rust formatting, clear, and a pinned one-level analysis-only flatten option with command/permission/frontend mock/test coverage.

**Goal:** Add source-style input behaviors: debounced validation, load example JSON, format, clear, and flatten-nested-arrays analysis option.

**Done when:**

- UI supports debounced validation, manual validation, analysis, format, clear, load example, and a flatten nested arrays toggle.
- Service and DTOs support a pinned `flatten` analysis option: fixtures must define whether source parity means one-level list-of-lists flattening, recursive flattening, analysis-only flattening, or field-path normalization changes before implementation starts.
- Browser mocks and frontend tests cover the new controls.
- Strict single-root validation remains unchanged unless a fixture explicitly requires a different operation mode.

**Key files/modules:** `src/dto.rs`, `src/service.rs`, `src/json_ops.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `src-tauri/permissions/json-analyzer-commands.toml`, `frontend/src/lib/commands.ts`, `frontend/src/lib/browser-mocks.ts`, `frontend/src/components/json-input/**`, `frontend/src/App.test.tsx`, `frontend/src/lib/commands.test.ts`.

**Dependencies:** Items 2 and 3.

**Size:** Medium.

### Item 5 — Values Explorer core analyzer

**Status:** Complete on 2026-06-03. Added pure Rust Values Explorer field discovery/analysis over the duplicate-preserving AST with typed grouping, parent/source path metadata, search/sort/pagination, validation, and Rust regression coverage.

**Goal:** Implement Rust-side analysis for Values Explorer: field discovery, selected-field values, counts, source paths, parent records, filtering/search, sorting, and pagination.

**Done when:**

- A pure analyzer returns deterministic results from duplicate-preserving `JsonValue`.
- It supports field discovery plus selecting 1–5 fields, value counts, source paths, parent record summaries, source-compatible missing/null handling, search/filter, sort options, page, and page size. Fixtures pin row identity, stable sort tie-breakers, page index base, and whether field discovery is a separate service operation or part of values analysis.
- Tests cover sparse records, arrays, nested fields, duplicate keys, and pagination boundaries.

**Key files/modules:** an implementation-owned values analyzer module, `src/analysis/mod.rs`, `src/dto.rs`, `src/service.rs`, `src/lib.rs`, `tests/analyzers.rs`, `tests/service.rs`, `tests/fixtures/golden/**`.

**Dependencies:** Items 1 and 2.

**Size:** Large.

### Item 6 — Values Explorer service and Tauri IPC

**Status:** Complete on 2026-06-03. Added thin Values Explorer Tauri commands, registration, permissions, typed frontend wrappers, browser mocks, and command tests over the Item 5 service methods.

**Goal:** Expose Values Explorer through the existing service and Tauri command architecture.

**Done when:**

- `JsonAnalyzerService` has values-analysis methods.
- Tauri commands wrap those methods without business logic.
- Command permissions include the new commands and no unrelated plugin permissions.
- Frontend wrappers and browser mocks expose typed APIs.
- Tauri command tests verify delegation and permission list coverage.

**Key files/modules:** `src/service.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `src-tauri/permissions/json-analyzer-commands.toml`, `src-tauri/capabilities/default.json`, `frontend/src/lib/commands.ts`, `frontend/src/lib/browser-mocks.ts`, `frontend/src/lib/commands.test.ts`.

**Dependencies:** Item 5.

**Size:** Medium.

### Item 7 — Values Explorer frontend

**Status:** Complete on 2026-06-03. Added the Values Explorer tab/UI with local React state, field multi-select, value filtering, sort, pagination/page size, summaries, parent/source details, empty/error states, browser mock coverage, and review fixes for mock paging, empty-container discovery, duplicate-key path rendering, and combination guardrails. Duplicate launch controls are explicitly deferred to Items 8–9.

**Goal:** Add the source-level Values Explorer UI to the analysis workflow.

**Done when:**

- Results include a Values Explorer view.
- UI supports field multi-select, max field count, value search, duplicate/filter controls, sorting, pagination, page size, selected-field summaries, parent/source path display, empty states, and errors.
- State is desktop-local React state by default, not URL query state.
- Browser mock mode demonstrates the feature from fixtures.

**Key files/modules:** `frontend/src/components/analysis/values-explorer/**`, `frontend/src/components/analysis/**`, `frontend/src/lib/commands.ts`, `frontend/src/lib/browser-mocks.ts`, `frontend/src/App.test.tsx`, `frontend/src/styles.css`.

**Dependencies:** Item 6.

**Size:** Large.

### Item 8 — Advanced duplicate analysis core

**Status:** Complete on 2026-06-03. Added Rust advanced single-field and composite duplicate analyzers with filters, all-values summaries, parent items, duplicate-key-aware paths, pagination-compatible outputs, validation/guardrails, and regression coverage while preserving existing duplicate outputs.

**Goal:** Expand duplicate analysis to match source user-visible duplicate workflows.

**Done when:**

- Rust duplicate analysis supports single-field duplicates with all-values summary, parent item selection, filtering by another field/value, composite duplicate grouping for 2–5 unique fields, validation errors for invalid requests, and pagination-compatible output.
- Existing exact duplicate and basic field duplicate outputs remain backward-compatible.
- Tests cover duplicate-key AST behavior and source-derived composite/filter fixtures.

**Key files/modules:** `src/analysis/duplicates.rs`, optional new `src/analysis/duplicate_filters.rs`, `src/dto.rs`, `src/service.rs`, `src/lib.rs`, `tests/analyzers.rs`, `tests/service.rs`.

**Dependencies:** Items 1 and 5.

**Size:** Large.

### Item 9 — Advanced duplicate commands and UI integration

**Status:** Complete on 2026-06-03. Added advanced duplicate Tauri commands, registration, permissions, typed frontend wrappers, browser mocks, Values Explorer launch/filter controls, duplicate result rendering, and tests for single-field, composite, filtered, no-result, and error cases.

**Superseded note (2026-06-04):** The user-facing UI decision changed after this plan: Values now shows grouped-value duplicate insights, Duplicates is exact-only, and `AdvancedDuplicateWorkflow` is not mounted in either tab. The backend advanced duplicate commands remain available behind feature/config gates for non-user-facing service coverage unless a later plan reintroduces a UI.

**Goal:** Expose advanced duplicate workflows in the desktop UI and integrate them with Values Explorer.

**Done when:**

- Command wrappers support advanced duplicate requests.
- Values Explorer can launch duplicate analysis for selected fields.
- UI renders duplicate groups, all values, parent items, composite keys, filtered results, empty states, and errors.
- Tests cover single-field, composite, filtered, and no-result cases.

**Key files/modules:** `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `src-tauri/permissions/json-analyzer-commands.toml`, `frontend/src/lib/commands.ts`, `frontend/src/lib/browser-mocks.ts`, `frontend/src/components/analysis/values-explorer/**`, `frontend/src/components/analysis/duplicates/**`, `frontend/src/App.test.tsx`, `frontend/src/lib/commands.test.ts`.

**Dependencies:** Item 8.

**Size:** Large.

### Item 10 — PDF report data generation

**Status:** Complete on 2026-06-03. Added deterministic core/service report-data shaping for duplicate and Values Explorer reports with injected UTC/RFC3339 timestamp inputs, serializable report models, complete-result validation, and service regression coverage; no filesystem or frontend PDF export added.

**Goal:** Add deterministic report-data shaping for duplicate and Values Explorer exports.

**Done when:**

- Core/service can produce a serializable report data model from duplicate analysis results.
- Report data includes title, selected fields, filters, deterministic generated timestamp input, groups, counts, and rows needed by frontend PDF generation. Timestamp source, timezone, and formatting are injected/configured for reproducible tests.
- Tests validate report data shape from fixtures.
- No filesystem write permission is required by default.

**Key files/modules:** an implementation-owned report data module, `src/dto.rs`, `src/service.rs`, `src/lib.rs`, `tests/service.rs`, `tests/fixtures/golden/**`.

**Dependencies:** Item 8.

**Size:** Medium.

### Item 11 — PDF export frontend

**Status:** Deferred by product decision on 2026-06-03. PDF export is intentionally not included; partial frontend export UI, browser-download code, and report-data IPC exposure should remain removed. Item 10 core/service report-data generation remains complete and preserved.

**Goal:** Deferred. Do not match the source PDF export user flow unless a future product decision reopens export requirements.

**Done when:**

- No frontend PDF/export controls are shown in Values Explorer or duplicate results.
- No browser PDF generation/download code is included.
- Report-data core/service code remains covered by Item 10 tests without exposing new Tauri commands for frontend export.
- If native save dialogs, browser downloads, or filesystem APIs are reconsidered later, a separate product/permission decision is documented before implementation.

**Key files/modules:** `frontend/src/components/analysis/values-explorer/**`, `frontend/src/components/common/AppHeader.tsx`, `frontend/src/App.test.tsx`, `src/report.rs`, `src/dto.rs`, `src/service.rs`, `tests/service.rs`.

**Dependencies:** Item 10 remains complete; frontend export is deferred.

**Size:** Deferred.

### Item 12 — Feature config parity

**Status:** Complete on 2026-06-03. Expanded `get_config` with Values Explorer limits/page sizes, duplicate field/guardrail limits, curl defaults, max JSON bytes, and feature flags. Guarded single-request curl execution plus in-memory jobs, batch, and cancel are enabled by default; PDF export, HTTP/OpenAPI adapter, SQLite curl jobs, and metrics UI remain disabled/deferred feature flags. Values Explorer and Curl Executor consume config where practical, and tests cover defaults/mocks/wrappers/permissions.

**Goal:** Expose source-visible config values through the desktop service after Values Explorer, duplicate, and curl limits are known. Keep metrics diagnostics-only and out of user-visible parity.

**Done when:**

- `get_config` includes Values Explorer page sizes/limits, duplicate field selection limits, curl defaults if enabled, and max JSON bytes.
- UI consumes config instead of hardcoding relevant limits.
- Metrics remain out of scope.
- Tests verify config defaults and command permissions.

**Key files/modules:** `src/config.rs`, `src/dto.rs`, `src/service.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `src-tauri/permissions/json-analyzer-commands.toml`, `frontend/src/lib/commands.ts`, `frontend/src/lib/browser-mocks.ts`, `frontend/src/components/**`.

**Dependencies:** Items 2, 5, and 8.

**Size:** Medium.

### Item 13 — Curl parser core without network execution

**Status:** Complete on 2026-06-03. Added pure Rust curl tokenization/parsing and guardrail allow/deny validation with redacted auth previews, file-backed input rejection, service methods, and source-derived tests; no network execution, Tauri network permissions, UI, jobs, or SQLite added.

**Goal:** Add source-compatible curl command parsing and validation without executing network requests.

**Done when:**

- Rust core parses curl strings into method, URL, headers, body, auth token, and supported options.
- Guardrail validation model exists but reports allow/deny decisions only; it does not execute network requests.
- Tests cover source-derived curl parser fixtures and invalid inputs.
- No Tauri network permissions or execution dependencies are added.

**Key files/modules:** implementation-owned curl parser/guard modules, `src/dto.rs`, `src/service.rs`, `src/lib.rs`, `tests/service.rs`, new `tests/curl.rs`.

**Dependencies:** Items 1 and 2.

**Size:** Large.

### Item 14 — Curl Executor UI shell and parse/preview commands

**Status:** Complete on 2026-06-03. Added JSON Analyzer/Curl Executor navigation, parse/preview and guardrail Tauri commands/wrappers/mocks, Curl Executor preview UI with redacted auth/header/body display, copy/reset controls, and an execution state that became active in Item 16; no Tauri HTTP plugin or broad frontend HTTP/network permissions added.

**Goal:** Add the Curl Executor route/view with instructions, input, parsed preview, auth display, and a pre-Item 16 execution placeholder.

**Done when:**

- Frontend includes navigation between JSON Analyzer and Curl Executor.
- Curl Executor supports paste curl, parse/preview, method/URL/header/body display, safe bearer-token presence display, copy actions where browser-safe, and clear/reset.
- Execution buttons were hidden or disabled until the Item 15 security boundary was documented and the Item 16 execution command contract existed.
- Browser mocks and tests cover parser preview behavior.

**Key files/modules:** `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `src-tauri/permissions/json-analyzer-commands.toml`, `frontend/src/lib/commands.ts`, `frontend/src/lib/browser-mocks.ts`, `frontend/src/components/curl-executor/**`, `frontend/src/App.tsx`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`.

**Dependencies:** Items 2 and 13.

**Size:** Large.

### Item 15 — Curl network execution ADR and security boundary

**Status:** Complete on 2026-06-03. Added ADR 0008 and refreshed README/CONTRIBUTING to lock Rust-owned guarded curl execution behind narrow Tauri commands, no general frontend HTTP capability, in-memory jobs, guardrails/limits/redaction/cancellation, and Rust HTTP client dependency defaulting.

**Goal:** Lock the security design for guarded outbound REST execution before adding HTTP client dependencies.

**Done when:**

- An ADR documents the approved approach: Rust-owned HTTP execution behind Tauri commands, no general frontend HTTP capability, in-memory jobs only, private/sensitive network guardrails, timeout and response-size limits, redirect policy, sensitive header redaction, cancellation semantics, and Tauri permission impact.
- `README.md` and `CONTRIBUTING.md` reflect the accepted security posture.
- Dependency choice is documented. Recommended default: use a Rust HTTP client in service/executor code; only add Tauri HTTP plugin permissions if implementation proves they are necessary.

**Key files/modules:** new `docs/decisions/0008-curl-network-execution.md`, `README.md`, `CONTRIBUTING.md`, `Cargo.toml`, `src-tauri/Cargo.toml`.

**Dependencies:** Item 14.

**Size:** Small design checkpoint, high implementation impact.

### Item 16 — Curl single-request execution

**Status:** Complete on 2026-06-03. Added Rust-owned guarded single curl execution via `reqwest` blocking + rustls in core executor code, narrow `execute_curl` Tauri command/wrapper/mock/UI integration, bounded response previews, timeout/guardrail/redirect/redaction handling, and tests for parse errors, guardrail denial, timeout shape, mocked success, redirects, and sensitive-header stripping. Single-request execution is enabled by default; jobs/batch/cancel remain deferred.

**Goal:** Implement guarded single curl execution using the security boundary from Item 15.

**Done when:**

- Service can execute one parsed request with guardrails.
- Response includes status, headers, body preview, timing, body-size handling, timeout behavior, and structured errors.
- Sensitive request values are redacted in UI/log-like output.
- Tauri command wraps service execution.
- Tests cover guardrail rejection, timeout shape, parse errors, and successful mocked execution.

**Key files/modules:** `Cargo.toml`, `src/curl/executor.rs`, `src/curl/guard.rs`, `src/dto.rs`, `src/service.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `src-tauri/permissions/json-analyzer-commands.toml`, `frontend/src/lib/commands.ts`, `frontend/src/components/curl-executor/**`.

**Dependencies:** Item 15.

**Size:** Large.

### Item 17 — Curl async jobs, batch mode, polling, and cancel

**Status:** Complete on 2026-06-03. Added in-memory curl job manager, single async and batch jobs, polling, cancel/stop terminal states, aggregate progress/results, large-batch confirmation UI, narrow job Tauri commands/wrappers/mocks, config flags for jobs/batch/cancel, and review fixes for retained error redaction, race-free cancel tests, and config-gated UI. SQLite/durable persistence remains excluded.

**Goal:** Match source Curl Executor batch/job user experience.

**Done when:**

- Service owns an in-memory job manager suitable for desktop runtime.
- Supports single async jobs, batch execution, progress, polling, cancel/stop, large-batch confirmation in UI, and result aggregation.
- Cancellation leaves jobs in a terminal canceled state.
- No SQLite persistence is added; jobs are in-memory only.

**Key files/modules:** new `src/curl/jobs.rs`, new `src/curl/batch.rs`, `src/service.rs`, `src/dto.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `frontend/src/components/curl-executor/**`, `frontend/src/lib/commands.ts`, `tests/curl.rs`.

**Dependencies:** Item 16.

**Size:** Large.

### Item 18 — Final parity hardening and release checklist

**Status:** Complete on 2026-06-03. Final docs/checklist hardening is complete. `pnpm` was unavailable in the local environment (`zsh: command not found: pnpm`), so the documented npm/cargo equivalents were run: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `npm -C frontend run lint`, `npm -C frontend run typecheck`, `npm -C frontend run test`, `npm -C frontend run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`. `npm exec -- tauri build --no-bundle` failed only because `beforeBuildCommand` invokes missing `pnpm`; the equivalent smoke passed with a CLI-only override: `npm exec -- tauri build --no-bundle --config '{"build":{"beforeBuildCommand":"npm -C frontend run build"}}'`.

**Goal:** Validate the completed parity surface end to end.

**Done when:**

- `pnpm check` passes, or when `pnpm` is unavailable, the documented cargo/npm equivalent checks pass and the reason for substitution is recorded.
- `pnpm tauri:build:no-bundle` passes where platform dependencies are available, or an equivalent Tauri no-bundle smoke is run with the package-manager substitution documented.
- Manual smoke checklist covers JSON input UX, analysis tabs, Values Explorer, advanced duplicates, Curl Executor parse/preview, guarded single execution, async job polling/cancel, batch mode, and structured errors.
- PDF export is explicitly absent from the smoke path and documented as intentionally deferred by product decision; Item 10 report-data shaping remains tested but not exposed as frontend export.
- README documents all implemented parity features and intentional non-matched behavior: PDF export, SQLite curl persistence, HTTP/OpenAPI adapter/generated client, and metrics UI.
- This plan records intentionally deferred exclusions, including SQLite curl persistence, HTTP/OpenAPI adapter, metrics UI, and PDF export UI/download/native save behavior.

**Key files/modules:** `README.md`, `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `docs/plans/full-source-functionality-parity-2026-06-03.md`, all tests under `tests/` and `frontend/src/**.test.*`.

**Dependencies:** All selected implementation work items.

**Size:** Medium.

## Risks and Constraints

- **Command surface growth:** every new Tauri command must update Rust command registration, permissions, TypeScript wrappers, browser mocks, and tests atomically.
- **Curl execution security:** full Curl Executor parity requires outbound network capability. Keep execution Rust-owned, guarded, redacted, limited, cancellable, and exposed only through narrow Tauri commands.
- **PDF export behavior:** frontend PDF export/download/native save behavior is intentionally deferred by product decision. Item 10 deterministic report-data shaping remains covered in core/service tests only.
- **Frontend complexity:** split `App.tsx` before adding Values Explorer and Curl Executor to avoid an unmaintainable single component.
- **Duplicate-key behavior:** source fixtures may not express duplicate-key cases. Target decisions must continue to prefer duplicate-preserving AST semantics.
- **HTTP/OpenAPI parity:** adding Axum/OpenAPI by default would violate current architecture. Keep it deferred unless browser/headless API compatibility becomes a product requirement, and then make it optional and adapter-only.
- **Curl persistence:** source SQLite job storage is intentionally excluded; use in-memory jobs only.
- **Uncommitted baseline:** current repo status has no initial committed baseline; implementation agents should not assume a clean `HEAD` for diffing until the repo is committed.

## Open Questions

No current open questions block execution of this plan. The plan uses these defaults based on follow-up decisions and research:

- Curl Executor supports real guarded outbound REST calls through Rust-owned service code.
- Curl jobs are in-memory only; no SQLite persistence.
- Desktop Tauri IPC parity is sufficient; HTTP/OpenAPI remains a future optional adapter, not part of this plan.
- Metrics remain diagnostics-only and out of user-visible parity.
- PDF export UI/download/native save behavior is intentionally deferred; report-data shaping remains core/service-only.
- Values Explorer state is desktop-local React state; source URL/query-param state is not implemented unless a later deep-link/session-restoration plan asks for it.

## References

- Source app: `/Users/vriesd/projects/qa-toolbox/json-analyzer`
- Target app: `/Users/vriesd/projects/json-analyzer`
- Existing MVP rewrite plan: `docs/plans/rewrite-json-analyzer-csv-align-stack-2026-06-02.md`
- Source contract notes: `docs/research/source-contract-notes.md`
- Remaining fixtures backlog: `docs/research/remaining-fixtures-backlog.md`
- Tauri HTTP Client plugin: <https://tauri.app/plugin/http-client/>
- Tauri capabilities/security boundaries: <https://v2.tauri.app/security/capabilities/>
