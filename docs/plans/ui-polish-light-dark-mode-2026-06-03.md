# UI Polish, Combobox UX, and Light/Dark Mode: Plan

## Goal

Improve the target app’s frontend polish so the Vite/React/Tauri desktop UI feels closer to the more refined source app, with first-class light/dark mode support and upgraded select/combobox-style controls where they improve UX.

This is a frontend-only plan. It preserves the target app’s Vite + React + TypeScript + Tauri command architecture and adapts source-app design patterns without migrating to Next.js, Tailwind, shadcn, or a broad external component stack.

## Background

### Target app frontend seams

- `frontend/src/main.tsx:1-10` mounts React and imports the single global stylesheet, `frontend/src/styles.css`.
- `frontend/src/App.tsx:8-49` owns the top-level shell: `activeView`, `<main className="app-shell">`, `AppHeader`, JSON Analyzer two-column `.workspace-grid`, and `CurlExecutorView` routing.
- `frontend/src/components/common/AppHeader.tsx:1-43` defines app-level navigation (`AppView = 'json-analyzer' | 'curl-executor'`) and uses `.app-header`, `.app-nav`, `.nav-button`, `.scope-note` without theme controls.
- `frontend/src/state/useJsonAnalyzerState.ts:13-31` centralizes JSON analyzer UI state, including `ResultTab`, `activeTab`, `busyAction`, and `flattenNestedArrays`; theme state should live outside this analyzer-only hook because it applies to Curl Executor too.
- `frontend/src/components/analysis/AnalysisResultsPanel.tsx:6-65` owns result tab registration and renders ad hoc tab buttons with `.tab` / `.tab.active`; the panel delegates active content through `ResultView`.
- `frontend/src/components/json-input/JsonInputPanel.tsx:43-109` renders the primary JSON input panel, native textarea, flatten checkbox, and action buttons.
- `frontend/src/components/curl-executor/CurlExecutorView.tsx:320-386` uses native radio inputs and textareas for mode switching and curl command entry, and must inherit the same polish as the JSON Analyzer surface.

### Current styling and theme constraints

- `frontend/src/styles.css:1-7` sets light foreground/background directly on `:root`; the stylesheet repeats hard-coded hex values throughout cards, buttons, forms, tables, states, and code blocks.
- There is no existing target theme mechanism: no `color-scheme`, `prefers-color-scheme`, `.dark`, or `theme` usage was found under `frontend/src`.
- Global font inheritance covers `button`, `input`, and `textarea` but not `select` in `frontend/src/styles.css:18-20`.
- Shared reusable style seams already exist and should anchor the polish pass: `.app-shell`, `.workspace-grid`, `.panel`, `.result-card`, `.metric-card`, `.state-card`, `.empty-state`, `.nav-button`, `.tab`, `.primary-action`, `.text-input`, `select`, `.checkbox-row`, `.success-state`, `.error-state`, `.loading-state`, tables, `code`, and `.preview-code`.
- `frontend/src/styles.css:727-759` already has responsive breakpoints for the main layout, result grids, toolbars, and pagination; polish should preserve these behaviors.

### Target control and combobox-like seams

- Values Explorer is the densest control surface in `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`.
- Field picking is currently a search input plus checkbox-card list, not a combobox or dropdown: `ValuesExplorerView.tsx:266-313`; it enforces `maxSelectedFields` in `toggleField` at `ValuesExplorerView.tsx:186-200`.
- Selected-field summaries render separately in `ValuesExplorerView.tsx:317-352`, which means any dropdown/multi-select plan must preserve summary visibility or replace it intentionally.
- Native selects appear in Values Explorer for sort by, direction, page size, and duplicate filter field: `ValuesExplorerView.tsx:361-395` and `ValuesExplorerView.tsx:473-484`.
- Value search and duplicate filter value remain native text inputs in `ValuesExplorerView.tsx:347-357` and `ValuesExplorerView.tsx:487-495`.
- Shared select/input styling is centralized at `frontend/src/styles.css:460-474`; Values and duplicate toolbar layouts are at `frontend/src/styles.css:669-683`.
- Result tabs are an ad hoc button/nav pattern in `frontend/src/components/analysis/AnalysisResultsPanel.tsx:41-56`; they set `aria-selected` but do not use full `tablist`/`tab` roles.

### Source app comparison anchors

- The prior parity plan identifies the source app as `/Users/vriesd/projects/qa-toolbox/json-analyzer` and the target app as `/Users/vriesd/projects/json-analyzer` in `docs/plans/full-source-functionality-parity-2026-06-03.md:447-450`.
- The source app includes a home route, theme toggle, and Curl Executor link per `docs/plans/full-source-functionality-parity-2026-06-03.md:31-34`.
- Source frontend stack uses Next.js, React, Tailwind v4, Radix UI primitives, `next-themes`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, and `sonner` according to source `frontend/package.json:31-51`. The target should not adopt that stack wholesale.
- Source theme support is class-based and tokenized: source `frontend/app/styles/theme.variants.css:1` defines a `.dark` variant, source `frontend/app/styles/theme.tokens.css:1-108` defines light/dark OKLCH tokens and Tailwind token mapping, and source `frontend/app/layout.tsx:32-42` wraps the app in a `ThemeProvider` with system default and transition suppression.
- Source `frontend/components/layout/theme-toggle.tsx:9-38` provides a mounted theme toggle with Sun/Moon icon transitions.
- Source select UX uses a Radix Select wrapper in source `frontend/components/ui/select.tsx:3-165`, styled by source `frontend/app/styles/components.select.css:2-30`, with portal/popover behavior, focus rings, disabled states, scroll buttons, and selected-item indicators.
- Source multi-select UX uses source `frontend/components/ui/multi-select-dropdown.tsx:10-152`: controlled `value`, `onChange`, `maxSelected`, clear-all action, count summary, click-outside close, `role="listbox"`, `aria-multiselectable`, keyboard toggling, and metadata rows. It is used by source Values Explorer at `frontend/components/analysis/values-explorer.tsx:308-327`.

### Prior planning constraints

- The frontend architecture is intentionally Vite + React + TypeScript, not Next.js, per `docs/decisions/0003-vite-react-typescript.md:9-15` and `docs/plans/rewrite-json-analyzer-csv-align-stack-2026-06-02.md:77-82`.
- Command access should continue through typed Tauri wrappers, not raw `invoke(...)`, per `CONTRIBUTING.md:50-55` and `README.md:108-113`.
- Full parity planning keeps target state desktop-local by default rather than source URL query state in `docs/plans/full-source-functionality-parity-2026-06-03.md:203-206` and `docs/plans/full-source-functionality-parity-2026-06-03.md:443-444`.
- PDF export remains intentionally deferred; UI polish should not reintroduce it (`frontend/src/components/common/AppHeader.tsx:38-40`, `README.md:206-210`).

## Approach

Use a targeted, native frontend polish pass rather than a component-library migration. The target app already has stable React composition, shared class names, and a single global stylesheet; the lowest-risk path is to add a small app-level theme system, convert existing CSS to semantic design tokens, and create a few in-repo UI primitives for the places where native controls are limiting UX.

The recommended control strategy is selective:

- Add a searchable `MultiSelectDropdown` for Values Explorer field selection, adapting the source app’s count summary, max-selected guard, clear action, metadata rows, click-outside close, and keyboard toggling. Use a button-trigger plus non-portal popover/listbox pattern first so it stays simple inside the existing panel layout; return focus to the trigger on close.
- Add a searchable `ComboboxSelect` for the duplicate filter field, because discovered field lists can grow long and native select search is inconsistent. Use an input-driven combobox/listbox pattern with `aria-expanded`, `aria-controls`, and either roving focus or `aria-activedescendant` chosen explicitly in implementation and covered by tests.
- Keep native selects for small fixed lists such as sort by, direction, and page size; polish them with theme tokens and focus styles instead of overbuilding custom dropdowns.
- Keep native radios for Curl Executor mode selection and native textareas for JSON/curl input; improve their surfaces through shared tokens and layout polish.

Theme support should be app-level and independent of analyzer state. Add a small `useThemePreference` hook with `system | light | dark`, a pre-React bootstrap script in `frontend/index.html` to avoid theme flash, and document-root attributes that drive CSS tokens. Persist preference in `localStorage`; default to system and tolerate `localStorage` / `matchMedia` failures. To prevent bootstrap/hook drift, define one canonical preference contract in the hook module for React and mirror only the minimal parser/resolver logic in the inline bootstrap script; tests should cover invalid stored values, listener cleanup, and document attribute reset.

The CSS pass should introduce semantic variables for background, surface, text, muted text, borders, focus rings, accent, states, controls, code, table, and editor surfaces. Then replace hard-coded colors incrementally across the existing shared classes so both JSON Analyzer and Curl Executor inherit the new polish without broad markup churn.

Finally, tighten accessibility where polish work already touches markup: result tabs should use full `tablist` / `tab` / `tabpanel` relationships, custom dropdowns should expose role/name-based interactions, and tests should move toward accessible interactions rather than implementation-specific DOM queries.

## Work Items

### Item 1 — Theme foundation

**Status:** Complete on 2026-06-03. Added `useThemePreference`, pre-paint bootstrap, root theme attributes, persistence, matchMedia handling, and tests.

**Goal:** Add first-class light/dark/system theme support with persisted preference and no broad architecture changes.

**Done when:**

- App supports System, Light, and Dark modes.
- Preference persists across reloads/app launches using `localStorage`.
- `document.documentElement` receives resolved theme attributes before React paints.
- Theme changes update stable root theme/preference attributes and `color-scheme`; tests may assert these contract names once selected.
- Bootstrap script and React hook share the same accepted preference values and invalid-value fallback behavior.
- System theme changes update the resolved theme while preference is `system`, and listeners are cleaned up.
- Browser dev, tests, and Tauri remain supported, with storage and `matchMedia` failures handled safely.

**Key files:** `frontend/index.html`, new `frontend/src/state/useThemePreference.ts`, `frontend/src/App.tsx`, `frontend/src/test/setup.ts` if a `matchMedia` shim is needed.

**Dependencies:** None.

**Size:** Medium.

### Item 2 — Tokenize and polish global CSS

**Status:** Complete on 2026-06-03. Converted the global stylesheet to semantic light/dark tokens across existing shared surfaces, including JSON Analyzer and Curl Executor styling.

**Goal:** Replace light-only hard-coded colors with semantic CSS tokens and improve shared visual primitives across the app.

**Done when:**

- `frontend/src/styles.css` defines light and dark token sets on `:root` and `:root[data-theme='dark']`.
- Body, shell, panels, result cards, metric cards, state cards, empty states, buttons, inputs, textareas, selects, code blocks, tables, status pills, Values Explorer, duplicate results, and Curl Executor surfaces use tokens rather than raw light-only colors.
- Focus-visible states are consistent and visible in both themes.
- Disabled, warning, success, error, loading, and mock states are legible in both themes.
- Existing responsive breakpoints and class names remain intact unless a later item intentionally adds a new hook.

**Key files:** `frontend/src/styles.css`.

**Dependencies:** Item 1.

**Size:** Large.

### Item 3 — Header polish and theme toggle

**Status:** Complete on 2026-06-03. Wired `ThemeToggle` through `App`/`AppHeader` with accessible System/Light/Dark radio options and responsive tokenized styling.

**Goal:** Add a visible app-level theme control and refine the high-visibility header/nav area.

**Done when:**

- `App` wires `useThemePreference` and passes theme props to `AppHeader`.
- `AppHeader` renders a `ThemeToggle` near the navigation/scope-note area without disturbing existing app view switching.
- The toggle exposes accessible System, Light, and Dark options and updates the app immediately.
- Header, nav buttons, scope note, and theme toggle remain responsive and visually cohesive in both themes.

**Key files:** `frontend/src/App.tsx`, `frontend/src/components/common/AppHeader.tsx`, new `frontend/src/components/common/ThemeToggle.tsx`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`.

**Dependencies:** Item 1 for wiring. Item 2 should land before final visual polish of the toggle/header, but a functional unpolished toggle may be added earlier to test theme switching.

**Size:** Medium.

### Item 4 — Accessible result tabs

**Status:** Complete on 2026-06-03. `AnalysisResultsPanel` now uses tablist/tab/tabpanel semantics with stable IDs, roving focus, and arrow/Home/End keyboard navigation.

**Goal:** Upgrade analysis result tabs to complete tab semantics while preserving existing analyzer state and routing.

**Done when:**

- `AnalysisResultsPanel` uses `role="tablist"`, `role="tab"`, and `role="tabpanel"` with stable IDs, `aria-controls`, `aria-labelledby`, and correct `tabIndex`.
- Existing click-based tab switching still works through `setActiveTab` and `ResultView`.
- Arrow/Home/End keyboard navigation works when inactive tabs use `tabIndex={-1}`; if the implementation chooses not to add keyboard navigation, inactive tabs must remain normally tabbable instead.
- Tab styling remains polished and tokenized in both themes.

**Key files:** `frontend/src/components/analysis/AnalysisResultsPanel.tsx`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`.

**Dependencies:** Item 2.

**Size:** Small to Medium.

### Item 5 — Add focused dropdown primitives

**Status:** Complete on 2026-06-03. Added app-data-agnostic `MultiSelectDropdown` and `ComboboxSelect` primitives with documented ARIA models, tokenized styling, and dedicated tests. Values Explorer integration may extend the multi-select search contract if needed to keep field discovery state owned by `ValuesExplorerView`.

**Goal:** Add small in-repo combobox/multi-select components for high-value UX improvements without pulling in a broad external UI dependency.

**Done when:**

- New `MultiSelectDropdown` supports controlled selected values, search input, max selection, disabled unselected options at the limit, loading/error/empty states, selected count, clear-all, click-outside close, Escape close, focus return, and keyboard toggling.
- New `ComboboxSelect` supports controlled single selection, search/filtering, clear option, and accessible labeling.
- The implementation chooses and documents one ARIA interaction model per component: button-trigger + listbox for multi-select, and combobox + listbox for single-select.
- Components are app-data-agnostic and do not import Tauri commands or own Values Explorer state.
- Components are styled through `styles.css` tokens and work in both light and dark themes.
- Tests interact with them by role/name rather than brittle class selectors.

**Key files:** new `frontend/src/components/common/MultiSelectDropdown.tsx`, new `frontend/src/components/common/ComboboxSelect.tsx`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`.

**Dependencies:** Item 2.

**Size:** Large.

### Item 6 — Upgrade Values Explorer controls

**Status:** Complete on 2026-06-03. Values Explorer now uses `MultiSelectDropdown` for field selection and `ComboboxSelect` for duplicate filter fields while preserving existing command payloads, selected summaries, max limits, async guards, and native small-list selects.

**Goal:** Apply the new dropdown primitives where they materially improve Values Explorer UX while preserving command/data behavior.

**Done when:**

- Field picker uses `MultiSelectDropdown` instead of the visible search input plus checkbox-card list.
- Existing state ownership remains in `ValuesExplorerView`: `fieldSearch`, `fields`, `selectedFields`, `selectionLimitMessage`, discovery loading/error, and async request guards.
- Auto-select-first-field behavior, `maxSelectedFields`, page reset on selection change, no-selection behavior, and selection-limit messaging are preserved.
- Selected-field summaries remain visible or are intentionally replaced by an equivalent always-visible summary.
- Duplicate filter field uses `ComboboxSelect`; clearing it always clears `duplicateFilterValue` so stale hidden filter values cannot affect later duplicate requests.
- Sort by, direction, and page size remain native selects with improved styling.
- `discoverValuesFields`, `analyzeValues`, `analyzeAdvancedFieldDuplicates`, and `analyzeCompositeDuplicates` request payloads are unchanged.

**Key files:** `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`, `frontend/src/components/analysis/duplicates/AdvancedDuplicatesView.tsx` only if minor class/style hooks are needed, `frontend/src/styles.css`, `frontend/src/App.test.tsx`.

**Dependencies:** Items 2 and 5.

**Size:** Large.

### Item 7 — Curl Executor shared polish pass

**Status:** Complete on 2026-06-03 for the planned shared visual pass. Curl Executor inherits the new tokenized light/dark styling; no Curl behavior or command changes were introduced.

**Goal:** Ensure the second app surface benefits from the theme/token work and feels as polished as the JSON Analyzer surface.

**Done when:**

- Curl input, mode toggle, instructions, preview cards, response cards, tables, progress, warning/error states, and response previews are visually consistent in both themes.
- Native mode radios remain accessible and appropriate for the two fixed options.
- No Curl command behavior, DTOs, permissions, or Rust code changes are introduced.
- Existing Curl tests continue to pass after any role-preserving markup/class adjustments.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx` if minor class hooks are needed, `frontend/src/styles.css`, `frontend/src/App.test.tsx`.

**Dependencies:** Item 2.

**Size:** Medium.

### Item 8 — Test and validation updates

**Status:** Complete on 2026-06-03. Updated theme, tab, primitive, and Values Explorer tests; coordinator validation from `frontend/` passed `npm test`, `npm run lint`, and `npm run build`.

**Goal:** Update regression coverage for theme behavior, accessible tabs, and the custom Values Explorer controls.

**Done when:**

- `App.test.tsx` covers theme toggle behavior, including persisted preference and/or document root attributes at a useful level.
- Values Explorer tests are migrated from native `fireEvent.change` assumptions for replaced controls to accessible role/name interactions.
- Existing JSON Analyzer, duplicate analysis, and Curl workflows remain covered.
- `frontend/src/test/setup.ts` includes a `matchMedia` shim and test cleanup for localStorage/document theme attributes if needed.
- Frontend validation passes: lint/typecheck if configured, tests, and build.

**Key files:** `frontend/src/App.test.tsx`, `frontend/src/test/setup.ts`, `frontend/package.json` scripts only if existing validation scripts need to be referenced in docs or CI.

**Dependencies:** Items 1, 3, 4, 5, and 6.

**Size:** Medium.

## Implementation Order

1. Add `useThemePreference`, the `index.html` bootstrap script, and test setup for `matchMedia`/theme cleanup.
2. Wire a functional `ThemeToggle` through `App` and `AppHeader`.
3. Tokenize `styles.css` and polish shared primitives, including header/nav/toggle, panels/cards/forms/tables/status states, Values Explorer, duplicate results, and Curl Executor surfaces.
4. Upgrade `AnalysisResultsPanel` tab semantics and keyboard behavior.
5. Add `MultiSelectDropdown` and `ComboboxSelect` with accessible interactions and tokenized styling.
6. Integrate the new controls into `ValuesExplorerView`, including duplicate-filter clearing behavior.
7. Update affected tests as control semantics change, preserving coverage of JSON Analyzer, duplicate, and Curl workflows.
8. Run frontend validation and manually smoke JSON Analyzer and Curl Executor in light, dark, and system modes.

## Open Questions

None blocking. Implementation completed on 2026-06-03 with frontend validation passing from `frontend/` (`npm test`, `npm run lint`, `npm run build`). The plan chooses persisted `system | light | dark` theme preference, a lightweight in-repo component layer for only the new dropdown primitives, and selective custom control upgrades rather than replacing every native select.

## References

- Target app: `/Users/vriesd/projects/json-analyzer`
- Source app: `/Users/vriesd/projects/qa-toolbox/json-analyzer`
- `docs/plans/full-source-functionality-parity-2026-06-03.md`
- `docs/plans/rewrite-json-analyzer-csv-align-stack-2026-06-02.md`
- `docs/decisions/0003-vite-react-typescript.md`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/styles.css`
- `frontend/src/components/common/AppHeader.tsx`
- `frontend/src/components/analysis/AnalysisResultsPanel.tsx`
- `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`
- `frontend/src/components/curl-executor/CurlExecutorView.tsx`
- `frontend/src/App.test.tsx`
- `README.md`
- `CONTRIBUTING.md`
