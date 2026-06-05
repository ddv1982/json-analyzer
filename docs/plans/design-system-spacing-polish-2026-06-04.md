# Design System and Spacing Polish Plan

## Goal

Make the app feel more cohesive and intentionally designed by replacing ad hoc spacing, sizing, and component chrome with a small local design system. The target is a compact desktop utility: dense enough for repeated JSON/data work, but calmer and easier to scan than the current mixed-density layout.

This is a frontend-only plan. It should preserve the existing Vite/React/Tauri architecture, current command wrappers, existing behavior, and the current JSON Analyzer / Curl Executor information architecture.

## Current Findings

- `frontend/src/styles.css` now has usable light/dark color tokens, but spacing is still mostly hard-coded per component.
- A quick CSS value audit found many one-off values: `0.42rem`, `0.45rem`, `0.52rem`, `0.55rem`, `0.62rem`, `0.65rem`, `0.7rem`, `0.75rem`, `0.8rem`, `0.85rem`, `1.15rem`, plus fixed pixel values for control and table sizing.
- The main workspace visually mixes density levels: generous panels and editor height sit beside very compact tabs, pills, buttons, and tables.
- Cards/panels still rely on borders and nested boxes to create hierarchy. Some of this can be replaced by spacing rhythm and clearer section grouping.
- Values is the densest screen and exposes the most inconsistency: top actions, field picker, field-set card, filter controls, summaries, and tables all use slightly different spacing.
- Curl is improved because the command area comes first, but it still uses the same panel/card chrome for primary command work, instructions, preview, response, and job output.
- The app has repeated local definitions for component padding, gaps, min-heights, and typography weight instead of reusable primitives.

## Research Notes

- Salt Design System recommends spacing tokens that adapt across density modes and distinguishes container padding from spacing between related items.
- Halstack uses a 4px-derived scale and explicitly recommends replacing hard-coded spacing with tokens to reduce cognitive load and improve consistency.
- Atlassian’s spacing guidance uses a limited 8px base scale and frames spacing as a way to show relationship, hierarchy, and scanning order.
- Carbon emphasizes that spacing patterns create relationships; dense sections are acceptable, but the whole page should not become visually crowded.
- Marigold’s spacing model is especially relevant here: separate relational spacing (`gap`) from inset spacing (`padding`) and prefer implicit grouping through proximity over heavy boxes.

## Design Direction

Use a compact semantic spacing system rather than a broad component-library migration.

Recommended local token families:

- Core spacing: `--space-0`, `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-5`, `--space-6`, `--space-8`
- Semantic gaps: `--gap-xs`, `--gap-sm`, `--gap-md`, `--gap-lg`, `--gap-xl`
- Semantic insets: `--inset-control-sm`, `--inset-control-md`, `--inset-surface-sm`, `--inset-surface-md`, `--inset-surface-lg`
- Layout gutters: `--gutter-page`, `--gutter-panel`
- Shape/elevation: `--radius-control`, `--radius-surface`, `--radius-pill`, `--shadow-surface`
- Control dimensions: `--control-height-sm`, `--control-height-md`, `--control-height-lg`

The system should be intentionally compact:

- Standard control height: 34-36px.
- Small icon control: 32px.
- Surface padding: 12px for compact cards, 16px for panels, 20px only for empty/hero-like states.
- Main page gutter: responsive but bounded, roughly 12-24px.
- Sibling gaps should come from `gap`, not margin chains, wherever possible.

## Work Items

### Item 1 - Add Local Spacing and Shape Tokens

**Goal:** Create a small design-system layer at the top of `styles.css`.

**Done when:**

- `:root` defines core and semantic spacing tokens.
- Radius, shadow, and control-height tokens exist.
- Existing color tokens remain stable.
- No component behavior changes.

**Key files:** `frontend/src/styles.css`

**Size:** Small.

### Item 2 - Normalize Global Layout Rhythm

**Goal:** Make shell, header, workspace grid, panels, and primary sections use the same rhythm.

**Done when:**

- `.app-shell`, `.app-header`, `.workspace-grid`, `.panel`, `.panel-heading`, `.result-card`, `.state-card`, `.empty-state`, `.results-actions`, and `.tab-panel` consume semantic spacing.
- Header and workspace feel aligned: no arbitrary `0.85rem` / `0.65rem` rhythm.
- Page gutters stay compact on desktop and usable on narrow windows.

**Key files:** `frontend/src/styles.css`, visual smoke in app.

**Size:** Medium.

### Item 3 - Normalize Controls

**Goal:** Buttons, text inputs, selects, dropdowns, checkboxes, tabs, pills, and theme menu should share sizing and padding rules.

**Done when:**

- Buttons and form controls use shared control height/inset tokens.
- `.nav-button`, `.theme-toggle-button`, `.tab`, `.dropdown-trigger`, `.text-input`, `select`, `.combobox-clear`, and `.dropdown-clear` align visually.
- Status pills/badges are smaller and less visually dominant unless they indicate warning/error.
- Focus rings remain visible in light and dark themes.

**Key files:** `frontend/src/styles.css`, `frontend/src/components/common/ThemeToggle.tsx` only if markup hooks are needed.

**Size:** Medium.

### Item 4 - Reduce Nested Box Chrome

**Goal:** Let spacing and section rhythm do more of the visual hierarchy work, especially in results.

**Done when:**

- Statistics nested tables and cards no longer feel like every element has equal visual weight.
- Values field-set card, filter group, and summaries read as one workflow rather than multiple unrelated boxes.
- Exact duplicates and Curl preview/result sections use consistent section blocks and table wrappers.
- Borders remain where they provide useful containment or scrolling affordance.

**Key files:** `frontend/src/styles.css`, `frontend/src/components/analysis/ResultView.tsx`, `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`, `frontend/src/components/curl-executor/CurlExecutorView.tsx`.

**Size:** Large.

### Item 5 - Tune Data Density

**Goal:** Make tables, metric cards, and Values controls easier to scan without feeling cramped.

**Done when:**

- Table cell padding uses compact table tokens.
- Metric cards have a consistent compact inset and type scale.
- Values toolbar uses predictable grid columns and tokenized gaps.
- Long paths and code snippets still wrap/scroll safely.
- Mobile/narrow desktop layouts preserve readable hit targets.

**Key files:** `frontend/src/styles.css`, `frontend/src/components/common/TableScroll.tsx` only if a class hook helps.

**Size:** Medium.

### Item 6 - Add Guardrails Against Spacing Drift

**Goal:** Prevent the stylesheet from slowly returning to arbitrary values.

**Done when:**

- A short comment in `styles.css` explains which token family to use for padding, gaps, gutters, and controls.
- Optionally add a lightweight script or documented `rg` check that flags new raw `rem` spacing values outside token declarations.
- Tests remain behavioral; visual verification remains browser-based.

**Key files:** `frontend/src/styles.css`, optionally `frontend/scripts/`.

**Size:** Small.

## Implementation Order

1. Add spacing/shape/control tokens without changing visual output much.
2. Convert global shell, panels, headings, action rows, and tabs.
3. Convert controls/dropdowns/theme menu.
4. Convert metric cards, tables, and result cards.
5. Polish Values and Curl specific layouts.
6. Run validation and browser screenshots in light/dark and narrow desktop.

## Validation

Automated:

- `pnpm -C frontend run lint`
- `pnpm -C frontend run typecheck`
- `pnpm -C frontend run test`
- `pnpm -C frontend run build`

Manual browser smoke:

- JSON Analyzer empty state in light and dark.
- Analyzed Statistics tab in light and dark.
- Values tab with field picker, filters, summaries, and table.
- Duplicates tab with exact duplicate table.
- Curl Executor command, instructions, preview, response, and batch mode.
- Narrow desktop around 900-1000px and mobile-ish width around 390px.

## Non-Goals

- No Tailwind, Radix, shadcn, or component-library migration.
- No Tauri/Rust behavior changes.
- No changes to command payloads or DTOs.
- No broad redesign of app navigation beyond spacing and component hierarchy.
- No visual marketing/landing-page treatment.

## References

- Salt spacing: https://www.saltdesignsystem.com/salt/foundations/spacing
- Halstack spacing: https://developer.assure.dxc.com/halstack/next/foundations/spacing/
- Atlassian spacing: https://atlassian.design/foundations/spacing
- Carbon spacing: https://v10.carbondesignsystem.com/guidelines/spacing/overview
- Marigold spacing: https://www.marigold-ui.io/foundations/spacing
