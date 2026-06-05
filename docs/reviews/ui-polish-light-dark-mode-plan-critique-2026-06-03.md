# UI Polish Light/Dark Mode Plan Critique

## Context/Scope

Scope: critique of `docs/plans/ui-polish-light-dark-mode-2026-06-03.md` against the original context_builder export at `prompt-exports/oracle-plan-2026-06-03-183920-ui-polish-plan-65294-7665.md`. No broad codebase exploration performed.

## Findings

### 1. Top 3 under-specified seams

1. **Theme bootstrap/hook contract is chosen but not fully operationalized.** The plan requires pre-paint root attributes and later hook updates (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:100-108`) but does not specify one shared resolver/parser to prevent `index.html` and `useThemePreference` from drifting. Export lines 178-192 called out identical resolution responsibilities for both; the plan should say whether duplication is acceptable or how invalid stored values/listener cleanup/test reset are handled.
2. **Custom control accessibility pattern is too vague for implementation.** `MultiSelectDropdown` / `ComboboxSelect` require roles, names, Escape, outside click, and keyboard toggling (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:180-192`), but an implementer still has to choose between ARIA combobox+listbox, button+listbox, roving tabindex, or `aria-activedescendant`, plus focus return and portal/no-portal behavior.
3. **Values Explorer state transitions need sharper decisions.** The plan says preserve `fieldSearch`, summaries, max limits, and request payloads (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:204-213`) but leaves ambiguity around whether dropdown search is purely local filtering, whether the summary is outside or inside the trigger, and whether clearing duplicate field must clear `duplicateFilterValue`. The export was more specific: it recommended clearing stale filter value on field clear (export lines 491-495).

### 2. Specificity balance

- **Over-specified tactical choices:** exact document attribute names and a sample localStorage key (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:100-105`) may be more contract than the implementation agent needs unless tests will assert them.
- **Useful framing dropped/softened from export:** the export explicitly warned that existing tests using native select changes will break when controls become custom (export lines 727-733). The plan mentions role/name testing (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:234-238`) but drops the migration-risk framing that would help order test updates.

### 3. Contradictions or missing dependencies

- **Dependency/order mismatch:** Item 3 depends on Items 1 and 2 (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:147`), but implementation order wires `AppHeader`/`ThemeToggle` before tokenizing CSS (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:243-247`). Either split “render toggle” from “polish toggle” or move tokenization earlier.
- **Tabs: roving tabIndex without required keyboard nav.** Item 4 requires `tabIndex` and says arrow/Home/End keyboard support is optional (`docs/plans/ui-polish-light-dark-mode-2026-06-03.md:157-163`). If inactive tabs get `tabIndex={-1}`, keyboard navigation should not be optional.

### 4. Risk of over-planning

- The long Background and References sections are useful provenance but too heavy for an implementation handoff; keep only constraints that change decisions.
- Item 7 (Curl Executor polish) may be foldable into Item 2’s tokenization acceptance plus final smoke testing unless new Curl markup is expected.
- The 12-step implementation order is more granular than needed; grouping into theme foundation, CSS token pass, accessibility/control pass, and validation would reduce sequencing churn.

### 5. Questions that would change implementation order

1. Must the theme toggle be visually polished before CSS tokenization, or may it render after tokens land?
2. Is full keyboard support mandatory for result tabs and custom controls in this pass? If yes, implement accessibility primitives before test rewrites.
3. Should duplicate filter clearing always clear `duplicateFilterValue`? If yes, decide before control integration/tests.
4. Can theme + tokenization ship before the Values Explorer custom dropdowns, or is the dropdown UX part of the same acceptance gate?
