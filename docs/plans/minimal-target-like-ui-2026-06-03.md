# Minimal Target-Like UI: Plan

## Goal
Make the current JSON Analyzer frontend feel closer to the target app’s minimal, tool-like UI: calmer hierarchy, smaller controls, flatter cards, denser layouts, and simpler header/results chrome while preserving the existing Vite/React/Tauri IPC architecture and current light/dark/theme foundations.

## Background
- Current app shell is driven by `frontend/src/App.tsx:14-56`: `app-shell` wraps `AppHeader`, then JSON Analyzer uses `workspace-grid` for input/results and Curl Executor is switched by `activeView`.
- Current styling is centralized in `frontend/src/styles.css`. Key seams are theme tokens at `styles.css:1-113`, global button sizing at `styles.css:126-146`, app shell/header/grid density at `styles.css:205-238` and `styles.css:347-354`, shared cards at `styles.css:356-368`, tabs at `styles.css:555-576`, dropdown/combobox controls at `styles.css:701-888`, and Values Explorer layout/table density at `styles.css:988-1177`.
- Current header in `frontend/src/components/common/AppHeader.tsx:20-60` carries title copy, navigation buttons, `ThemeToggle`, and a scope note. This adds visible chrome before the work area.
- Current JSON input panel in `frontend/src/components/json-input/JsonInputPanel.tsx:41-107` uses a large panel, prominent pills, textarea, checkbox row, and primary action row.
- Current result tabs in `frontend/src/components/analysis/AnalysisResultsPanel.tsx:17-131` already have correct ARIA tablist/tab/tabpanel semantics and roving keyboard navigation; the main opportunity is visual treatment, not behavior.
- Current dropdown primitives are `frontend/src/components/common/MultiSelectDropdown.tsx:46-331` and `frontend/src/components/common/ComboboxSelect.tsx:33-246`; they are functional and accessible enough after the review fixes, but their current visual styling is larger and more descriptive than the target app’s compact select/popover style.
- Current Values Explorer integrates `MultiSelectDropdown` at `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:303-366`, value controls at `ValuesExplorerView.tsx:370-443`, duplicate controls at `ValuesExplorerView.tsx:490-574`, and dense result rows in `ValuesExplorerView.tsx:581-650`.
- Target app uses a quieter centered shell: `container mx-auto px-4 py-8 max-w-7xl`, compact header, `Separator`, then a balanced two-column grid with `gap-6 lg:grid-cols-[1fr_1fr]` (`/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/app/page.tsx:26-63`). Current repo uses a larger hero-style shell, radial background, oversized `h1`, header aside/scope note, and uneven `0.85/1.15` workspace grid (`frontend/src/styles.css:133-238`, `frontend/src/styles.css:347-351`, `AppHeader.tsx:21-58`).
- Target header actions are a simple top-right toolbar: title/description left, `Curl Executor` and `ThemeToggle` right (`target frontend/app/page.tsx:29-50`). Current header treats nav/theme/scope note as a heavier secondary panel (`AppHeader.tsx:28-58`).
- Target cards use smaller radii/padding and subtle shadows: `rounded-xl`, border, `py-5`, `px-5`, `shadow-sm`, hover transition (`target frontend/app/styles/components.card.css:1-28`). Current cards/panels use larger `24px` radii, heavy `0 20px 60px` shadows, and clamp padding (`styles.css:353-363`).
- Target controls are compact shadcn/Radix-sized controls: `h-8/h-9`, `rounded-md`, `text-sm font-medium` (`target frontend/app/styles/components.button.css:3-47`). Current buttons are pill-shaped, larger, and very bold (`styles.css:142-158`).
- Target select/popover controls are compact: Radix Select trigger `h-9`, `px-3 py-2 text-sm`, `rounded-md`, min-width tied to trigger, and compact list items with a check indicator (`target frontend/components/ui/select.tsx:27-108`, `target frontend/app/styles/components.select.css:1-31`). Current dropdown/combobox styling is visually bulkier with larger radii, padding, descriptions, and stronger selected/active states (`ComboboxSelect.tsx:131-220`, `styles.css:760-873`).
- Target filter rows use precise compact grids such as `gap-3 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto]`, labels `text-sm font-medium`, and small outline buttons (`target frontend/components/analysis/values-explorer/filter-controls.tsx:40-89`). Current toolbar labels and layouts lean more dashboard-like with uppercase/bold styling and bespoke spacing (`styles.css:866-874`, `styles.css:946-969`).
- Target tabs are enclosed segmented controls: `inline-flex h-9 rounded-lg p-1 border`, triggers `text-sm font-medium px-2`, active state with border/shadow (`target frontend/app/styles/components.tabs.css:1-64`, `target frontend/components/analysis/analysis-results.tsx:53-92`). Current tabs are loose pill buttons with active dark fill (`styles.css:548-572`).
- Target typography is calmer: `h1 text-3xl md:text-4xl lg:text-5xl`, paragraphs `text-sm md:text-base leading-7 text-muted-foreground`, short copy (`target frontend/app/styles/base.typography.css:1-46`, `target frontend/app/page.tsx:32-40`). Current hierarchy relies on a very large compressed `h1`, all-caps eyebrows, very heavy labels, and longer explanatory copy (`styles.css:183-258`, `AppHeader.tsx:22-27`).
- Prior UI/light-dark plan intentionally avoided a framework migration and kept the native Vite/React/Tauri stack (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:3-8`, `docs/plans/ui-polish-light-dark-mode-2026-06-03.md:64-68`). That constraint remains load-bearing: this plan should refine the existing CSS/components, not import Tailwind/shadcn/Radix wholesale.
- Prior critique warned that control ARIA/focus semantics and theme bootstrap/hook drift should remain explicit when controls change (`docs/reviews/ui-polish-light-dark-mode-plan-critique-2026-06-03.md:9-35`). This plan should not regress the accessible behavior already added.

## Approach
Refine the UI as a targeted native CSS/component pass. The implementation should primarily evolve `frontend/src/styles.css`, with small markup or class-hook changes only where CSS alone cannot reduce chrome or align layout. Preserve the current Vite/React/Tauri IPC architecture, existing light/dark/system theme contract, and the accessible behavior already covered by tests.

The decision rule is: **content over chrome; compact but not hidden; no behavior, schema, IPC, or accessibility regression**. Target-app references are design inspiration for proportion and density, not instructions to copy Tailwind/Radix implementation details.

The recommended direction is:

1. Establish a calmer global density baseline using existing tokens/classes as the source of truth. Prefer token and shared-selector tuning over one-off component overrides. As guardrails, move large rounded/shadowed surfaces toward compact card proportions: panels/cards around `12px–16px` radius, controls around `8px–10px`, button/input/select heights near the existing target-like `h-8/h-9` range, and shadows closer to subtle elevation than hero-card depth.
2. Simplify the app header from a hero-like block into a compact tool header. Keep the product title, short functional lede, JSON Analyzer/Curl navigation, theme toggle, and scope note available, but restyle/collapse the scope note into muted inline copy rather than a prominent card. Do not remove functional navigation or theme controls.
3. Flatten shared cards, state panels, metric cards, tables, and code chips so result content reads as the primary surface rather than card chrome.
4. Restyle existing accessible result tabs as compact segmented controls without changing tab roles, IDs, roving `tabIndex`, or keyboard handling.
5. Tighten Values Explorer and dropdown/combobox visuals while preserving the current custom-control ARIA/focus/search behavior. Retain useful selected-field summaries and option metadata, but compress their typography/spacing; do not hide field paths, selected counts, loading/error states, duplicate validation warnings, or sample/summary context that affects user decisions.
6. Let Curl Executor inherit shared style changes, with an early smoke check after shared CSS changes and a final pass only if inherited styles leave a visibly inconsistent surface.

This is not a component-system migration. Do not import Tailwind, shadcn, Radix, or another UI library. The target app is the design reference for density and shape, not a source for direct framework adoption.

## Work Items

### Item 1 — Establish the global minimal density baseline
**Goal:** Tune the shared visual primitives so the whole app moves from large, hero-like dashboard chrome toward the target app’s compact native-tool feel.

**Done when:** `styles.css` uses existing tokens/shared selectors to apply subtler shadows, smaller radii, tighter spacing, calmer typography, and compact default controls across light and dark themes; existing theme tokens and focus-visible states still work. Component-specific overrides are used only when shared selectors cannot express the target-like density cleanly.

**Key files:** `frontend/src/styles.css:1-113`, `frontend/src/styles.css:126-146`, `frontend/src/styles.css:205-238`, `frontend/src/styles.css:356-368`, `frontend/src/styles.css:680-696`.

**Dependencies:** None.

**Size:** Large.

### Item 2 — Simplify the app shell and header chrome
**Goal:** Turn the header into a compact tool header closer to the target app: shorter hierarchy, less explanatory chrome, and nav/theme controls presented as a simple toolbar.

**Done when:** `AppHeader` still exposes JSON Analyzer/Curl navigation and theme control, but title scale, lede, eyebrow, scope note, nav, and theme toggle styling are visually quieter and take less vertical space. The scope note remains available as muted inline/help text rather than a prominent card. `App.tsx` routing and `ThemeToggle` props remain unchanged unless a small class hook is required.

**Key files:** `frontend/src/components/common/AppHeader.tsx:20-60`, `frontend/src/components/common/ThemeToggle.tsx:15-34`, `frontend/src/App.tsx:14-56`, `frontend/src/styles.css:205-345`.

**Dependencies:** Item 1.

**Size:** Medium.

### Item 3 — Flatten shared panels, cards, metrics, states, and tables
**Goal:** Make result and status surfaces feel more like compact tool content and less like heavy cards.

**Done when:** `.panel`, `.result-card`, `.state-card`, `.empty-state`, `.metric-card`, tables, and inline `code` styling use tighter padding, lighter shadows, smaller radii, and readable but denser text. Dashboard, structure, statistics, fields, duplicates, min/max, JSON input, and common status panels inherit the improvements without behavior changes. Component-specific edits are made only where shared primitive changes fail visually.

**Key files:** `frontend/src/styles.css:356-368`, `frontend/src/styles.css:506-548`, `frontend/src/styles.css:578-610`, `frontend/src/styles.css:650-674`, `frontend/src/components/common/Metric.tsx:1-8`, `frontend/src/components/common/StatusPanels.tsx:4-57`, `frontend/src/components/analysis/views/*.tsx`, `frontend/src/components/analysis/duplicates/AdvancedDuplicatesView.tsx`.

**Dependencies:** Item 1.

**Size:** Medium.

### Item 4 — Restyle result tabs as compact segmented controls
**Goal:** Match the target app’s enclosed segmented tab treatment while keeping the existing accessible tab implementation intact.

**Done when:** `.tab-list` renders as a compact bordered segmented container, `.tab` renders as smaller segments, active state is subtle/raised rather than a high-contrast pill, horizontal overflow still works, and existing keyboard/ARIA tab tests continue to pass.

**Key files:** `frontend/src/components/analysis/AnalysisResultsPanel.tsx:17-131`, `frontend/src/styles.css:555-576`, `frontend/src/App.test.tsx`.

**Dependencies:** Item 1 and Item 3.

**Size:** Small.

### Item 5 — Compact Values Explorer and custom control visuals
**Goal:** Make the densest workflow feel minimal and deliberate: tighter field selector, summaries, toolbars, duplicate controls, dropdown popovers, and grouped-value tables.

**Done when:** Values Explorer uses tighter grid gaps and card spacing; selected-field summaries remain visible but denser; field paths, selected counts, option metadata, loading/error states, duplicate validation warnings, and sample/summary context remain available; `.values-toolbar` and `.duplicate-toolbar` feel like compact form rows; `MultiSelectDropdown` and `ComboboxSelect` are visually closer to target app select/popover controls while preserving props, state ownership, search reset, focus return, `aria-controls`, and `aria-activedescendant`; Values Explorer behavior tests and dropdown primitive tests still pass.

**Key files:** `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx:303-650`, `frontend/src/components/common/MultiSelectDropdown.tsx:46-331`, `frontend/src/components/common/ComboboxSelect.tsx:33-246`, `frontend/src/styles.css:701-888`, `frontend/src/styles.css:988-1177`, `frontend/src/components/common/dropdown-primitives.test.tsx`, `frontend/src/App.test.tsx`.

**Dependencies:** Items 1, 3, and 4.

**Size:** Large.

### Item 6 — Verify Curl Executor inherits the minimal system cleanly
**Goal:** Keep Curl Executor visually consistent with the refined app shell without changing curl command behavior.

**Done when:** Curl Executor is smoke-checked once after shared CSS/card/table/control changes and again after Values Explorer/dropdown refinements. Panels, controls, mode toggles, preview code, history/job tables, and result cards inherit the compact system; any Curl-specific class hook is minimal and visual-only; command calls, polling, cancellation, batch confirmation, DTOs, and feature-flag behavior are unchanged.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`.

**Dependencies:** Item 1 and Item 3 for the initial Curl smoke check; Item 5 before the final Curl consistency pass.

**Size:** Medium.

### Item 7 — Regression validation and manual visual smoke
**Goal:** Confirm the minimal UI pass preserves current behavior and does not regress light/dark/system theming or accessibility.

**Done when:** From `frontend/`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass. From repo root, `pnpm check` is the broader preferred final validation when Rust/Tauri checks are in scope. Manual smoke covers JSON Analyzer, Values Explorer dropdowns and duplicates, Curl Executor workflows, and light/dark/system theme switching. Visual acceptance uses before/after screenshots or side-by-side app windows for representative light and dark states: shell/header, JSON input/results tabs, Values Explorer, and Curl Executor.

**Key files:** `frontend/package.json`, `package.json`, `frontend/src/App.test.tsx`, `frontend/src/components/common/dropdown-primitives.test.tsx`, `frontend/src/test/setup.ts`.

**Dependencies:** Items 1–6.

**Size:** Small.

## Open Questions
None blocking. The plan intentionally chooses a CSS-first refinement over a component-library migration and keeps current accessible behaviors as hard constraints.

## References
- Current UI polish plan: `docs/plans/ui-polish-light-dark-mode-2026-06-03.md`
- Prior UI plan critique: `docs/reviews/ui-polish-light-dark-mode-plan-critique-2026-06-03.md`
- Full source parity plan: `docs/plans/full-source-functionality-parity-2026-06-03.md`
- Target app source: `/Users/vriesd/projects/qa-toolbox/json-analyzer`
