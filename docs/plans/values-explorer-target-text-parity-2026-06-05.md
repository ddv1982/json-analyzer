# Values Explorer Target Text Parity: Plan

## Goal
Make Values Explorer substantially less text-heavy and align its visible workflow, labels, and disclosure model with the target app as closely as the current frontend/API contracts allow.

This plan is centered on `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx` and Values-specific CSS/tests. It should not become a broad app redesign, design-token refactor, icon/package change, or backend rewrite unless a work item explicitly calls out a follow-up contract gap.

## Background
- Current Values Explorer entry remains narrow: `ValuesView` only passes `jsonInput` and `flattenNestedArrays` into `ValuesExplorerView` (`frontend/src/components/analysis/views/ValuesView.tsx:1-14`). Keep this boundary for the frontend pass.
- Current component owns the relevant state seams: field discovery, selected fields, value search, sort mode, pagination, `includeParentItems`, expansion state, copy state, and values result data (`frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:51-73`).
- Current UI still carries visible text density in heading help copy, selected field panel/stats, toolbar labels/placeholders, summary/callout/pagination copy, section descriptions, expanded row details, and record-detail prompts (`ValuesExplorerView.tsx:371-622`, `:784-852`).
- Current implementation already has useful target-facing structure: duplicate results before all results, controlled row expansion, page-scoped duplicate summary copy, lazy current-page record details, and tests around these behaviors (`frontend/src/App.values.test.tsx:35-204`).
- Current CSS seams for this pass are Values-specific: `.values-explorer-card`, `.values-setup`, selected field chips/disclosure, `.values-toolbar`, `.values-duplicate-callout`, `.value-groups-section`, `.value-group-row`, `.value-group-details`, and pagination/value row selectors (`frontend/src/styles.css:1610-2204`). Avoid broad token/global selector churn.
- Target app Values Explorer card starts collapsed and toggles via a header button (`/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/values-explorer.tsx:86`, `:295-306`). This is the largest density reduction available without API changes.
- Target visible copy is concise: `Select field to analyze for unique and duplicate values`, `Choose one or more fields...`, `Available fields are automatically detected from your JSON structure`, and empty state `Select one or more fields to analyze duplicate combinations.` (`target values-explorer.tsx:308-327`, `:359-362`).
- Target filter controls are `Filter field`, `Filter value`, `No filter field`, `Type a value to filter records...`, and `Clear Filter` (`target filter-controls.tsx:41-87`). Current local API only supports value search, so exact target filter behavior is a contract gap unless a backend/API item is included.
- Target sort is simple: `Sort values by` with `Frequency` and `Alphabetical`, shown after field selection (`target values-explorer.tsx:339-356`). Current local sort-mode seam can already map this to existing API sort values.
- Target summary is compact and outcome-oriented: `Field Analysis` / `Composite Field Combination`, selected fields as code chips, optional applied filter, metrics `Total Records`, `Unique results`, `Duplicate results`, `Field Set`, and a short duplicate warning (`target results-summary.tsx:30-90`). Current response cannot produce all of those as global metrics.
- Target result hierarchy is `Duplicate results ({n})` before `Results (page X of Y)`, with compact rows centered on a code chip, occurrence badge, copy icon, and expand/collapse icon (`target results-panels.tsx:52-116`, `target value-groups.tsx:132-183`).
- Target row details stay hidden until expansion and then show matching item JSON blocks with `Index: {index}` badges and pretty JSON panes (`target value-groups.tsx:184-205`). Long values are truncated to 200 characters and displayed in compact non-wrapping code chips (`target display-utils.ts:76-79`, `target utilities.inputs.css:5`).
- Prior parity investigation says target-app parity should proceed through information architecture, workflow ownership, visible copy removal, accessibility-preserving markup, then CSS polish (`docs/investigations/target-app-ui-parity-2026-06-04.md:88-93`).
- Existing plans warn not to hide functional warnings/errors/statuses merely for visual parity and to preserve page-honest metrics until backend exposes global duplicate counts (`docs/plans/values-explorer-target-ux-parity-2026-06-05.md:78-87`; `docs/plans/target-app-ui-parity-overnight-implementation-2026-06-04.md:58-66`).

## Approach

### 1. Make exact-now parity explicit
The implementation should match the target exactly where the current contracts allow. Target facts in this plan come from the prior local-target inspections and docs listed in `## References`; implementation agents may re-open those local target files if they need exact markup details.

Exact-now scope:

- collapsible Values Explorer card, default collapsed after config is loaded
- concise field-picker copy and compact selected-field chips
- simple sort UI: `Frequency` / `Alphabetical`
- duplicate-first hierarchy: `Duplicate results ({n})` then `Results (page X of Y)`
- compact collapsed rows with value chip, occurrence count, copy action, and expand action only
- expanded-only source paths, record indexes, field values, parent summaries, and JSON/details
- section-level expand/collapse controls
- target-like compact pagination controls with explicit accessible labels
- Values-scoped CSS density cleanup

### 2. Stay honest where contracts differ
The user wants target parity, but the current API does not support two target behaviors:

- true record-scope `Filter field` + `Filter value`
- global `Total Records`, `Unique results`, and `Duplicate results` metrics independent of pagination

Do not relabel current value search as record filtering. Keep `Search values` in the frontend pass and list target filtering as a backend/API follow-up. Keep page-honest metrics until the response exposes global counts.

### 3. Reduce visible text through disclosure, not removal of state
Text reduction should move non-primary information behind disclosure or into accessible names, not drop operationally important state.

Collapsed-state policy:
- config loading and disabled states stay visible instead of being hidden inside a collapsed body.
- discovery and analysis errors render outside or immediately below the collapsed body; do not auto-expand the card on error.
- discovery/analysis loading, selected-field count, and result availability can be compact header/status text.
- selection cap warnings, page-size clamp warnings, and clipboard failure details stay contextual in the open body; if the body is collapsed after a clipboard failure, the next open body must still expose the detailed error/live feedback.
- stale-result clearing should remain visible through the existing loading state rather than stale content.

### 4. Preserve current behavioral guarantees
The existing behavior around request guards, lazy record details, selection caps, no advanced duplicate workflow launch, and stale request clearing is load-bearing. The density pass should update the presentation while preserving these guarantees.

## Work Items

### Item 1 — Add the target-style collapsible card shell
**Goal:** Make the Values Explorer body collapsible like the target app so the default Values tab is not dominated by helper text and controls.

**Done when:**
- `ValuesExplorerView` has local disclosure state for the card body, defaulting collapsed once config is loaded and Values Explorer is enabled.
- The card header is always visible with title `Values Explorer`, concise subtitle `Select field to analyze for unique and duplicate values.`, and a real toggle button.
- Toggle button has explicit accessible names such as `Show Values Explorer` / `Hide Values Explorer`.
- Config loading and disabled states remain visible.
- Discovery/analysis errors remain visible even if the body is collapsed, either immediately under the header or in an always-visible compact status area.
- The body opens without changing selected fields, search, sort, page, or results.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:371-380`
- `frontend/src/styles.css:1610-1621`
- `frontend/src/App.values.test.tsx`

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Replace selected-field verbosity with target-like chips
**Goal:** Keep field selection useful while removing the heavy selected-field panel and default stats cards from the main view.

**Done when:**
- The field picker uses concise target-aligned copy: `Select fields`, `Choose one or more fields...`, and a short detected-fields helper.
- Selected fields render as compact chips by default.
- Each chip visibly exposes the field label and the full field path by default, preferably as compact code or a truncated visible path with title/accessibility backup. Title-only or screen-reader-only path is not enough when similar labels can collide.
- `Copy fields` remains available near the chips.
- Field stats (`Types`, `Unique`, `Null`, `Missing`, samples) move behind a compact disclosure named `Field details` or equivalent.
- Selection cap warnings and discovery errors remain visible and accessible.
- Large selected-field cards no longer dominate the default body.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:385-452`
- `frontend/src/components/common/MultiSelectDropdown.tsx`
- `frontend/src/styles.css:1623-1667`, `:1721-1823`

**Dependencies:** Item 1 preferred.

**Size:** Medium.

### Item 3 — Simplify controls while keeping API honesty
**Goal:** Make the top controls visually closer to target without pretending current value search is target record filtering.

**Done when:**
- Sort UI remains `Sort values by` with only `Frequency` and `Alphabetical`.
- `Frequency` maps to `{ by: 'count', direction: 'desc' }`; `Alphabetical` maps to `{ by: 'value', direction: 'asc' }`.
- Direction and `first_source_path` are not exposed.
- Value search is labeled `Search values` with concise placeholder `Search values...` or equivalent.
- The UI does not use target `Filter field` / `Filter value` labels until backend/API support exists.
- Page size is presented as a compact control outside the primary field/search toolbar where practical, with an accessible label `Results per page`. Exact placement can be chosen during implementation as long as toolbar density is reduced.
- Search, sort, and page-size changes reset `page` to `1`, reset `includeParentItems` to `false`, and clear expanded rows for the new analysis context.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:464-509`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:185-219`
- `frontend/src/App.values.test.tsx`

**Dependencies:** Item 1.

**Size:** Small.

### Item 4 — Tighten summary and duplicate messaging
**Goal:** Reduce text in the summary while preserving page-local accuracy.

**Done when:**
- Summary appears in a compact target-like block before results.
- Current-contract labels remain honest: `Value groups`, `Duplicate results on page`, `Occurrences on page`, and `Field set`.
- Duplicate callout is shortened to one primary sentence: `Found N duplicate result(s) on this page.` Optional second sentence should be terse: `Other pages may contain more.`
- Empty duplicate state is one concise line: `No duplicate results on this page.`
- No visible text implies global duplicate counts unless the API follow-up has been implemented.
- Clipboard action for duplicate summary remains page-scoped in label or accessible name.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:511-622`
- `frontend/src/components/common/Metric.tsx`
- `frontend/src/styles.css:1065-1084`, `:1669-1677`

**Dependencies:** Items 1 and 3.

**Size:** Small.

### Item 5 — Match target result hierarchy and row density
**Goal:** Make the result area look and behave like the target: duplicate section first, all results second, compact collapsed rows, details only after expansion.

**Done when:**
- Duplicate section title is `Duplicate results ({n})`.
- All-results section title is `Results (page X of Y)`.
- Default section descriptions are removed unless needed for empty/error states.
- Duplicate section contains only `group.count > 1` groups.
- Results section contains all current page groups.
- Collapsed rows show only value chip, occurrence count/badge, and expand/collapse action by default.
- Record-copy action should either remain visible but disabled with an explicit accessible reason until parent items exist, or move into expanded details. Do not add a separate value-copy behavior unless the product decision is made explicitly.
- Collapsed rows do not show source paths, record indexes, field-value lists, parent summaries, `Single`, or explanatory prose.
- Long display values are truncated or visually constrained in compact code-chip style.
- Expanded rows show composite field values, source paths, record indexes, and record details.
- Target-like compact pagination controls are present with visible `<` / `>` or similarly terse controls and explicit accessible labels.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:535-583`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:624-819`
- `frontend/src/styles.css:1888-2204`
- `frontend/src/App.values.test.tsx`

**Dependencies:** Items 1, 3, and 4.

**Size:** Large.

### Item 6 — Lock down expansion identity and lazy record details
**Goal:** Preserve the current behavioral guarantees while reducing detail text and matching target disclosure semantics.

**Done when:**
- Expansion state remains section-scoped: a group expanded under `Duplicate results` does not expand the matching group under `Results`.
- DOM IDs, copy keys, and expansion IDs include section key plus bounded group identity.
- `Expand all` / `Collapse all` affect only their section.
- New analysis contexts reset expansion state.
- Detail reloads triggered by `Load record details` keep the current page and preserve matching expanded IDs.
- Initial analysis requests still use `include_parent_items: false`.
- Expanding a row does not fetch parent details automatically.
- Record-detail prompt is compact, e.g. `Details not loaded.` plus `Load record details`, while remaining understandable and accessible.
- Copy records remains disabled until parent items exist.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:70-73`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:175-238`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:306-359`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:847-852`
- `frontend/src/App.values.test.tsx`

**Dependencies:** Item 5.

**Size:** Medium.

### Item 7 — Values-scoped CSS density polish
**Goal:** Support the target-like compact layout without destabilizing unrelated app surfaces.

**Done when:**
- CSS changes are scoped under `.values-explorer` / Values-specific selectors where practical.
- Styles support collapsed card header, compact field chips, compact controls, compact summary/callout, result section headers, row action cluster, expanded details, and compact pagination.
- Obsolete heavy selected-field-card defaults are removed or neutralized only if no longer used in the default Values flow.
- Shared `.result-card`, global tokens, app shell, non-Values duplicate views, and curl/input surfaces are not changed unless strictly necessary.
- Light and dark mode continue to use existing semantic tokens.
- Narrow viewport layout remains usable.

**Key files:**
- `frontend/src/styles.css:1610-2204`

**Dependencies:** Items 1–6.

**Size:** Medium.

### Item 8 — Update tests and verification
**Goal:** Lock the reduced-text target workflow into focused tests without weakening existing command/state coverage.

**Done when:**
- Tests assert the Values Explorer card is collapsed by default and toggles open.
- Tests assert critical errors/statuses remain visible or reachable when collapsed.
- Tests preserve request payload guarantees: initial `include_parent_items: false`, `Frequency` sort mapping, `Alphabetical` sort mapping, page/search/sort/page-size resets, and lazy detail reload with `include_parent_items: true`.
- Tests verify target hierarchy: `Duplicate results ({n})` appears before `Results (page X of Y)`.
- Tests verify collapsed rows hide source paths/record indexes/parent summaries and expanded rows reveal them.
- Tests verify section-scoped expand/collapse and record-copy disabled/enabled behavior.
- Tests verify old backend-facing controls do not return: direction select, `first_source_path`, `All groups` / `Duplicates only`, and advanced duplicate workflow launch.
- Verification commands pass from repo root:
  - `pnpm --dir frontend typecheck`
  - `pnpm --dir frontend test -- src/App.values.test.tsx`
- If `MultiSelectDropdown`, `Metric`, shared primitives, global CSS selectors, or non-Values surfaces are touched, also run broader relevant frontend tests, normally `pnpm --dir frontend test`.

**Key files:**
- `frontend/src/App.values.test.tsx`
- `frontend/src/test/app-test-harness.tsx`
- `frontend/package.json`

**Dependencies:** Items 1–7.

**Size:** Medium.

## Backend/API Follow-ups for True Target Exactness

These are not part of the first frontend density pass unless the implementation workflow explicitly expands scope.

### Follow-up A — Record-scope filtering
Add backend/frontend request support for target-style record filtering before using target labels such as `Filter field`, `Filter value`, `No filter field`, `Type a value to filter records...`, and `Clear Filter`.

### Follow-up B — Global summary metrics
Add response support for global total-record, unique-result, and duplicate-result counts before using target labels `Total Records`, `Unique results`, and `Duplicate results` without page qualifiers.

### Follow-up C — Export/PDF actions
Only add target-style export/PDF actions when supporting APIs/features exist and are enabled.

## Risks and Constraints

### Collapsed body can hide useful information
Mitigation: keep config loading/disabled states and discovery/analysis errors outside or adjacent to the collapsed body. Use compact header status for loading/analysis state.

### Target labels can imply unsupported semantics
Mitigation: do not use record-filter/global-count labels until backend contracts support them. Prefer honest current labels over visually exact but incorrect copy.

### CSS changes can leak into adjacent surfaces
Mitigation: keep styles Values-scoped and avoid broad token/global app changes.

### Existing behavior can regress while reducing text
Mitigation: preserve request race guards, explicit empty-selection behavior, selection caps, lazy record details, copy error handling, and stale-result clearing; cover these in `App.values.test.tsx`.

## Open Questions
- Should the first implementation pass remain frontend-only and honest about current search/page-local metric limitations? This plan assumes yes.
- Should target-style `Filter field` + `Filter value` be planned as a separate backend/API project immediately after this pass? This plan recommends yes if exact target behavior remains the goal.
- Should the collapsed card default apply only after a successful config load, leaving loading/disabled/error states visible? This plan assumes yes.

## References
- `docs/plans/values-explorer-target-ux-parity-2026-06-05.md`
- `docs/analysis/values-explorer-target-ux-review-2026-06-05.md`
- `docs/reviews/values-explorer-target-ux-parity-plan-critique-2026-06-05.md`
- `docs/investigations/target-app-ui-parity-2026-06-04.md`
- Target local comparison files under `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/`
