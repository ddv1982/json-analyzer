# Target UI Cleanup: Overflow, Theme Toggle, and Duplicates Ownership: Plan

## Goal
Tighten the post-parity JSON Analyzer UI so it behaves like the target app in the areas still visibly off: no controls drawn outside the results panel, an icon-only light/dark theme control with no visible theme text, and a Duplicates tab focused on true/exact duplicates while field-based duplicate exploration lives in Values.

## Background
- User screenshot shows the Duplicates tab overflowing horizontally: the selected field summary card and `Find Duplicates` control row extend past the right edge of the results panel/viewport.
- Current app shell keeps `JsonInputPanel` and `AnalysisResultsPanel` as siblings in `.workspace-grid` (`frontend/src/App.tsx:17-49`), with the results side constrained by `.workspace-grid` (`frontend/src/styles.css:388-393`). Duplicates and Values controls must fit a half-width desktop panel, not only a full-page viewport.
- Primary overflow seam: `.duplicate-toolbar` uses five grid columns with hard minimums and `auto` columns (`frontend/src/styles.css:1240-1246`) and only collapses at viewport `max-width: 980px` (`frontend/src/styles.css:1330-1341`). In the screenshot, the panel is narrow while the viewport is still wide, so that media query does not apply.
- `AdvancedDuplicateWorkflow` renders the wide row mapped to `.duplicate-toolbar`: field combobox, filter value, page-size select, nowrap parent/source checkbox, and primary button (`frontend/src/components/analysis/duplicates/AdvancedDuplicateWorkflow.tsx:301-353`).
- Additional overflow seams: `.values-layout` has a fixed first column (`frontend/src/styles.css:1157-1162`); selected field cards render raw field paths without strong wrapping (`AdvancedDuplicateWorkflow.tsx:276-291`, `frontend/src/styles.css:1195-1205`); duplicate result headings can contain long field/composite labels in flex rows (`frontend/src/components/analysis/duplicates/AdvancedDuplicatesView.tsx:20-31`, `frontend/src/styles.css:417-423`); `ExactDuplicatesView` renders a bare table without `TableScroll` (`frontend/src/components/analysis/views/ExactDuplicatesView.tsx:22-37`).
- Current `ThemeToggle` is a visible three-option radio group: options `System`, `Light`, `Dark` (`frontend/src/components/common/ThemeToggle.tsx:8-12`), visible `Theme` legend (`ThemeToggle.tsx:17`), visible option labels (`ThemeToggle.tsx:20-31`), and `Using {resolvedTheme} colors` screen-reader status (`ThemeToggle.tsx:34`).
- Target theme toggle is a single icon-only button with `Sun`/`Moon` icons and hidden accessible label `Toggle theme` (`/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/layout/theme-toggle.tsx:21-37`). It does not expose visible `Theme`, `System`, `Light`, or `Dark` text in the header.
- Current header already places the view-switch action and `ThemeToggle` together in the toolbar (`frontend/src/components/common/AppHeader.tsx:40-61`), matching target placement broadly but not target control shape.
- Current top-level tabs are target labels: `Statistics`, `Values`, `Duplicates` (`frontend/src/components/analysis/AnalysisResultsPanel.tsx:7-11`). Current `Values` routes to `ValuesExplorerView` (`frontend/src/components/analysis/ResultView.tsx:20-21`), while current `Duplicates` routes to `DuplicatesView` (`ResultView.tsx:22-23`).
- Current `DuplicatesView` renders both `ExactDuplicatesView` and `AdvancedDuplicateWorkflow` (`frontend/src/components/analysis/views/DuplicatesView.tsx:6-10`). The advanced workflow is field/composite exploration (`frontend/src/components/analysis/duplicates/AdvancedDuplicateWorkflow.tsx:219-260`) and labels results as field/composite duplicate analysis (`frontend/src/components/analysis/duplicates/AdvancedDuplicatesView.tsx:13-76`).
- Target `Duplicates` top-level renders exact/true duplicates only: target `analysis-results.tsx:85-91` routes `Duplicates` to `ExactDuplicatesView`; target copy says `No Exact Duplicates Found`, `no identical objects or values`, and duplicate groups are `exact duplicates` / `identical JSON representations` (`/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/exact-duplicates-view.tsx:51-67`, `:141-153`).
- Target field-based duplicate exploration belongs under Values: target `ValuesView` says `Explore unique values and find duplicate results` (`target components/analysis/values-view.tsx:28-35`); target Values Explorer says `Select field to analyze for unique and duplicate values` (`target values-explorer.tsx:306-327`) and calls `api.findDuplicates` for single/composite field paths (`target values-explorer/use-values-analysis.ts:101-113`).
- Current Values already has relevant field/value grouping primitives: selected-field controls (`frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:307-364`), duplicate group counts (`ValuesExplorerView.tsx:421-435`), and grouped values table (`ValuesExplorerView.tsx:440-478`). Core also separates exact/field duplicates (`src/analysis/duplicates.rs:9-43`, `:117-220`) from values grouping (`src/analysis/values.rs:36-75`, `:130-180`).
- Prior active parity plan `docs/plans/target-app-ui-parity-overnight-implementation-2026-06-04.md` marked Blocks 1–4 complete; this is a focused follow-up, not a broad redo.

## Decisions

**Superseded note (2026-06-04):** The latest product decision keeps `AdvancedDuplicateWorkflow` non-user-facing. Values shows grouped-value duplicate insights inside Values Explorer, Duplicates remains exact-only, and the workflow should not be remounted in either tab unless a future plan explicitly reverses this decision.

- **Overflow first.** Fix the shared overflow seams before moving `AdvancedDuplicateWorkflow`; the same toolbar must be safe in both old and new locations during the change.
- **Duplicates exact-only.** Top-level `Duplicates` renders true/exact duplicates only. Field/composite duplicate analysis moves out of that tab.
- **Values rehome, not deep merge.** Move the existing advanced duplicate workflow into Values as a clearly subordinate `Field duplicate values` section. Do not blend Values grouping semantics with duplicate-analysis command semantics.
- **One cohesive Values page.** Values may contain two sections, but it must not feel like two unrelated stacked apps. Use shared section hierarchy, compact headings, consistent field terminology, and aligned spacing.
- **Limit ownership stays with command family.** `ValuesExplorerView` keeps values-explorer limits and labels; `AdvancedDuplicateWorkflow` keeps duplicate-analysis limits and caps. Product copy should explain constraints as field/value analysis limits, not backend modes.
- **No visible system theme option.** `useThemePreference` continues to read existing `system` preferences for backward compatibility. The header exposes only an icon-only light/dark button; the first click from `system` stores explicit `light` or `dark`. There is intentionally no visible route back to `system` in this cleanup.

## Approach
Implement this as a frontend-only cleanup in five phases:

1. Make Values/Duplicates layouts shrink and wrap inside the results panel.
2. Make `Duplicates` exact-only.
3. Rehome field/composite duplicate exploration under Values with clear section hierarchy and preserved duplicate command limits.
4. Replace the visible theme radio group with an icon-only light/dark button.
5. Update tests and run focused validation before broader checks.

The implementation must preserve Vite/React/Tauri architecture, typed command wrappers in `frontend/src/lib/commands.ts`, existing Rust DTOs/commands, theme root attributes (`data-theme-preference`, `data-theme`, `colorScheme`), visible focus states, tab/dropdown/combobox accessibility, and light/dark support.

## Work Items

### Item 1 — Fix panel-level overflow in Values and Duplicates controls
**Goal:** Prevent Duplicates/Values controls, selected field cards, long field paths, and result tables from drawing outside the results panel or viewport.

**Done when:** The Duplicates controls fit inside the right panel in the screenshot scenario; no field summary card, checkbox row, select, or primary action extends past the panel edge; long field paths/composite labels wrap or scroll safely; exact duplicate tables use the existing horizontal-scroll primitive when needed.

**Key files:** `frontend/src/styles.css:388-393`, `frontend/src/styles.css:417-423`, `frontend/src/styles.css:743-754`, `frontend/src/styles.css:1157-1162`, `frontend/src/styles.css:1195-1205`, `frontend/src/styles.css:1240-1246`, `frontend/src/styles.css:1258-1266`, `frontend/src/styles.css:1330-1341`, `frontend/src/components/analysis/duplicates/AdvancedDuplicateWorkflow.tsx:276-353`, `frontend/src/components/analysis/duplicates/AdvancedDuplicatesView.tsx:20-31`, `frontend/src/components/analysis/views/ExactDuplicatesView.tsx:22-37`, `frontend/src/components/common/TableScroll.tsx`.

**Dependencies:** None.

**Size:** Medium.

**Implementation notes:** Prefer CSS that responds to the panel container: `min-width: 0` on grid/flex children, auto-fitting grid columns for `.values-toolbar` and `.duplicate-toolbar`, `white-space: normal` for checkbox/action rows, `overflow-wrap: anywhere` for field paths/composite labels, and `TableScroll` for exact duplicate tables. Keep existing viewport media queries as backup, but do not make them the primary overflow fix.

**Validation:** Manual smoke the screenshot state in dark mode and also light mode. In tests, assert `ExactDuplicatesView` uses a scroll region/table label if table markup changes. JSDOM cannot prove CSS overflow, so treat layout as a visual smoke requirement.

### Item 2 — Make top-level Duplicates exact/true duplicates only
**Goal:** Align top-level `Duplicates` with the target app: it should show exact duplicate analysis only, not field/composite duplicate exploration controls.

**Done when:** `DuplicatesView` renders only `ExactDuplicatesView`; the `Duplicates` tab does not show field picker, filter value, page size, parent/source details, advanced duplicate controls, or advanced duplicate results; exact duplicate empty/found copy remains concise and target-compatible.

**Key files:** `frontend/src/components/analysis/views/DuplicatesView.tsx`, `frontend/src/components/analysis/views/ExactDuplicatesView.tsx`, `frontend/src/components/analysis/ResultView.tsx:20-23`, `frontend/src/components/analysis/AnalysisResultsPanel.tsx:7-11`, `frontend/src/App.test.tsx`.

**Dependencies:** Item 1.

**Size:** Small.

**Implementation notes:** Remove the `AdvancedDuplicateWorkflow` import/render from `DuplicatesView` and remove the `jsonInput` prop from `DuplicatesView` and its `ResultView` route. Do not delete advanced duplicate components or wrappers; they are rehomed in Item 3.

**Validation:** Tests should navigate to `Duplicates` and assert exact duplicate content is present while advanced field/composite duplicate controls are absent. Existing tab ARIA and keyboard behavior must continue to pass.

### Item 3 — Rehome field/composite duplicate exploration under Values
**Goal:** Preserve current field/composite duplicate functionality while placing it where the target app puts field-based duplicate exploration: inside the Values workflow.

**Done when:** `Values` contains `ValuesExplorerView` plus a visually subordinate `Field duplicate values` section using the existing advanced duplicate workflow; the section uses Values-compatible product copy; duplicate-analysis limits/caps remain intact; existing advanced duplicate command payloads, loading/error states, filter behavior, selected field limits, pagination, and parent/source detail behavior still work.

**Key files:** `frontend/src/components/analysis/ResultView.tsx`, new or updated `frontend/src/components/analysis/views/ValuesView.tsx`, `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`, `frontend/src/components/analysis/duplicates/AdvancedDuplicateWorkflow.tsx:219-353`, `frontend/src/components/analysis/duplicates/AdvancedDuplicatesView.tsx:13-136`, `frontend/src/lib/commands.ts`, `frontend/src/lib/browser-mocks.ts`, `frontend/src/App.test.tsx`.

**Dependencies:** Items 1 and 2.

**Size:** Medium.

**Implementation notes:** Recommended low-risk approach: add a small `ValuesView` wrapper that renders `ValuesExplorerView` and `AdvancedDuplicateWorkflow`, then route `values` to `ValuesView`. The wrapper should provide clear section hierarchy: primary Values Explorer first, field duplicate values second, with compact section copy and consistent spacing. Do not merge advanced duplicate state into `ValuesExplorerView` in this pass; that would require broader async state, config-limit, and field-discovery refactoring.

**Validation:** Move existing advanced duplicate workflow tests from the Duplicates tab to the Values tab. Preserve assertions for single-field payloads, composite payloads, duplicate filters, duplicate-analysis page-size clamping, error states, selected-field limits, and parent/source details. Keep `dropdown-primitives.test.tsx` passing.

### Item 4 — Replace visible theme radio group with target-like icon-only button
**Goal:** Match the target app’s header theme control: icon-only light/dark toggle, no visible `Theme`, `System`, `Light`, or `Dark` text.

**Done when:** `ThemeToggle` renders a single icon button in the header; accessible name clearly describes the action (`Switch to dark theme` / `Switch to light theme` or equivalent); `system` remains readable internally but is not visible as a header option; clicking from a stored `system` preference stores explicit `light` or `dark`; root theme attributes and `colorScheme` behavior remain stable.

**Key files:** `frontend/src/components/common/ThemeToggle.tsx:8-35`, `frontend/src/state/useThemePreference.ts`, `frontend/src/components/common/AppHeader.tsx:40-61`, `frontend/src/styles.css` theme-toggle selectors, `frontend/src/test/setup.ts`, `frontend/src/App.test.tsx`.

**Dependencies:** None, but sequence after Items 2–3 if reducing test churn in `App.test.tsx` matters.

**Size:** Medium.

**Implementation notes:** Keep the existing `ThemeToggleProps` and `useThemePreference` contract. Replace fieldset/radio markup with one `<button type="button">` using local inline SVG or existing code-native icon markup; do not add an icon dependency. If `resolvedTheme === 'light'`, the button sets `dark`; if `resolvedTheme === 'dark'`, it sets `light`. Keep an sr-only status such as `Using light colors` if useful for assistive tech, but avoid visible header text.

**Validation:** Tests should query by button accessible name rather than radio labels. Cover: initial `system` preference resolves via mocked media, clicking stores explicit light/dark, root attributes update, and no visible `System`/`Light`/`Dark` radio UI remains.

### Item 5 — Regression validation and manual visual smoke
**Goal:** Prove the cleanup did not regress behavior, accessibility, theming, or packaging readiness.

**Done when:** Focused tests pass first, then broader frontend validation passes; root validation is attempted if time allows; packaging is not run unless explicitly requested after validation.

**Key files:** `frontend/src/App.test.tsx`, `frontend/src/components/common/dropdown-primitives.test.tsx`, `frontend/package.json`, root `package.json`, `pnpm-workspace.yaml`.

**Dependencies:** Items 1–4.

**Size:** Small.

**Validation commands:**
- `pnpm --filter frontend test -- --run App.test.tsx dropdown-primitives.test.tsx`
- `pnpm --filter frontend typecheck`
- `pnpm --filter frontend test -- --run`
- If theme bootstrap/CSP-adjacent code changes: `pnpm --filter frontend run validate:csp`
- Preferred final gate when practical: `pnpm check`

**Manual smoke:** Header theme button in light/dark; screenshot-like Duplicates state with no horizontal overflow; Duplicates exact-only empty/found states; Values field dropdown/combobox; Values field duplicate workflow; long field paths and composite keys; narrow desktop panel; light/dark/system initial load.

## Open Questions
None blocking. The plan intentionally chooses: overflow before rehome, exact-only top-level Duplicates, low-risk Values wrapper instead of async state merge, duplicate-analysis limits retained for field/composite duplicate workflow, and no visible way back to `system` after a user clicks the icon-only theme button.

## References
- Prior active parity plan: `docs/plans/target-app-ui-parity-overnight-implementation-2026-06-04.md`
- Prior investigation: `docs/investigations/target-app-ui-parity-2026-06-04.md`
- Design critique: `docs/reviews/target-ui-cleanup-overflow-theme-duplicates-plan-critique-2026-06-04.md`
- Target app source: `/Users/vriesd/projects/qa-toolbox/json-analyzer`
