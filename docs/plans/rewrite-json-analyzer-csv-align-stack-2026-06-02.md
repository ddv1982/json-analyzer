# JSON Analyzer Rewrite Plan

**Date:** 2026-06-02
**Target repo:** `/Users/vriesd/projects/json-analyzer`
**Source app:** `/Users/vriesd/projects/qa-toolbox/json-analyzer`
**Reference stack:** `/Users/vriesd/projects/csv-align`
**Status:** Draft plan, architecture decisions locked for MVP

## 1. Outcome

Rewrite the existing Flask + Next.js JSON Analyzer as a local-first desktop app with a Rust analysis core, Tauri command IPC, and a Vite + React + TypeScript UI.

The rewrite succeeds when a user can open the desktop app, paste JSON, validate it, run core analysis, inspect structure/statistics/fields/exact duplicates/basic min-max results, and trust the behavior against source-app golden fixtures.

## 2. Success Criteria

MVP is done when:

- The target repo builds and runs as a Tauri 2 desktop app.
- The Rust core preserves duplicate JSON object keys during analysis.
- The Rust application service exposes transport-neutral operations for:
  - `validate`
  - `analyze`
  - `get_fields`
  - `find_duplicates`
  - `min_max_filled`
  - `get_config`
  - `get_health`
- Tauri commands wrap the application service without starting a backend localhost HTTP server.
- The Vite React UI supports the primary JSON analysis flow.
- A minimal committed golden fixture set captured from the source app validates core behavior and user-visible DTOs.
- CI or a local `check` command runs Rust format/lint/tests, frontend lint/typecheck/tests/build, and a Tauri smoke build where practical.

## 3. Non-Goals for MVP

MVP intentionally does **not** include:

- Flask or any Python runtime in the target app.
- A desktop localhost HTTP API server.
- Axum routes, OpenAPI generation, or generated OpenAPI frontend clients.
- Curl execution, async curl jobs, network guardrails, or Curl Executor UI.
- PDF export.
- SQLite job storage.
- Advanced cache sizing/eviction tuning.
- Full Values Explorer parity for composite duplicates, scoped filtering, report-preview shaping, and advanced pagination/sorting.

These features are deferred so the rewrite can ship a correct JSON-analysis desktop slice first.

## 4. Locked Architecture Decisions

### Decision 1 — Use Rust for the target backend/core

Use Rust 2024 for the core analyzer and application service. Python is only a temporary source-app parity oracle while golden fixtures and behavior expectations are extracted.

**Rationale:** Rust gives a single native core for desktop packaging, strong type safety, and fast local analysis without preserving Flask as a runtime dependency.

### Decision 2 — Use Tauri 2 command IPC for MVP

Use Tauri commands as the desktop backend boundary. Commands call the Rust application service directly.

**Rationale:** The product is desktop-first. A localhost backend adds port, CORS, process, lifecycle, and security complexity without providing MVP value.

**Important distinction:** Tauri may use a Vite `devUrl` such as `http://localhost:5173` during development to load the frontend dev server. That is not a backend API server and must not be treated as the app runtime contract.

### Decision 3 — Keep Axum/OpenAPI optional and post-MVP

Do not scaffold Axum or generated OpenAPI clients in MVP. If browser/headless compatibility becomes a product requirement later, add Axum as a thin adapter over the same Rust application service.

**Rationale:** Axum is a good Rust HTTP routing library, but HTTP is not needed for the desktop MVP. Keeping it optional prevents contract-first complexity from leaking into the first build.

### Decision 4 — Use Vite + React + TypeScript for the UI

Port the frontend from Next.js to Vite React. Remove Next-specific routing, `next/link`, `next/navigation`, and `"use client"` assumptions.

**Rationale:** The app needs a rich desktop UI, not server-side rendering or Next API routes.

### Decision 5 — Preserve duplicate JSON object keys in the core AST

Do not use `serde_json::Value` as the authoritative analysis representation where duplicate object keys matter.

Use an explicit duplicate-preserving representation, for example:

```rust
enum JsonValue {
    Null,
    Bool(bool),
    Number(JsonNumber),
    String(String),
    Array(Vec<JsonValue>),
    Object(Vec<(String, JsonValue)>),
}
```

`serde_json` may still be used for DTO serialization and normalized command responses, but not for duplicate-sensitive analysis.

## 5. Research Notes Used for This Revision

- OpenAI's current GPT-5.5/prompt guidance was used as writing guidance for this plan: outcome-first goals, explicit success criteria, clear constraints, concise output shape, and stop rules. It is not an architecture authority for the app itself.
- The plan structure therefore keeps stable context first, separates dynamic/deferred scope, and avoids unnecessary implementation process detail where acceptance criteria are enough.
- Tauri 2 supports calling Rust commands from the frontend and accessing managed state through `tauri::State`.
- Tauri's Vite integration uses `beforeDevCommand`, `beforeBuildCommand`, `devUrl`, and `frontendDist` to connect the frontend build/dev server to the desktop shell.
- Axum is suitable as a modular HTTP router if a future HTTP adapter is needed, but it is not required for Tauri command IPC.

References are listed at the end of this document.

## 6. Target Architecture

```text
Vite React UI
   │
   │ typed frontend command wrappers
   ▼
Tauri 2 commands
   │
   │ direct Rust calls, managed app state
   ▼
JsonAnalyzerService
   │
   │ transport-neutral DTOs/errors/config
   ▼
Rust JSON analysis core
   │
   │ duplicate-preserving AST + analyzers
   ▼
Golden parity fixtures from source app
```

### MVP target layout

```text
/Users/vriesd/projects/json-analyzer
├── Cargo.toml
├── README.md
├── CONTRIBUTING.md
├── package.json              # root pnpm workflow scripts
├── src
│   ├── lib.rs
│   ├── ast.rs
│   ├── parser.rs
│   ├── service.rs
│   ├── dto.rs
│   ├── error.rs
│   ├── config.rs
│   ├── json_ops.rs
│   ├── validation.rs
│   └── analysis
│       ├── mod.rs
│       ├── structure.rs
│       ├── statistics.rs
│       ├── duplicates.rs
│       └── minmax.rs
├── src-tauri
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src
│       ├── lib.rs
│       ├── main.rs
│       └── commands.rs
├── frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src
│       ├── main.tsx
│       ├── App.tsx
│       ├── lib
│       ├── hooks
│       ├── components
│       └── styles
├── tests
│   ├── fixtures
│   ├── core
│   └── service
└── docs
    ├── decisions
    ├── research
    └── plans
```

### Post-MVP optional additions

Only add these if the product needs browser/headless API compatibility or deferred curl behavior:

```text
├── src/api                     # optional Axum adapter
├── openapi/source-v2-full.yaml # source reference only
├── openapi/openapi.yaml        # optional implemented HTTP contract
├── openapi/curl-extension.yaml # optional deferred curl contract
└── tests/api                   # optional HTTP adapter tests
```

## 7. Source Behavior to Preserve

The source app behavior should be migrated through golden fixtures and targeted parity tests, not by keeping Flask.

Preserve for MVP:

- Strict JSON validation for a single valid JSON root in the primary `validate` flow.
- Concatenated JSON handling where source fixtures prove it is user-visible. Define before implementation whether concatenated roots are accepted by `analyze`, rejected by `validate`, normalized into a document list, or surfaced as a warning/error.
- JSON size limit behavior, including error message shape and offset/position reporting where applicable.
- Complexity warnings as warnings, not hard failures.
- `safe_str` semantics:
  - `null` -> `"null"`
  - booleans -> lowercase strings
  - arrays/objects -> compact JSON generated from the duplicate-preserving AST
  - strings -> raw string
  - numbers -> source-compatible decimal string
- Numeric semantics: define `JsonNumber` representation, equality, ordering, integer/float display, and non-finite rejection before analyzer implementation.
- Flattened field paths with array index normalization to `[]`.
- Field labels, patterns, sample paths, categories, and counts.
- Structure analysis.
- Statistics analysis.
- Exact duplicate detection with explicit grouping key, object-order behavior, output ordering, and result limits.
- Basic field duplicate detection with explicit path scope, null/missing handling, array/object handling, and fixture examples.
- Basic min/max filled analysis with explicit comparable value rules, null/missing handling, tie behavior, output ordering, and no dataframe dependency.

Defer to MVP+:

- Composite duplicate grouping.
- Advanced Values Explorer filters/sorting/pagination/report preview.
- Full source OpenAPI route parity.
- Curl execution.
- PDF export.

## 8. Service Contract

The root Rust crate exposes a framework-free service:

```rust
JsonAnalyzerService::validate(ValidateRequest) -> Result<ValidateResponse, AppError>
JsonAnalyzerService::analyze(AnalyzeRequest) -> Result<AnalysisResponse, AppError>
JsonAnalyzerService::get_fields(GetFieldsRequest) -> Result<FieldPatterns, AppError>
JsonAnalyzerService::find_duplicates(FindDuplicatesRequest) -> Result<DuplicatesResponse, AppError>
JsonAnalyzerService::min_max_filled(MinMaxRequest) -> Result<MinMaxResult, AppError>
JsonAnalyzerService::get_config() -> Result<ConfigResponse, AppError>
JsonAnalyzerService::get_health() -> Result<HealthResponse, AppError>
```

The service owns:

- input validation
- JSON parsing
- analyzer dispatch
- response shaping
- serializable errors

Tauri commands should be thin wrappers around this service.

## 9. Error and Config Contract

Use a serializable `AppError` that can be returned by Tauri commands now and an optional HTTP adapter later.

Recommended shape:

```rust
struct ProblemDetails {
    error_type: String,
    title: String,
    status: Option<u16>,
    detail: String,
    instance: Option<String>,
}
```

For desktop config, prefer a typed app config loaded by the Rust service and managed through Tauri state. Do not rely on runtime environment variables as the primary desktop configuration mechanism.

Schema validation is deferred unless source fixtures prove it is required for the core MVP user flow. If it is reintroduced, represent it as typed config rather than ad hoc environment variables, for example:

```rust
struct ValidationConfig {
    schema_json: Option<String>,
    schema_path: Option<PathBuf>,
    enforcement: SchemaEnforcement,
}
```

## 10. Frontend Contract

The Vite frontend calls typed wrappers, not raw `invoke(...)` throughout components.

Example shape:

```ts
export async function analyzeJson(request: AnalyzeRequest): Promise<AnalysisResponse> {
  return invoke<AnalysisResponse>("analyze_json", { request })
}
```

Frontend MVP includes:

- JSON input.
- Validate/analyze flow.
- Loading, error, empty, and success states.
- Structure/statistics rendering.
- Field list rendering.
- Exact duplicates rendering.
- Basic min/max rendering.
- Local tab/state handling without Next.js. Do not preserve URL/search-param behavior unless deep links or session restoration become explicit MVP requirements.

Frontend MVP excludes:

- Curl Executor route.
- PDF export.
- Advanced Values Explorer parity.
- OpenAPI-generated client code.

Browser-only Vite development may use fixture-backed mocks, but Tauri dev is the authoritative integration path. Mock responses should come from golden fixtures when possible to avoid drift.

## 11. Testing Strategy

### Test levels

1. **Golden source fixtures**
   - Capture representative inputs and expected outputs from the source app before implementation drifts.
   - Store under `tests/fixtures`.

2. **Rust core tests**
   - Parser and AST behavior.
   - Duplicate-key preservation.
   - Flattening/path behavior.
   - Structure/statistics/duplicates/min-max analyzers.

3. **Service tests**
   - DTO shape.
   - Error shape.
   - Config behavior.
   - User-visible parity against golden fixtures.

4. **Tauri command smoke tests**
   - Command registration.
   - Basic command invocation.
   - Managed state initialization.

5. **Frontend tests**
   - Component rendering.
   - Core user flows.
   - Error/loading states.
   - Fixture-backed command mock behavior.

### Early quality gate

Add a local `check` command early. It should grow over time but start with:

```sh
cargo fmt --check
cargo clippy -- -D warnings
cargo test
pnpm -C frontend lint && pnpm -C frontend typecheck && pnpm -C frontend test && pnpm -C frontend build
cargo test --manifest-path src-tauri/Cargo.toml
```

## 12. Phased Work Plan

### Phase 0 — Plan and source capture

**Status:** Complete as of 2026-06-02. Added target workflow docs, ADRs, source contract notes, starter golden fixtures, and remaining-fixtures backlog.

**Goal:** Make the target plan executable and preserve source behavior before rewriting.

**Deliverables:**

- Clean README/CONTRIBUTING for target workflow.
- `docs/decisions` with short ADR-style notes for Rust, Tauri IPC, no localhost backend, Vite React, duplicate-preserving AST, deferred Axum/OpenAPI, deferred curl/PDF.
- `docs/research/source-contract-notes.md` summarizing source behavior and reference-stack observations.
- Minimal committed golden fixture set covering validation, duplicate keys, field paths, exact duplicates, and basic min/max.
- A remaining-fixtures backlog for MVP+ behavior.

**Acceptance criteria:**

- No MVP-blocking architecture questions remain.
- Deferred work is explicitly separated from MVP.
- Source behavior needed for MVP has committed starter fixtures, not only a capture plan.

### Phase 1 — Scaffold and early checks

**Status:** Complete as of 2026-06-02. Added Rust root crate, Vite React frontend, Tauri 2 shell with `get_health`, and `pnpm check`.

**Goal:** Create a runnable skeleton with early CI/local checks.

**Deliverables:**

- Rust root crate.
- Minimal Vite React app.
- Minimal `src-tauri` app.
- One smoke Tauri command, for example `get_health`.
- Local `check` command.

**Acceptance criteria:**

- `cargo test` passes.
- Frontend build passes.
- Tauri dev can launch the shell.
- No backend localhost API server is started.

### Phase 2 — Parser and core primitives

**Status:** Complete as of 2026-06-02. Added duplicate-preserving AST/parser, explicit concatenated-root parser, numeric semantics, compact serialization, `safe_str`, flattening, field patterns, ADR 0006, and fixture-backed primitive tests.

**Goal:** Implement the correctness foundation before higher-level analyzers.

**Deliverables:**

- Duplicate-preserving AST.
- Parser for strict JSON and explicitly defined concatenated JSON cases.
- `JsonNumber` representation and number formatting/comparison rules.
- Compact serialization from the duplicate-preserving AST.
- `safe_str`.
- Flattened path utilities.
- Field-pattern primitives.
- Golden parser/path fixtures.

**Acceptance criteria:**

- Duplicate object keys are preserved in tests.
- Object order, duplicate-key, path traversal, compact serialization, and numeric semantics are defined and tested.
- Core primitives pass source-derived fixtures.

### Phase 3 — Core analyzers

**Status:** Complete as of 2026-06-02. Added pure Rust structure/statistics/exact-duplicates/field-duplicates/min-max analyzers, ADR 0007 contracts, and analyzer tests.

**Goal:** Rebuild MVP analyzer behavior in Rust.

**Deliverables:**

- Structure analyzer.
- Statistics analyzer.
- Exact duplicate analyzer with documented grouping/output contract.
- Basic field duplicate analyzer with documented path/null/missing contract.
- Basic min/max filled analyzer with documented comparability/tie/output contract.

**Acceptance criteria:**

- Analyzer tests pass against golden fixtures.
- No analyzer depends on Tauri, Axum, or frontend code.
- No dataframe dependency is introduced for min/max.

### Phase 4 — Application service and errors

**Status:** Complete as of 2026-06-02. Added service DTOs, `JsonAnalyzerService` operations, serializable `AppError`, typed config, and service tests.

**Goal:** Expose analyzer behavior through stable transport-neutral DTOs.

**Deliverables:**

- `JsonAnalyzerService`.
- Request/response DTOs.
- Serializable `AppError`/ProblemDetails-like shape.
- Typed config model.

**Acceptance criteria:**

- Service tests pass against golden fixtures.
- DTOs are stable enough for Tauri and frontend wrappers.
- Config does not rely primarily on desktop runtime environment variables.

### Phase 5 — Tauri command integration

**Status:** Complete as of 2026-06-02. Added seven thin Tauri commands over managed `JsonAnalyzerService` state, narrow command capability/permission, frontend command wrappers, and command smoke tests.

**Goal:** Wire the desktop shell to the service.

**Deliverables:**

- Commands:
  - `validate_json`
  - `analyze_json`
  - `get_fields`
  - `find_duplicates`
  - `min_max_filled`
  - `get_config`
  - `get_health`
- Managed app state.
- Tauri capabilities/permissions limited to required commands.
- No shell, filesystem, or network plugin permissions in MVP unless a specific feature explicitly requires them.

**Acceptance criteria:**

- Commands call `JsonAnalyzerService` directly.
- Commands return typed success/error responses.
- Command smoke tests pass.
- Desktop app still does not start a backend HTTP server.

### Phase 6 — Frontend MVP

**Status:** Complete as of 2026-06-02. Added JSON input, validate/analyze workflow, dashboard result tabs, browser mocks, critical frontend tests, and wrapper-only command usage.

**Goal:** Restore the primary JSON analysis user experience.

**Deliverables:**

- JSON input and validation flow.
- Analysis dashboard.
- Structure/statistics views.
- Field list view.
- Exact duplicates view.
- Basic min/max view.
- Typed Tauri command wrappers.
- Fixture-backed browser mocks for development/tests.

**Acceptance criteria:**

- Core workflow works inside Tauri.
- Components do not call raw `invoke(...)` directly.
- No Next.js imports remain.
- Curl and PDF UI are absent or clearly disabled as deferred.

### Phase 7 — MVP hardening

**Status:** Complete as of 2026-06-02. Added numeric hardening, mock/service alignment, CSP, permission/capability tests, README hardening docs, and Tauri no-bundle package smoke validation. Follow-up completed on 2026-06-03: replaced the make-based workflow with root pnpm scripts.

**Goal:** Make the first release reliable enough to replace the source app for core JSON analysis.

**Deliverables:**

- Expanded golden fixtures.
- Regression tests for known source edge cases.
- Frontend critical-flow tests.
- Tauri packaging smoke check.
- Permission/capability review confirming no unnecessary shell, filesystem, or network plugin permissions.
- Documentation for install/run/check.

**Acceptance criteria:**

- Local `check` passes.
- MVP user flow passes manually in Tauri.
- Known MVP scope exclusions are documented.

## 13. Deferred Milestones

### MVP+ Values Explorer parity

Add after MVP:

- Composite duplicate grouping.
- Record-scope validation for composite fields.
- Advanced filters.
- Sorting.
- Pagination parity.
- Report-preview shaping.

### Optional HTTP/OpenAPI adapter

Add only if browser/headless API compatibility becomes a requirement:

- `src/api` Axum adapter.
- `/api/v2/*` routes for implemented operations.
- `openapi/openapi.yaml` for implemented HTTP routes.
- Optional generated TypeScript client.
- HTTP-specific tests.

Rules:

- Axum routes must call `JsonAnalyzerService`.
- HTTP must remain an adapter, not the source of business logic.
- Do not add curl paths to the implemented contract until curl behavior exists.

### Deferred curl execution

Add only after core JSON analysis is stable:

1. Curl parser parity without network execution.
2. Guardrails and sync execution.
3. Async jobs and cancellation.
4. Optional persistence.
5. Curl Executor UI.

### Deferred PDF export

Add after the core analysis UI stabilizes and export requirements are clear.

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Duplicate-key semantics are implemented too late | Core analyzer results may be wrong | Pin AST representation in Phase 2 before analyzers |
| MVP grows into full source parity | Rewrite stalls | Keep MVP and MVP+ lists separate; move advanced Values Explorer to MVP+ |
| OpenAPI/HTTP complexity returns early | Adds unnecessary runtime and tooling | Keep Axum/OpenAPI post-MVP only |
| Frontend mocks drift from Tauri behavior | Tests pass while app fails | Generate mocks from golden fixtures where possible |
| Source behavior is lost before migration | Parity becomes guesswork | Capture golden fixtures in Phase 0 |
| Tauri config/capabilities are added late | Desktop integration surprises | Scaffold Tauri in Phase 1, expand commands in Phase 5 |

## 15. Agent Execution Prompt

Use this prompt when asking an AI coding agent to implement a phase. It follows outcome-first structured prompt guidance: stable context first, dynamic task details last, explicit success criteria, and clear stop rules.

```xml
<role>You are a software engineering agent implementing the JSON Analyzer rewrite in /Users/vriesd/projects/json-analyzer.</role>

<goal>Implement the requested phase while preserving the locked architecture: Rust 2024 core/service, Tauri 2 command IPC, Vite React TypeScript UI, no backend localhost server for MVP, and duplicate-key-preserving JSON analysis.</goal>

<success_criteria>
- The requested phase deliverables are complete.
- Relevant tests/checks pass or any failures are explained with exact next steps.
- MVP boundaries are preserved; deferred Axum/OpenAPI/curl/PDF work is not implemented unless explicitly requested.
- Changes are summarized with files changed and validation performed.
</success_criteria>

<constraints>
- Do not add Flask or Python runtime code to the target app.
- Do not add a backend localhost HTTP server for MVP.
- Do not use serde_json::Value as the authoritative duplicate-sensitive analysis representation.
- Keep business logic out of Tauri command handlers and future HTTP adapters.
- Prefer small vertical slices that produce a runnable app.
</constraints>

<output>
Provide a concise summary, validation results, and any blockers or follow-up questions.</output>

<stop_rules>
Ask before expanding scope beyond the current phase. Stop and report if source behavior cannot be verified from fixtures or selected references.</stop_rules>

<dynamic_task>
Implement: [phase or work item]
Relevant files: [files]
Known fixtures/references: [fixtures or source references]
</dynamic_task>
```

## 16. References

- Source app: `/Users/vriesd/projects/qa-toolbox/json-analyzer`
- Target app: `/Users/vriesd/projects/json-analyzer`
- Reference stack: `/Users/vriesd/projects/csv-align`
- OpenAI GPT-5.5 latest model guide: https://developers.openai.com/api/docs/guides/latest-model
- OpenAI prompt guidance: https://developers.openai.com/api/docs/guides/prompt-guidance
- OpenAI prompt engineering guide: https://developers.openai.com/api/docs/guides/prompt-engineering
- Tauri calling Rust from frontend: https://tauri.app/develop/calling-rust/
- Tauri state management: https://tauri.app/develop/state-management/
- Tauri + Vite guide: https://tauri.app/start/frontend/vite/
- Axum README: https://github.com/tokio-rs/axum/blob/main/axum/README.md
