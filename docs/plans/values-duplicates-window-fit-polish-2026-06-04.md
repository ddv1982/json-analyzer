# Values and Duplicates Window-Fit Polish Plan

Date: 2026-06-04

## Goal

Make the `Values` and `Duplicates` result tabs feel minimal, easier to scan, and better fitted to the desktop app window while preserving the current analysis functionality.

The current screenshot shows the main failure mode clearly: `Grouped values` is technically functional, but the card is visually dense, horizontally clipped, and spends too much space on secondary controls and metadata before the user can read the result.

## Research Notes

### Target app comparison

The target app uses a more focused result hierarchy:

- It keeps the field/value workflow compact and uses fewer permanent controls.
- It presents summary information as a short strip instead of a large grid of boxed metrics.
- Duplicate-focused results are separated from all-results views.
- Duplicate groups use compact group cards with the primary value/count visible and details/actions close to the row.
- Advanced or secondary metadata is not allowed to dominate the default view.

Current app differences:

- `Grouped values` uses six metric cards, a multi-control toolbar, and a wide table in one card.
- The values table has a fixed `min-width: 860px`; advanced duplicates has `min-width: 820px`. In the split app layout, this causes horizontal clipping.
- `Source paths`, `Record indexes`, and `Parent/source items` are all default columns, even though they are secondary details.
- `Copy visible summary` is prominent near the top even when disabled or less important than per-result actions.
- The duplicate tabs are closer to the target app, but exact and advanced duplicates still use slightly different density and hierarchy.

### External UX guidance

- NN/g's table guidance emphasizes supporting the core table tasks: find records, compare data, inspect a single row, and act on records. It also warns that columns far off-canvas make comparison harder and increase memory load.
- Carbon's data table guidance recommends toolbars for global actions, search, filtering, display settings, and expandable rows for large amounts of detail in limited space.
- Current implementation violates the practical takeaway: too many columns are visible by default for the available container width.

References:

- https://www.nngroup.com/articles/data-tables/
- https://v10.carbondesignsystem.com/components/data-table/usage/

## UX Principles For This Pass

1. Default view should answer the main question immediately.
   - Values tab: "Which values exist, how often, and which are duplicates?"
   - Duplicates tab: "Are there duplicates, how many, and where are they?"

2. Keep primary columns visible.
   - Value/group label
   - Count
   - Duplicate status or source summary
   - Primary action

3. Move secondary metadata into expansion.
   - Source paths
   - Record indexes
   - Parent/source item details
   - Long JSON previews

4. Make controls progressive.
   - Search, duplicate-only, and sort are primary.
   - Page size, parent/source details, and export/copy summary are secondary.

5. Fit the app window first.
   - Avoid fixed table widths in result cards.
   - Prefer responsive rows/cards or narrow tables with expandable details.
   - Keep pagination visible and compact.

## Implementation Plan

### Phase 1: Grouped Values Layout

Update `ValuesExplorerView` so the `Grouped values` card has a simpler hierarchy:

- Replace the six-card `ValuesSummaryPanel` with a compact summary strip:
  - `Groups`
  - `Duplicates`
  - `Values on page`
  - `Field set`
- Remove redundant summary labels from the default view:
  - Merge `Selected field values` and `Value groups` into a single groups/values summary.
  - Keep exact counts available in accessible text or expanded details if needed.
- Tighten the card heading:
  - Title: `Grouped values`
  - Supporting text: one short sentence only.
  - Move `Copy visible summary` out of the heading area.

### Phase 2: Grouped Values Result Rows

Replace or refactor the current wide `values-groups-table`.

Preferred structure:

- Use compact result rows/cards instead of the current six-column table.
- Default row content:
  - Value group
  - Count
  - Small duplicate/single badge
  - Source path count or first source path
  - `Copy records` action
  - Expand/collapse details action
- Expanded details:
  - Full source paths
  - Record indexes
  - Parent/source items

If keeping a semantic table is lower-risk, reduce it to four columns:

- `Value`
- `Count`
- `Source`
- `Actions`

Then render record indexes and parent/source items inside an expandable detail row.

This directly fixes the screenshot problem by removing the permanent columns that force `min-width: 860px`.

### Phase 3: Values Toolbar Simplification

Make the toolbar feel closer to the target app:

- Primary row:
  - Search
  - Sort
  - Duplicate groups only
- Secondary options:
  - Page size
  - Sort direction, if not folded into the sort control
  - Parent/source details default visibility
  - Copy/export visible summary

Recommended behavior:

- Keep default sort as `Count descending`.
- Combine sort field and direction into one control if practical:
  - `Count descending`
  - `Count ascending`
  - `Value A-Z`
  - `Value Z-A`
- Keep page size in the footer or secondary options area.
- Show active secondary settings with subtle text, not large controls.

### Phase 4: Exact Duplicates Polish

The exact duplicate view is already closer to the target app, so keep the structure and refine density:

- Convert the four metric cards into the same compact summary strip used by values.
- Keep duplicate group cards.
- Tighten duplicate group headers:
  - Primary: group number and duplicate count.
  - Secondary: record indexes.
  - Actions: copy and expand/collapse.
- Reduce vertical height of empty states.
- Keep JSON preview collapsed by default when duplicates are large.

### Phase 5: Advanced Duplicates Polish

Apply the same pattern to advanced duplicates:

- Keep launch/configuration controls compact.
- In results, avoid the `min-width: 820px` table as the only useful presentation.
- Use compact duplicate group rows/cards or a narrow table with expandable detail rows.
- Default row content:
  - Duplicate key/value
  - Count
  - Field/composite set
  - Action
- Expanded details:
  - Matching indexes
  - Source paths
  - Parent/source items
  - Preview JSON

### Phase 6: CSS And Window-Fit Fixes

Update shared styles:

- Remove hard table minimums where possible:
  - `.values-groups-table { min-width: 860px; }`
  - `table.advanced-duplicates-table { min-width: 820px; }`
- Add `min-width: 0` to all nested result-card children that can overflow.
- Use compact row/card styles for values and duplicate result lists.
- Keep row actions from wrapping awkwardly with a fixed action area.
- Ensure the result cards fit in the current app split layout without horizontal clipping.
- Verify dark and light themes use the same surfaces and contrast tokens.

### Phase 7: Verification

Run:

- `pnpm -C frontend run lint`
- `pnpm -C frontend run typecheck`
- `pnpm -C frontend run test`
- `pnpm -C frontend run build`

Browser smoke:

- Values tab at the screenshot-like desktop app viewport.
- Duplicates tab with no duplicates.
- Duplicates tab with exact duplicates.
- Advanced duplicates with composite fields.
- Light and dark mode.

Acceptance criteria:

- No horizontal clipping in the Values or Duplicates tab at the current app window size.
- `Grouped values` shows the useful results without scrolling past a large control block.
- Source paths, indexes, and parent/source details remain available.
- Copy actions remain available and clearly scoped.
- The visual rhythm matches the recent design-system spacing pass.
- Light mode and dark mode both use readable, non-black result surfaces.

## Recommended First Implementation Slice

Start with `ValuesExplorerView` because it is the most visibly cramped area in the screenshot:

1. Replace `ValuesSummaryPanel` with a compact summary strip.
2. Convert `ValuesGroupsTable` to compact rows with expandable details.
3. Simplify the values toolbar.
4. Remove the fixed `min-width` from the values table styles.
5. Browser-test the screenshot viewport before touching duplicates.

Then polish exact and advanced duplicates using the same summary and result-row pattern.

## Out Of Scope

- Changing the analysis algorithm.
- Changing copy payload semantics unless a specific copy behavior is identified as wrong.
- Adding virtualization.
- Rebuilding the whole results panel navigation.
