# Values Explorer Target UX Review

## Context / Scope

This review compares the pre-implementation Values Explorer UX against the local target app implementation, with emphasis on the user concern that grouped values and duplicates still do not feel clean.

> Status: pre-implementation analysis. The current worktree now implements the recommended duplicate-first section model and intentionally removes the older `All groups` / `Duplicates only` view filter.

**Current repo evidence**
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`
- `frontend/src/styles.css`
- `artifacts/screenshots/values-groups-window-fit-dark.png`
- `docs/investigations/target-app-ui-parity-2026-06-04.md`, especially Finding 4

**Target app evidence**
- External local comparison source: target app Values Explorer component
- External local comparison source: target app value groups component
- External local comparison source: target app results summary component
- External local comparison source: target app results panels component
- External local comparison source: target app filter controls component
- External local comparison source: target app analysis results component

Finding 4 in the prior investigation was confirmed before implementation: the repo had many target primitives, but the Values Explorer workflow was still shaped around local/backend analysis concepts instead of the target’s single, product-oriented flow.

## Executive Summary

The current Values Explorer is powerful, but it asks the user to interpret too many competing concepts at once: selected field summaries, grouped values, duplicate-only filtering, page-level duplicate counts, source paths, record indexes, per-group details, and copy actions. The target app feels cleaner because it frames the experience as one flow:

1. Select field(s).
2. Optionally filter records by another field/value.
3. Choose a simple sort mode.
4. Read a compact results summary.
5. Review duplicate results first.
6. Review all value groups separately.
7. Expand rows only when record JSON is needed.

The most important change is not a new color or spacing tweak. It is to stop showing a single mixed “Grouped values” stream as the primary result. Duplicate results should become a first-class section above the full results list, with a clear summary explaining what was found.

## Top 5 UX Gaps

### 1. Pre-implementation UI mixed all groups and duplicates in one list; target separates duplicate results from all results

**Pre-implementation current state:** `ValuesExplorerView.tsx` built `duplicateGroupsOnPage` and then conditionally filtered the current page via `groupedValuesViewFilter`. The visible result area was titled `Grouped values` and contained an `All groups` / `Duplicates only` segmented control. This made duplicates feel like a filter mode inside a generic list.

**Target:** `ResultsPanels` renders `Duplicate results (...)` first when duplicates exist, then renders `Results (page X of Y)` for all field values (`results-panels.tsx:52-79`). The duplicate section is a primary outcome, not a filter.

**Why it matters:** The user wants to evaluate duplicates. In the current screenshot, single values dominate the viewport and each row repeats “Single”, “1 single value”, path, record, copy, and details. That makes the duplicate-finding task feel buried even if duplicate highlighting exists.

**Recommendation:** Replace the mixed list mental model with two stacked result sections:
- **Duplicate results**: only repeated groups, shown first, hidden if none.
- **All results**: complete paged value groups, including singletons, with lighter visual weight.

### 2. Current summary reports page-local mechanics; target summary reports decision-level outcomes

**Current:** `ValuesSummaryPanel` shows `Groups`, `Duplicates`, `Page values`, and `Field set` (`ValuesExplorerView.tsx:586-593`). The duplicate count is page-local because it is derived from `valuesResult.groups` on the current page (`ValuesExplorerView.tsx:735-742`). The pagination footer also says `duplicate groups on page` (`ValuesExplorerView.tsx:560-561`).

**Target:** `ResultsSummary` shows `Total Records`, `Unique results`, `Duplicate results`, and `Field Set` (`results-summary.tsx:48-73`), plus a warning callout when duplicate results exist (`results-summary.tsx:76-90`). These are outcome-oriented metrics.

**Why it matters:** A page-local duplicate count can imply there are no duplicates when the current page has none. It also forces the user to understand paging before understanding the result.

**Recommendation:** Promote global/analysis-level metrics. If the current backend only returns page-level duplicate data, label it honestly but design toward global counts:
- `Total records`
- `Unique results`
- `Duplicate results`
- `Field set`
- Optional warning: `Found N duplicate results` with one short sentence.

### 3. Current field selection area is heavier than target and competes with results

**Current:** The top card includes the field picker plus a large `Field Set` panel with per-field cards, stats, paths, null/missing counts, and sample values (`ValuesExplorerView.tsx:331-366`). This is useful metadata, but it dominates the top of the Values Explorer before the user sees duplicates.

**Target:** The target field area is compact: a label, multi-select, max-selection hint, and short auto-detected-fields hint (`values-explorer.tsx:308-327`). Selected fields are summarized later as code chips in the results summary (`results-summary.tsx:30-45`).

**Why it matters:** The current selected-field cards are analysis metadata, not the primary user task. They push the actual duplicate/value display lower and increase perceived complexity.

**Recommendation:** Collapse field metadata into the field dropdown and results summary. In the main view, show selected fields as compact chips only. If field stats are retained, move them into an optional disclosure such as `Field details`.

### 4. Current controls expose implementation/page mechanics; target controls are simpler

**Current:** The toolbar exposes `Value search`, `Sort by` with `Count`, `Value`, `First source path`, `Direction`, and `Page size` (`ValuesExplorerView.tsx:382-423`). The view filter and copy summary action are separate controls below (`ValuesExplorerView.tsx:425-455`).

**Target:** Filtering is a simple field/value/clear row (`filter-controls.tsx:40-89`), sort is just `Frequency` or `Alphabetical` (`values-explorer.tsx:339-355`), and pagination controls live near the result panels (`results-panels.tsx:62-72`, `results-panels.tsx:83-116`).

**Why it matters:** The current controls look like a data-table query builder, while the target feels like a guided analysis card. `First source path` and sort direction are especially implementation-oriented for this task.

**Recommendation:** For quick cleanup, keep backend support but simplify visible controls:
- Replace sort-by + direction with one `Sort values by` select: `Frequency`, `Alphabetical`.
- Move page size into pagination or hide it behind advanced options.
- Remove `All groups / Duplicates only` once duplicate and all-results panels are separated.
- Keep value filtering, but consider target-style `Filter field` + `Filter value` if the backend supports record-scope filtering.

### 5. Current group rows are dense and visually repetitive; target rows are cleaner expandable cards

**Current:** Each `value-group-row` always shows badge, count language, source path summary, record summary, copy button, and a `Details` disclosure (`ValuesExplorerView.tsx:612-679`). CSS adds duplicate tinting and badges (`frontend/src/styles.css:1955-1979`) but both duplicate and single rows have similar visual weight (`styles.css:1989-2079`). The screenshot shows many singletons taking equal attention.

**Target:** `ValueGroups` rows center on value code chip + occurrence count badge, with compact copy and expand buttons (`value-groups.tsx:132-181`). Record JSON appears only after expansion (`value-groups.tsx:184-205`). Expand/collapse all actions are section-level (`value-groups.tsx:108-126`).

**Why it matters:** Clean duplicate review depends on scanning. The current row design makes every group look like an incident. The target lets users scan values and occurrence counts first, then inspect details on demand.

**Recommendation:** Redesign group rows around three layers:
- **Collapsed row:** value chip, occurrence count, optional duplicate emphasis, copy icon, expand icon.
- **Metadata line:** only for duplicate rows or expanded rows; show source paths/records sparingly.
- **Expanded body:** record JSON/parent summaries, source paths, indexes.

## Recommended Display Direction for Grouped Values and Duplicates

Use this as the proposed direction for user approval before coding.

### Values tab structure

```text
Values
└─ Values Explorer card
   ├─ Header: Values Explorer + collapse/expand affordance (optional)
   ├─ Select field(s)
   ├─ Filter controls
   ├─ Sort values by: Frequency | Alphabetical
   ├─ Results summary
   │  ├─ Total Records
   │  ├─ Unique results
   │  ├─ Duplicate results
   │  └─ Field Set
   ├─ Duplicate results (N)
   │  ├─ Expand All / Collapse All
   │  └─ Duplicate group cards only
   ├─ Results (page X of Y)
   │  ├─ Expand All / Collapse All / pagination
   │  └─ All value group cards
   └─ Footer actions: Export PDF when duplicates exist, Clear Results
```

### Duplicate result card

```text
["customer@example.com"]     4 occurrences     [copy] [expand]
```

Expanded:

```text
Record 2
{ compact/preformatted parent JSON }

Record 9
{ compact/preformatted parent JSON }
```

Guidelines:
- Make duplicate cards slightly stronger than normal rows: warning/info accent on the count or left border, not a full heavy background.
- Do not show `Single` badges in the main all-results list; singletons are the default state.
- Do not label duplicates as `repeated values` in every row. `4 occurrences` is enough.
- Keep source path and record index available, but behind expansion unless needed for disambiguation.
- For composite fields, show a compact composite chip or a two-column key/value mini-list only in expanded state.

### All results card

```text
["NY"]     12 occurrences     [copy] [expand]
[null]      3 occurrences     [copy] [expand]
[No data]   1 occurrence      [copy] [expand]
```

Guidelines:
- The all-results list should be secondary after duplicate results.
- Singletons should not be visually called out with badges.
- If there are no duplicates, show a positive/neutral state above all results: `No duplicate results found for this field set.`
- Pagination should describe all results, not duplicate-on-current-page counts.

## Phased Implementation Plan

### Phase 1 — Quick cleanup, low risk

Goal: make the current UI feel cleaner without changing backend contracts.

1. **Rename and reprioritize summary metrics.** Change `Groups / Duplicates / Page values / Field set` to target-like labels. Avoid page-local duplicate wording where possible.
2. **Remove row-level `Single` badges.** Only duplicate groups need emphasis. Singletons should read as normal result rows.
3. **Simplify row copy.** Replace `1 single value` / `N repeated values` with `N occurrence(s)`.
4. **Reduce default metadata.** In collapsed rows, hide source-path and record-index summaries unless the group is duplicate or expanded.
5. **Tone down duplicate backgrounds.** Prefer a subtle badge/count accent or left border over full row tint.
6. **Move page-size copy into pagination.** Remove the limit explanation unless clamping actually happens and impacts the user.

Expected result: the existing page stops looking like a list of noisy cards and becomes easier to scan.

### Phase 2 — Structural parity, medium risk

Goal: align the current implementation with the target’s result model.

1. **Split `ValuesGroupsTable` into reusable `ValueGroupsSection`.** It should support title, groups, sort mode, pagination actions, expand/collapse all, and row rendering.
2. **Render `Duplicate results` before `Results`.** Do not make users toggle `Duplicates only`.
3. **Replace the selected-field cards with compact chips.** Move detailed field stats to an optional disclosure or omit them from the primary flow.
4. **Simplify controls.** Use target-like `Filter field`, `Filter value`, `Clear Filter`, and `Sort values by` controls. Keep current value search only if it is intentionally different from record filtering.
5. **Add section-level expand/collapse.** This mirrors the target and reduces per-row decision load.
6. **Move `Copy duplicate summary` into duplicate section actions or remove it.** Per-group copy plus PDF/export is clearer.

Expected result: users can evaluate duplicates first and still inspect all values when needed.

### Phase 3 — Data/API alignment, higher risk

Goal: close semantic gaps that UI alone cannot fix.

1. **Return global duplicate counts independent of current page.** The current UI should not derive `Duplicate results` from groups on the visible page.
2. **Support duplicate and all-results payloads separately.** Target derives `duplicateGroups` and `uniqueGroups` from one analysis result; current API may need a clearer contract for this split.
3. **Add record-scope filtering if target parity requires it.** Target filter controls filter records by field/value, not only values by text.
4. **Normalize composite value display.** Provide structured composite labels so the frontend does not have to render long joined values.
5. **Add visual regression screenshots for duplicate-heavy and singleton-heavy datasets.** Include dark and light mode checks.

Expected result: the UI can honestly show global duplicate outcomes and reliable pagination without page-local ambiguity.

## Implementation Notes

- `ValuesExplorerView.tsx:370-574` should be the main refactor zone: controls, summary, list rendering, pagination, and row structure all live there.
- `ValuesExplorerView.tsx:586-742` contains summary and value group helper components that can be split into smaller files mirroring target `results-summary.tsx`, `results-panels.tsx`, and `value-groups.tsx`.
- `styles.css:1577-2092` contains the current values/duplicates styling. After structural changes, remove styles for obsolete duplicate launch/filter patterns and simplify row/card styles.
- Keep accessibility behavior: list semantics, button labels, focus states, and copy feedback should remain intact.

## Recommended Next Decision

Before coding, decide this product direction:

> Values Explorer should show duplicate results as a first-class section above all grouped values. Single values should be visually quiet. Details/source records should be expandable, not always visible. Summary metrics should describe the whole analysis, not the current page.

If accepted, implement Phase 1 first for quick relief, then Phase 2 to match the target app’s cleaner workflow.
