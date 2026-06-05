# Target App UI Parity Overnight Implementation: Plan

## Goal
Implement strict target-app UX/functionality parity for the JSON Analyzer frontend in a phased run suitable for overnight orchestration. This plan supersedes `docs/plans/minimal-target-like-ui-2026-06-03.md`: the target app is now the baseline for visible information architecture, workflow ownership, and product copy, while this repo keeps its Vite/React/TypeScript frontend, native CSS, Tauri command IPC, typed wrappers, light/dark/system theme contract, and accessibility behavior.

## Background
- Investigation report `docs/investigations/target-app-ui-parity-2026-06-04.md` concludes the mismatch is structural, not CSS-only: current UI exposes MVP/deferred-scope header text, seven result tabs, dashboard-first results, input-owned analyze/status flow, split Values/Duplicates workflow, and capability-oriented Curl copy.
- The prior minimal UI plan is explicitly superseded because it treated target references as density/visual inspiration instead of parity requirements (`docs/plans/minimal-target-like-ui-2026-06-03.md`).
- Target main page uses a compact two-column shell: `JSON Analyzer`, subtitle `Validate JSON and explore statistics, values and duplicates.`, top-right `Curl Executor` action and theme toggle, JSON input left, analysis dashboard right (`/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/app/page.tsx:25-63`).
- Current shell/header seams are `frontend/src/App.tsx:9-56` and `frontend/src/components/common/AppHeader.tsx:21-61`; current header renders `Local-first desktop MVP`, dynamic title/lede, two nav buttons, and a visible scope note about PDF deferral, guarded Rust execution, and in-memory jobs.
- Target JSON input owns edit/validation utilities: `JSON Input`, `Ready for input` / `Valid JSON` / `Invalid JSON`, invalid JSON callout, flatten checkbox, and `Load Example`, `Format`, `Clear` actions (`target frontend/components/json-input/json-input.tsx:140-243`). Current `JsonInputPanel.tsx:45-99` has equivalent primitives but exposes `Validate JSON` and `Analyze JSON` in the input card.
- Target analysis owns primary analysis state/actions: `idle`, `analyzing`, `success`, `error`, plus `Analyze JSON`, `Try Again`, `Re-analyze`, and clear/close results (`target hooks/use-analysis-state.ts:6-87`, `target analysis-dashboard.tsx:85-122`, `analysis-empty-state.tsx:26-45`, `analysis-error-state.tsx:28-45`, `analysis-results.tsx:38-90`). Current `useJsonAnalyzerState.ts:12-32` defaults `activeTab` to `dashboard`, and `analyzeInput()` resets to dashboard at `useJsonAnalyzerState.ts:153-167`.
- Current result IA is centralized in `frontend/src/state/useJsonAnalyzerState.ts:12-22`, `frontend/src/components/analysis/AnalysisResultsPanel.tsx:7-15`, and `frontend/src/components/analysis/ResultView.tsx:11-36`. Current top-level tabs are `Dashboard`, `Structure`, `Statistics`, `Fields`, `Values Explorer`, `Exact duplicates`, and `Min/max filled`; target top-level tabs are exactly `Statistics`, `Values`, `Duplicates`.
- Current `AnalysisResponse` already carries data that can be re-homed without backend schema changes: `structure`, `statistics`, `fields`, `exact_duplicates`, and `min_max_filled` (`frontend/src/lib/commands.ts:128-134`).
- Current Values Explorer is an independent command-driven state island (`ValuesExplorerView.tsx:21-67`, `148-190`, `263-292`) with field discovery, grouped values, filters, pagination, and duplicate commands. Target Values Explorer is a sectioned workflow: collapsed entry, field selection, filter controls, sort, summary metrics, duplicate/results panels, and bottom actions (`target values-explorer.tsx:84-87`, `283-427`; `filter-controls.tsx:41-87`; `results-summary.tsx:31-90`; `results-panels.tsx:52-119`).
- Current Curl Executor is an in-app view with feature/config/job architecture copy (`frontend/src/components/curl-executor/CurlExecutorView.tsx:277-789`). Target Curl Executor is a task route ordered as Header, Instructions, Curl Command, Batch Progress, Error, Results, with copy centered on executing Postman curl commands, bearer-token gating, batch mode, progress, and response tabs (`target app/tools/curl-executor/page.tsx:12-22`, `target components/curl-executor/header.tsx:13-22`, `instructions.tsx:15-72`, `curl-command-section.tsx:44-170`).
- Visible-copy and test seams are concentrated in `AppHeader.tsx`, `ThemeToggle.tsx`, `StatusPanels.tsx`, `JsonInputPanel.tsx`, `CurlExecutorView.tsx`, and `frontend/src/App.test.tsx:448-1294`.
- Accessibility constraints are hard constraints: preserve `AnalysisResultsPanel.tsx:17-68` tab roles/IDs/keyboard behavior, dropdown/combobox focus and ARIA semantics in `MultiSelectDropdown.tsx` and `ComboboxSelect.tsx`, visible focus, disabled states, loading/error/status announcements, and theme attributes/bootstrap/CSP validation.

## Approach
Sequence the implementation as information architecture first, workflow ownership second, target-copy cleanup third, CSS polish last. Do not try to “style around” the current seven-tab/dashboard-first/input-owned analysis model; that preserves the wrong UX.

The overnight implementation should run as a verify-then-dispatch sequence, not broad parallel edits to overlapping files. Each phase has a validation gate so drift is caught early. UI tests that assert old visible copy or seven-tab behavior should be updated; tests that protect theme, accessibility, command payloads, and Tauri wrapper behavior should keep their intent.

### Non-negotiable constraints
- No Tailwind, shadcn, Radix, or component-library migration.
- No localhost backend or frontend HTTP API.
- No Rust DTO/schema changes unless a separate backend plan justifies them.
- No raw Tauri `invoke` from components; keep typed wrappers in `frontend/src/lib/commands.ts`.
- Do not remove functional/status/error/security/accessibility-critical copy; remove or re-home implementation/deferred-scope/project-status copy.
- Preserve `data-theme-preference`, `data-theme`, `colorScheme`, inline bootstrap behavior, and CSP hash validation.

### Stop / raise conditions
Stop and report instead of pushing through if any phase appears to require:
- backend schema or Rust command changes,
- weakened curl guardrails/redaction/feature gating,
- broken tab/dropdown/combobox keyboard behavior,
- changed theme bootstrap without matching CSP validation updates,
- hiding functional warnings/errors/statuses to match visuals,
- target behavior that conflicts with this repo’s Tauri/Rust architecture.

## Visible Copy Inventory

| Component/file | Current copy | Classification | Plan |
|---|---|---|---|
| `AppHeader.tsx` | `Local-first desktop MVP` | Remove | Not target product UI. |
| `AppHeader.tsx` | dynamic JSON/Curl ledes | Replace | Use target product subtitles. |
| `AppHeader.tsx` | PDF/Rust/in-memory scope note | Remove from UI | Keep in docs/diagnostics only. |
| `ThemeToggle.tsx` | `Using {theme} colors` | De-emphasize / accessible-only | Preserve theme accessibility, reduce chrome. |
| `JsonInputPanel.tsx` | `Input` / `JSON input` | Replace | Use `JSON Input`. |
| `JsonInputPanel.tsx` | `Ready` | Replace | Use `Ready for input`. |
| `JsonInputPanel.tsx` | `Validate JSON` visible button | Remove from product UI | Keep validation behavior/status. |
| `JsonInputPanel.tsx` | `Analyze JSON` visible button | Move | Results panel owns analyze action. |
| `JsonInputPanel.tsx` | flatten help paragraph | Shorten | Keep functional meaning. |
| `StatusPanels.tsx` | browser mock / Tauri wrapper copy | Remove from product UI | Dev-only if retained. |
| `AnalysisResultsPanel.tsx` | dashboard-first / seven tabs | Replace | Target results state + three tabs. |
| `ValuesExplorerView.tsx` | backend-mode duplicate copy | Replace | Product terms: fields, filters, values, duplicates. |
| `ValuesExplorerView.tsx` | selection/filter/page warnings | Keep | Functional/status-critical. |
| `CurlExecutorView.tsx` | Rust/job/config capability copy | Replace/remove | Task-oriented curl workflow. |
| `CurlExecutorView.tsx` | redaction/security indicators | Keep | Security-critical. |
| `CurlExecutorView.tsx` | disabled feature messages | Keep but de-emphasize | Functional state. |

## Implementation Progress
- [x] Items 1–4 / Block 1 — Header/product toolbar, analysis ownership, and three-tab result IA implemented. Validation: `npm run validate:csp`, `npm run typecheck`, and `npm test -- src/App.test.tsx src/components/common/dropdown-primitives.test.tsx` passed from `frontend/`.
- [x] Items 5–6 / Block 2 — Values workflow and Duplicates tab target parity implemented. Validation: `npm run typecheck`, `npm test -- src/components/common/dropdown-primitives.test.tsx`, `npm test -- src/App.test.tsx`, and combined targeted tests passed from `frontend/`.
- [x] Item 7 / Block 3 — Curl Executor target task flow implemented. Validation: `npm run typecheck`, `npm test -- src/App.test.tsx`, and `npm test -- src/lib/commands.test.ts src/App.test.tsx` passed from `frontend/`.
- [x] Items 8–9 / Block 4 — CSS parity polish, full validation, package-readiness complete. Validation reported by block agent and re-run by orchestrator: frontend `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and root `pnpm check` passed.

## Work Items

### Item 1 — Lock direction, classify tests, and set the implementation ledger
**Goal:** Make this plan the active source of truth and prevent the overnight run from preserving stale UI behavior just because tests currently encode it.

**Done when:** The implementation run treats `docs/plans/target-app-ui-parity-overnight-implementation-2026-06-04.md` as active and `docs/plans/minimal-target-like-ui-2026-06-03.md` as superseded. `frontend/src/App.test.tsx` expectations are categorized before edits: stale UI assertions to update, protective theme/accessibility/command assertions to preserve, and new target-baseline assertions to add.

**Key files:** `docs/plans/target-app-ui-parity-overnight-implementation-2026-06-04.md`, `docs/plans/minimal-target-like-ui-2026-06-03.md`, `frontend/src/App.test.tsx`, `frontend/src/components/common/dropdown-primitives.test.tsx`.

**Dependencies:** None.

**Size:** Small.

**Validation gate:** No code validation required yet, but the implementation agent should record which tests are stale versus protective before editing test assertions.

### Item 2 — Replace header/app shell chrome with target product toolbar
**Goal:** Remove project/status/architecture chrome from the main UI and align the shell with the target app’s compact product header.

**Done when:** JSON Analyzer header shows target product title/subtitle, one contextual `Curl Executor` action, and theme toggle. Curl view shows reciprocal `JSON Analyzer` action and target-like Curl heading/subtitle. Visible `Local-first desktop MVP`, PDF deferral, Rust service, and in-memory job scope note are gone from product UI. `App.tsx` can keep local `activeView`; no router migration is required.

**Key files:** `frontend/src/App.tsx:9-56`, `frontend/src/components/common/AppHeader.tsx:21-61`, `frontend/src/components/common/ThemeToggle.tsx`, `frontend/src/styles.css:205-345`, `frontend/src/App.test.tsx:448-499`.

**Dependencies:** Item 1.

**Size:** Medium.

**Validation gate:** From `frontend/`: `npm run validate:csp`, `npm run typecheck`, and targeted app/theme tests. Manual smoke: JSON ↔ Curl navigation, light/dark/system header, no visible MVP/PDF/Rust/job architecture copy in header.

### Item 3 — Move analysis ownership from input card to results panel
**Goal:** Make JSON input focus on editing/validation utilities while results owns analyze, loading, error, success, re-analyze, and clear-results flow.

**Done when:** `JsonInputPanel` renders target input copy/status and only input utility actions (`Load Example`, `Format`, `Clear`, flatten). Visible `Validate JSON` and `Analyze JSON` are removed from the input card. `AnalysisResultsPanel` receives analysis state/action props and renders idle/loading/error/success states with `Analyze JSON`, `Try Again`, `Re-analyze`, and clear/close results. Clearing results does not clear JSON input. Invalid JSON is visible in input and reflected in results error state when analysis is attempted.

**Key files:** `frontend/src/state/useJsonAnalyzerState.ts:12-180`, `frontend/src/components/json-input/JsonInputPanel.tsx:45-99`, `frontend/src/components/analysis/AnalysisResultsPanel.tsx:20-131`, `frontend/src/components/common/StatusPanels.tsx`, `frontend/src/App.tsx:24-52`, `frontend/src/App.test.tsx:503-529`.

**Dependencies:** Item 2.

**Size:** Large.

**Implementation notes:** Use an explicit state ownership contract rather than broad shared error state. Recommended shape: `inputError: ProblemDetails | null`, `analysisError: ProblemDetails | null`, `busyAction: 'format' | 'validate' | 'analyze' | null`, `isAnalyzing: busyAction === 'analyze'`, and `hasInput`. Debounced validation may update `validation`/`inputError`; an attempted Analyze with invalid JSON should also set `analysisError` so the results panel can show the target error state while input validation remains independently visible. Add `handleClearResults()` to clear `analysis` and `analysisError`, reset `activeTab` to `statistics`, and leave `jsonInput`/`validation` intact. Keep command wrappers and payloads unchanged.

**Validation gate:** From `frontend/`: `npm run typecheck` plus targeted tests for: no input-owned Analyze button, results idle state owns Analyze, analyze success starts on `Statistics`, invalid JSON error flow, and clear-results preserving input.

### Item 4 — Collapse result information architecture to three target tabs
**Goal:** Replace dashboard-first seven-tab navigation with the target result model: `Statistics`, `Values`, `Duplicates`.

**Done when:** `ResultTab` is exactly `'statistics' | 'values' | 'duplicates'`; initial/default/analyze-success active tab is `statistics`; `AnalysisResultsPanel` renders exactly three top-level tabs in target order; ARIA tablist/tab/tabpanel IDs, roving `tabIndex`, and Arrow/Home/End keyboard behavior still work. `Dashboard`, `Structure`, `Fields`, `Exact duplicates`, and `Min/max filled` no longer appear as top-level tabs.

**Key files:** `frontend/src/state/useJsonAnalyzerState.ts:12-32`, `frontend/src/components/analysis/AnalysisResultsPanel.tsx:7-68`, `frontend/src/components/analysis/ResultView.tsx:11-36`, `frontend/src/components/analysis/views/Dashboard.tsx`, `StructureView.tsx`, `StatisticsView.tsx`, `FieldsView.tsx`, `ExactDuplicatesView.tsx`, `MinMaxView.tsx`, `frontend/src/App.test.tsx:573-644`.

**Dependencies:** Item 3.

**Size:** Large.

**Implementation notes:** Re-home existing `AnalysisResponse` data under target tabs without backend changes. `Statistics` should preserve Dashboard-derived summary metrics and then present, in order: statistics/type/value distributions, structure/schema preview, field pattern/coverage table, and min/max/completeness sections. `Values` renders the target-like Values Explorer for field value exploration. `Duplicates` owns exact duplicate results plus explicit advanced field/composite duplicate analysis from existing commands.

**Validation gate:** From `frontend/`: `npm run typecheck`; targeted tab tests for exactly three tabs, default `Statistics`, unchanged keyboard navigation, and absence of old top-level tabs. Manual smoke: Statistics still exposes structure/statistics/fields/min-max data.

### Item 5 — Consolidate Values Explorer into target workflow
**Goal:** Keep current field/value analysis capabilities while reshaping the visible Values workflow to match target: sectioned Values Explorer, field selection, compact filters/sort, summary metrics, result panels, and actions.

**Done when:** Values tab presents target-like `Values Explorer` workflow with field selection, filter field/value controls, sort, selected field set, total/unique/duplicate summaries where derivable, loading/error/empty states, and result panels. Backend-mode copy such as “advanced field duplicates,” “composite duplicate keys,” and “Grouped values update locally...” is removed or rewritten. Existing command calls, async stale-response guards, selection limits, pagination, filter reset, loading/error states, and custom dropdown/combobox accessibility are preserved.

**Key files:** `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:21-744`, `frontend/src/components/common/MultiSelectDropdown.tsx`, `frontend/src/components/common/ComboboxSelect.tsx`, `frontend/src/components/analysis/duplicates/AdvancedDuplicatesView.tsx`, `frontend/src/styles.css:701-888`, `frontend/src/styles.css:988-1177`, `frontend/src/App.test.tsx:646-980`, `frontend/src/components/common/dropdown-primitives.test.tsx`.

**Dependencies:** Item 4.

**Size:** Large.

**Implementation notes:** Lock ownership for this implementation: `Values` owns selected-field value exploration and any duplicate/unique summaries produced by the values workflow; `Duplicates` owns explicit exact, field, and composite duplicate analysis. Do not embed the advanced duplicate launcher in Values first and then move it later. Extract small shared controls only if needed to avoid duplicating field/filter/pagination logic; do not start a component-system rewrite.

**Validation gate:** From `frontend/`: `npm run typecheck`, `npm test -- src/components/common/dropdown-primitives.test.tsx`, and updated Values tests for field discovery, selection max, search/sort/pagination, duplicate filter clearing, duplicate payloads, and error states. Manual smoke: Values tab in light/dark, field dropdown, combobox, grouped values, duplicate flow.

### Item 6 — Build target-compatible Duplicates tab
**Goal:** Make `Duplicates` a useful top-level target tab without duplicating backend logic or dropping exact/advanced duplicate capabilities.

**Done when:** `Duplicates` tab renders exact duplicate summary/groups from `analysis.exact_duplicates` and owns the explicit advanced field/composite duplicate workflow using current commands. Empty/no-duplicate states are target-compatible. Existing `ExactDuplicatesView` and `AdvancedDuplicatesView` are reused or adapted; duplicate business logic is not copy-pasted into multiple components.

**Key files:** `frontend/src/components/analysis/views/ExactDuplicatesView.tsx`, `frontend/src/components/analysis/duplicates/AdvancedDuplicatesView.tsx`, `frontend/src/components/analysis/ResultView.tsx`, `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`, `frontend/src/lib/commands.ts`, `frontend/src/App.test.tsx:758-980`, `frontend/src/App.test.tsx:1256-1294`.

**Dependencies:** Item 4. Coordinate with Item 5 only for shared field/filter controls; do not wait for Values to embed advanced duplicate analysis first.

**Size:** Medium.

**Validation gate:** Duplicate tests cover exact duplicates under `Duplicates`, field/composite duplicate payloads unchanged, no-result state, structured command errors, duplicate filters, and pagination. Manual smoke: exact duplicate groups, field duplicate, composite duplicate, filtered duplicates.

### Item 7 — Reframe Curl Executor as target task flow
**Goal:** Preserve guarded curl functionality while replacing capability/config/job-first UI with the target task-oriented flow.

**Done when:** Curl UI is ordered around task flow: header/instructions, curl command input, execution/batch controls, progress/job status, errors, parsed request preview, and response results. Visible “Rust service,” “in-memory async jobs,” and config/capability-first copy are removed from primary product UI. Functional disabled states, redaction/security indicators, guardrail states, polling, cancel, large-batch confirmation, and command wrapper behavior remain intact.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx:277-789`, `frontend/src/lib/commands.ts`, `frontend/src/styles.css`, `frontend/src/App.test.tsx:1009-1211`.

**Dependencies:** Item 2; can run after Items 3–6 to reduce overlap with shared tests and CSS.

**Size:** Large.

**Validation gate:** Curl tests updated for new visible text/layout while preserving command calls and feature gating. Manual smoke: parse/preview, execute once, guardrail error, async job polling, cancel, batch confirmation, light/dark readability.

### Item 8 — CSS parity polish after structural changes
**Goal:** Make native CSS support the target hierarchy rather than hiding the old one.

**Done when:** `styles.css` supports compact target-like shell/header, two-column JSON Analyzer layout, input/results card hierarchy, three-tab segmented control, dense cards/tables/forms, Values/Duplicates workflows, Curl task sections, responsive wrapping, and light/dark contrast. Visible focus states remain clear and no state relies on color alone.

**Key files:** `frontend/src/styles.css`, `frontend/src/components/common/TableScroll.tsx`, `Metric.tsx`, `StatusPanels.tsx`, `frontend/src/components/common/MultiSelectDropdown.tsx`, `ComboboxSelect.tsx`, affected view components.

**Dependencies:** Items 2–7.

**Size:** Medium.

**Validation gate:** From `frontend/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Manual visual smoke: JSON Analyzer, Values field dropdown and combobox, Duplicates table overflow, Curl input/preview/results, narrow viewport wrapping, light/dark/system.

### Item 9 — Final validation and package-readiness check
**Goal:** Confirm the overnight implementation is buildable, testable, and ready for local packaging or review.

**Done when:** Frontend validation passes, root validation is attempted, and any non-blocking gaps are recorded with exact follow-up scope.

**Key files:** `frontend/package.json`, root `package.json`, `.github/workflows/ci.yml`, `frontend/scripts/validate-theme-csp-hash.mjs`, `frontend/src/App.test.tsx`, `frontend/src/components/common/dropdown-primitives.test.tsx`, `docs/manual-visual-smoke-checklist-2026-06-03.md`.

**Dependencies:** Items 1–8.

**Size:** Small.

**Validation gate:** Run from `frontend/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Preferred final gate from repo root: `pnpm check`. If packaging is requested after implementation, run `pnpm run tauri:package:local` only after these pass.

## Overnight Orchestration Guidance
- Run Items 1–4 sequentially; they touch overlapping state, tests, and result IA.
- Run Items 5–6 sequentially only where they share extracted field/filter controls; otherwise keep ownership clear: Values for value exploration, Duplicates for explicit duplicate analysis.
- Run Item 7 after core analyzer IA is stable to avoid broad test churn.
- Run Item 8 only after structural work is complete.
- Do not dispatch parallel agents into `useJsonAnalyzerState.ts`, `AnalysisResultsPanel.tsx`, `ResultView.tsx`, and `App.test.tsx`; those are high-conflict files.

## Open Questions
None blocking. Decisions locked for overnight implementation: advanced field/composite duplicate analysis belongs in `Duplicates`, while `Values` owns field value exploration and derived unique/duplicate summaries. Invalid JSON after attempted Analyze should produce a results-panel error while input validation remains visible. Curl exact wording is not blocking; use target-compatible product copy if exact source wording is unavailable, while preserving curl command behavior and security states.

## References
- Investigation: `docs/investigations/target-app-ui-parity-2026-06-04.md`
- Superseded plan: `docs/plans/minimal-target-like-ui-2026-06-03.md`
- Target app source: `/Users/vriesd/projects/qa-toolbox/json-analyzer`
- Current frontend shell/state: `frontend/src/App.tsx`, `frontend/src/state/useJsonAnalyzerState.ts`, `frontend/src/components/common/AppHeader.tsx`
- Current results/values/curl: `frontend/src/components/analysis/AnalysisResultsPanel.tsx`, `frontend/src/components/analysis/ResultView.tsx`, `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`, `frontend/src/components/curl-executor/CurlExecutorView.tsx`
