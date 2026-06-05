# Values Explorer Target UX Parity: Plan

## Goal
Improve the current Values Explorer so it more closely matches the cleaner target-app experience shown in the provided screenshots: one focused Values Explorer card, compact field/filter controls, outcome-oriented summary, duplicate results first, and expandable value rows that keep implementation details out of the collapsed view.

This is a targeted frontend plan centered on `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`. The first implementation pass should use the existing `discoverValuesFields()` / `analyzeValues()` contracts and defer backend/API work for true record-scope filtering or global duplicate counts.

## Background
- Current entry point is `ValuesView` delegating only `jsonInput` and `flattenNestedArrays` into `ValuesExplorerView` (`frontend/src/components/analysis/views/ValuesView.tsx:3-12`; `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:31-37`). Keep this boundary unless a later backend/API change requires otherwise.
- Values commands are `discover_values_fields` and `analyze_values`; frontend wrappers send `{ request }` through `discoverValuesFields()` and `analyzeValues()` (`frontend/src/lib/commands.ts:5-15`, `frontend/src/lib/commands.ts:670-678`).
- Existing Values request shape supports field selection, value search, sort, pagination, parent-item inclusion, and flattening: `ValuesAnalysisRequest` includes `selected_fields`, `search`, `sort`, `page`, `page_size`, `include_parent_items`, and `flatten` (`frontend/src/lib/commands.ts:207-216`). Existing sort options are `count`, `value`, and `first_source_path` (`frontend/src/lib/commands.ts:199-205`).
- Current `ValuesExplorerView` owns all local state for field discovery, selected fields, value search, sort direction, page/page size, record-detail inclusion, config, errors, loading, and result data (`frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:39-62`). Request race guards already exist through discovery/analysis request refs.
- Current rendering already splits duplicate groups from all groups page-locally (`frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:210-211`, `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:513-548`). Summary values derive from the current response page and `total_groups` (`frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:779-786`).
- Record details now have a lightweight default seam: `includeParentItems` can be false for default analysis and true after the user loads record details (`frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:166-175`, `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:252-254`, `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:456-469`). Preserve this performance guard.
- Existing frontend tests cover discovery payloads, analysis payloads, stale-result clearing, disabled Values config, duplicate-first rendering, record-detail loading, copy behavior, and hidden collapsed metadata (`frontend/src/App.values.test.tsx:33-152`, `frontend/src/App.values.test.tsx:159-195`, `frontend/src/App.values.test.tsx:250-282`). Test fixtures mirror Values limits and response shapes (`frontend/src/test/app-test-harness.tsx:103-154`, `frontend/src/test/app-test-harness.tsx:298-367`).
- Analysis Results UI conventions: `AnalysisResultsPanel` owns the panel heading, result actions, three fixed tabs, ARIA tab pattern, roving keyboard navigation, and tabpanel wiring (`frontend/src/components/analysis/AnalysisResultsPanel.tsx:80-154`). Values should remain inside the existing `Values` tab, not introduce a second duplicate workflow.
- Shared primitives are available and should be reused: `Button` variants (`frontend/src/components/common/Button.tsx:3-25`), `Badge` variants (`frontend/src/components/common/Badge.tsx:3-25`), `CopyButton` copied/error live state (`frontend/src/components/common/CopyButton.tsx:3-58`), `IconButton` accessible-name requirement (`frontend/src/components/common/IconButton.tsx:3-19`), common `Metric` (`frontend/src/components/common/Metric.tsx`), and `MultiSelectDropdown` accessible searchable multi-select (`frontend/src/components/common/MultiSelectDropdown.tsx:42-48`, `frontend/src/components/common/MultiSelectDropdown.tsx:169-220`).
- Styling should use existing tokens and result-card conventions in `frontend/src/styles.css`: spacing/control/radius tokens (`styles.css:10-36`), semantic light/dark color tokens (`styles.css:64-119`, `styles.css:144-197`), `.panel`/`.result-card` surface conventions (`styles.css:756-768`, `styles.css:1118-1128`), tabs (`styles.css:1005-1052`), summaries/metrics (`styles.css:1065-1108`), Values/Duplicates grid containers (`styles.css:1576-1589`), Values toolbar (`styles.css:1696-1703`), group sections (`styles.css:1752-1761`), group rows/details (`styles.css:1965-2032`), and pagination (`styles.css:2108-2122`).
- Target app evidence shows one Values Explorer card inside the Values tab, ordered as: header/collapse, field multi-select, filter field/value/clear controls, simple sort, results summary, results panels, footer actions. Local target refs: `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/values-explorer.tsx:283-430`, `values-view.tsx:28-35`, `filter-controls.tsx:40-89`, `results-summary.tsx:30-90`, `results-panels.tsx:50-120`.
- Target-app duplicate UX treats duplicate results as a first-class section before all results (`results-panels.tsx:52-75`, `results-panels.tsx:77-119`). Compact value rows center on value chip, occurrence badge, copy action, and expand control; JSON/details appear only when expanded (`value-groups.tsx:106-205`).
- Existing prior-art doc is explicitly pre-implementation analysis and records the target direction: duplicate-first sections, outcome-oriented summary, lighter field selection, simpler controls, and compact expandable rows (`docs/analysis/values-explorer-target-ux-review-2026-06-05.md:1-90`, `docs/analysis/values-explorer-target-ux-review-2026-06-05.md:98-144`).

## Approach

### 1. Keep the first pass frontend-only
Use the current Values contracts to deliver the visible UX improvement first. Do not change `ValuesView` props, result-tab routing, Tauri command names, Rust DTOs, or backend analysis in this pass.

The target screenshots show field/value record filtering and global-feeling duplicate metrics, but the current API exposes value text search and page-derived groups. The plan should therefore use honest copy: `Search values`, `Duplicate results on page`, and `Found N duplicate result(s) on this page` until the backend exposes true record filters or global duplicate counts.

### 2. Collapse the UI into one Values Explorer card
Move from separate controls/results cards toward one `result-card values-explorer-card` inside the existing `values-explorer` section:

```text
Values Explorer card
├─ Header
├─ Compact field picker + field chips
├─ Compact search/sort/page-size controls
├─ Outcome summary + duplicate callout
├─ Status/error/empty states
├─ Duplicate results
├─ All results
└─ Pagination/footer actions
```

The parent Analysis Results tab structure stays unchanged.

### 3. Simplify visible controls without losing backend behavior
Replace backend-facing sort controls with one product-facing sort control. The recommended first-pass options are:

| UI option | Request sort |
| --- | --- |
| `Frequency` | `{ by: 'count', direction: 'desc' }` |
| `Alphabetical` | `{ by: 'value', direction: 'asc' }` |

Keep the request `sort` field. The implementation agent can choose exact option names, but the visible UI should not expose direction as a separate concept or make `first_source_path` a primary option.

Keep search as `Search values`, wired to the existing `search` request field. Do not label it `Filter field` / `Filter value` until the API supports true record-scope filtering.

### 4. Make rows compact and expandable
Rows should be collapsed-first. Expansion state is per section: expanding a group in `Duplicate results` does not automatically expand its counterpart in `All results`. DOM IDs, copy state keys, and expansion IDs should include both the section key and a bounded group identity.

Collapsed rows show only:
- value display
- occurrence count
- record-copy action state, if present; this remains disabled until parent items are loaded
- expand/collapse control

Collapsed rows must not show source paths, record indexes, field-value key lists, parent summaries, `Single` labels, or implementation wording like `source items`.

Expanded rows may show composite field values, source paths, record indexes, and parent record/detail controls. Use controlled expansion state so section-level `Expand all` / `Collapse all` actions are possible. Expansion should use stable IDs, real buttons, `aria-expanded`, and `aria-controls`.

When a new analysis starts for search/sort/page/page-size changes, clear expanded state with the stale results. When the only change is loading record details for the same current page, preserve or restore expanded IDs after the response if matching groups still exist.

### 5. Preserve lightweight record details
Keep `include_parent_items: false` for initial requests. Put record-detail loading inside expanded row content rather than as a global strip:

```text
Record details are not loaded.
[Load record details]
```

Clicking the CTA sets `includeParentItems` to `true` and lets the existing analysis effect reload the current request/page. Do not reset pagination for this action unless the existing effect model forces it. Copy-record buttons remain disabled until parent items exist.

### 6. Keep metrics page-honest
Use summary labels that match the current API:
- `Value groups` — `valuesResult.total_groups`
- `Duplicate results on page` — count of duplicate groups in `valuesResult.groups`
- `Occurrences on page` — sum of current page group counts
- `Field set` — selected field count

If duplicates exist, show a callout that says duplicates were found on the current page and that other pages may contain more. Do not imply global duplicate totals.

## Work Items

### Item 1 — Introduce the local UI model
**Goal:** Add the local state and helpers needed for target-style controls and controlled expandable rows. This can be a small internal step or folded into Items 3 and 5; it does not need to be a separate implementation PR.

**Done when:**
- `ValuesExplorerView.tsx` has a local sort-mode concept, e.g. `frequency` / `alphabetical`, mapped to existing `ValuesSort` request values.
- Duplicate/all section keys and stable group IDs are available for row expansion and copy-state comparisons.
- Expansion state can track expanded rows separately for duplicate and all-results sections.
- Identical groups in duplicate/all sections use separate expansion, copy, and DOM IDs.
- Search/sort/page/page-size analysis changes clear expanded row state with stale results.
- Record-detail reloads for the same current page preserve or restore expanded row state when matching group IDs still exist.
- Typecheck passes.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:39-62`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:166-175`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:779-786`

**Dependencies:** None.

**Size:** Small.

### Item 2 — Restructure Values Explorer into one card
**Goal:** Replace the current controls-card/results-card split with one focused Values Explorer card while preserving loading, disabled, error, empty, and analysis states.

**Done when:**
- The Values tab renders one primary Values Explorer card/region rather than separate field-control and grouped-results cards.
- Header copy is product-oriented: field selection, value search, and duplicate review.
- Existing config loading and feature-disabled states remain semantically unchanged.
- Discovery errors stay near field selection; analysis errors stay near results.
- Pending analysis still clears stale grouped results and shows loading state.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:282-521`
- `frontend/src/components/analysis/views/ValuesView.tsx:3-12`
- `frontend/src/styles.css:1576-1589`

**Dependencies:** Item 1 preferred, but this can start independently if the implementer keeps behavior stable.

**Size:** Medium.

### Item 3 — Compact field selection and controls
**Goal:** Bring the top of the Values Explorer closer to the target screenshot: compact field picker, lightweight selected-field display, value search, simple sort, and page size.

**Done when:**
- `MultiSelectDropdown` remains the field picker and selection cap behavior remains unchanged.
- Large selected-field cards no longer dominate the default view.
- Selected fields render as compact chips or a compact field-set summary.
- Each visible chip exposes at least the field label and the full field path via visible compact code, tooltip/title, or accessible text.
- Field stats such as unique/null/missing/type counts are moved into an optional disclosure if retained.
- Existing copy-field-set behavior remains available in the compact UI.
- Visible controls are `Search values`, `Sort values by`, and `Results per page`.
- Direction select is removed from the visible UI.
- `First source path` is removed from the visible UI.
- Search, sort mode, and page-size changes still reset `page` to `1`.
- Request payloads still use the existing `search`, `sort`, `page`, `page_size`, and `flatten` fields.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:306-380`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:386-469`
- `frontend/src/components/common/MultiSelectDropdown.tsx:42-48`
- `frontend/src/styles.css:1696-1703`

**Dependencies:** Item 1 for sort mapping.

**Size:** Medium.

### Item 4 — Replace summary with outcome-oriented, page-honest metrics
**Goal:** Make the summary feel like the target app while staying accurate with the current API.

**Done when:**
- Summary appears before result sections.
- Labels are outcome-oriented and page-honest: `Value groups`, `Duplicate results on page`, `Occurrences on page`, `Field set`.
- Duplicate callout appears when duplicate groups exist on the current page.
- Empty duplicate state says there are no duplicate results on this page and all grouped values remain below.
- The UI does not claim global duplicate totals.
- The implementation reuses common `Metric` if practical and removes the local helper if no longer needed.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:532-548`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:779-786`
- `frontend/src/components/common/Metric.tsx`
- `frontend/src/styles.css:1065-1108`

**Dependencies:** Item 2.

**Size:** Small.

### Item 5 — Implement duplicate-first sections with controlled expansion
**Goal:** Match the target result hierarchy: duplicate results first, all results second, compact collapsed rows, and explicit expand/collapse controls.

**Done when:**
- Duplicate results section always renders before all results after data loads.
- All results remains complete for the current page, including duplicates and singletons.
- No `All groups` / `Duplicates only` segmented filter returns.
- Each section has `Expand all` and `Collapse all` actions when it has rows.
- Collapsed rows show only value, occurrence count, copy action state, and expand/collapse affordance.
- Source paths, record indexes, field values, and parent summaries are visible only after expansion.
- Collapsed record-copy controls, if shown, are explicitly disabled until parent items are loaded; section-level duplicate-summary copy remains separate.
- Expansion buttons are keyboard-accessible and expose `aria-expanded` / `aria-controls`.
- Duplicate emphasis is subtle in all-results rows and not repeated noisily in the duplicate section.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:513-548`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:560-748`
- `frontend/src/components/common/IconButton.tsx:3-19`
- `frontend/src/styles.css:1752-1761`
- `frontend/src/styles.css:1965-2032`

**Dependencies:** Items 1 and 4.

**Size:** Large.

### Item 6 — Move record-detail loading into expanded rows
**Goal:** Keep default Values requests lightweight while making record details discoverable at the point of need.

**Done when:**
- Initial `analyzeValues()` calls include `include_parent_items: false`.
- Expanding a row does not automatically fetch parent records.
- Expanded row content shows a `Load record details` CTA when record details are not loaded.
- Clicking the CTA sets `includeParentItems` to `true` and triggers the existing analysis effect for the current request/page without intentionally resetting pagination.
- Expanded row state is preserved or restored after the record-detail reload when matching groups still exist.
- Copy records stays disabled until parent items exist for that group.
- Once details are loaded, expanded rows show parent summaries and copy actions work through `CopyButton`.

**Key files:**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:166-175`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:252-254`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:456-469`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:728-748`
- `frontend/src/lib/clipboard.ts`

**Dependencies:** Item 5.

**Size:** Medium.

### Item 7 — CSS cleanup and visual polish
**Goal:** Support the new information hierarchy without destabilizing shared analysis UI styles.

**Done when:**
- Values-specific changes are namespaced under `.values-explorer` where practical.
- Styling supports the single card, compact field display, compact controls, summary callout, result sections, expandable rows, and section actions.
- Obsolete heavy default styles for selected-field cards and always-visible record-detail strip are removed or neutralized after confirming they are not used elsewhere.
- Shared `.result-card`, `.summary-strip`, `.metric-card`, `.pagination-row`, and duplicate-view selectors are not changed unless necessary.
- Light and dark mode continue to use existing semantic tokens.
- Narrow viewport layout remains usable.

**Key files:**
- `frontend/src/styles.css:1576-2032`
- `frontend/src/styles.css:2108-2122`

**Dependencies:** Items 2–6.

**Size:** Medium.

### Item 8 — Update tests and verification
**Goal:** Lock the new UX contract into focused frontend tests while preserving existing command/state guarantees.

**Done when:**
- `App.values.test.tsx` verifies compact single-card rendering and absence of backend-facing sort controls.
- Initial analysis request test verifies `include_parent_items: false` and default frequency sort maps to `{ by: 'count', direction: 'desc' }`.
- Sort mapping test verifies `Alphabetical` maps to `{ by: 'value', direction: 'asc' }`.
- Duplicate-first test verifies duplicate section precedes all-results section, duplicate section contains only repeated groups, and all-results contains complete page groups.
- Collapsed-row test verifies source paths and record indexes are not visible before expansion, then visible after expansion.
- Record-detail test verifies CTA-driven reload with `include_parent_items: true`, copy disabled before parent items, and copy enabled after parent items return.
- Existing tests for stale request clearing, selection limit, no-duplicate filtered page, disabled Values config, and no advanced duplicate workflow launch remain covered.
- Harness changes are minimal and only add fixtures needed for the implemented behavior; avoid adding expand-all edge fixtures unless expand-all has meaningful branching beyond existing row expansion.
- Verification commands pass from the repo root:
  - `pnpm --dir frontend typecheck`
  - `pnpm --dir frontend test -- src/App.values.test.tsx`
- Run broader frontend tests if the implementation changes shared primitives or global styles outside Values-specific selectors.

**Key files:**
- `frontend/src/App.values.test.tsx:33-152`
- `frontend/src/App.values.test.tsx:159-195`
- `frontend/src/App.values.test.tsx:250-282`
- `frontend/src/test/app-test-harness.tsx:103-154`
- `frontend/src/test/app-test-harness.tsx:298-367`
- `frontend/package.json`

**Dependencies:** Items 1–7.

**Size:** Medium.

## Risks and Constraints

### Page-local duplicate counts
Current `ValuesAnalysisResponse` does not expose global duplicate-group counts independent of pagination. The implementation must label duplicate metrics as page-local. A later backend/API change could add fields such as `duplicate_group_count`, `unique_group_count`, or `total_records`, but this plan does not require that work.

### Record-detail payload cost
Parent records can be heavy. Keep `include_parent_items: false` by default and load details only through an explicit CTA. Do not auto-fetch details on row expansion.

### Record-scope filtering ambiguity
The target app appears to support field/value record filtering. The current app supports value text search. The implementation should use `Search values` for now and defer target-style `Filter field` / `Filter value` until `ValuesAnalysisRequest` gains record-scope filter fields.

### CSS selector churn
`styles.css` is global and Values/Duplicates share some selectors. Prefer `.values-explorer ...` namespacing and avoid changes to shared primitives unless the component markup requires it.

### Accessibility
Expandable row controls must remain keyboard and screen-reader usable. Use real buttons, stable IDs, `aria-expanded`, `aria-controls`, existing `CopyButton` live feedback, and existing list/listitem semantics.

### Request races
Do not regress existing stale-result behavior. Keep request ID refs, clear results when a new analysis starts, and ignore stale responses.

## Open Questions
- Should true target-style `Filter field` + `Filter value` be a follow-up backend/API project after this frontend pass? This plan assumes yes.
- Should global duplicate counts be added to the Values API later? This plan assumes the current implementation should remain page-honest instead of blocking on that API work.
- Should export/PDF actions remain deferred behind `pdf_export` and out of this implementation? This plan assumes yes.

## References
- `docs/analysis/values-explorer-target-ux-review-2026-06-05.md`
- `docs/investigations/target-app-ui-parity-2026-06-04.md`
- Target local comparison files under `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/`
