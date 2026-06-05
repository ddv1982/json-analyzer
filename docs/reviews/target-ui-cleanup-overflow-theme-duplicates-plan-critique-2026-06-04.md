# Target UI Cleanup Overflow/Theme/Duplicates Plan — Critique

## Context / Scope
Reviewed `docs/plans/target-ui-cleanup-overflow-theme-duplicates-2026-06-04.md` against the original context-builder export at `prompt-exports/oracle-plan-2026-06-04-073135-ui-cleanup-plan-828c-182f.md`. Scope is limited to the requested planning critique; no broad codebase exploration.

## Findings

### 1) Top 3 under-specified seams
1. **Values rehome composition.** Item 3 chooses a wrapper that renders `ValuesExplorerView` plus `AdvancedDuplicateWorkflow`, but does not define section hierarchy, heading levels, whether the two independent field-discovery controls may coexist, or how to prevent the page from feeling like “two stacked apps” (`target-ui-cleanup-overflow-theme-duplicates-2026-06-04.md:82-98`).
2. **Limit/config ownership after rehome.** The export flags that moving advanced duplicates under Values may require preserving both `limits.values_explorer` and `limits.duplicates` semantics (`oracle-plan...md:43`), but the plan only says preserve selected-field limits/page-size clamping (`target-ui-cleanup...md:95-98`). Implementers must guess which limit family labels, warnings, and caps should be visible in Values.
3. **Theme `system` fallback semantics.** The plan says clicking from stored `system` should store explicit `light` or `dark` (`target-ui-cleanup...md:36-37`, `:107-109`), but does not say whether users lose any route back to system-following behavior, or whether that is intentional product behavior vs. just a header simplification.

### 2) Specificity balance
- **Over-specified tactical choices:** The plan names exact component surgery and copy strings, including adding `ValuesView`, removing `jsonInput` from `DuplicatesView`, using inline SVG/no dependency, and suggested labels (`target-ui-cleanup...md:75-98`, `:111-113`). Most is reasonable, but it leaves little room for an implementation agent to choose an equally low-risk composition.
- **Useful framing dropped from export:** The export explicitly contrasted “rehome wrapper” vs “merge into `ValuesExplorerView`” and why merging is broader async ownership work (`oracle-plan...md:394-397`). The plan includes this rationale (`target-ui-cleanup...md:93-94`) but drops the export’s warning about duplicate field discovery and config-limit ownership (`oracle-plan...md:42-43`).
- **Appropriately specific:** Container-aware overflow guidance is well scoped: the plan avoids JS measurement and viewport-only media queries while leaving exact CSS details implementation-owned (`target-ui-cleanup...md:26-31`, `:62-67`).

### 3) Contradictions / missing dependencies
- Item 3 depends on Item 2, but also practically depends on Item 1 if the rehomed workflow keeps `.duplicate-toolbar`; otherwise Values may inherit the same overflow before ownership is fixed (`target-ui-cleanup...md:56-67`, `:82-98`).
- Item 5 depends on Items 1–4, but its “cohesive workflow” goal could change Item 3’s wrapper decision; this should be a design constraint before rehoming, not only polish after it (`target-ui-cleanup...md:115-128`).
- “Open Questions: None blocking” is too strong (`target-ui-cleanup...md:133-134`); theme system behavior and Values duplicate-section hierarchy can change implementation order and tests.

### 4) Risk of over-planning
- Item 5 is mostly a quality bar for Items 1–3 and can be folded into their done/validation criteria (`target-ui-cleanup...md:115-128`).
- File lists are exhaustive enough to become noisy; trim repeated `styles.css` selector inventories and keep only seams that drive sequencing decisions.
- Item 6 is useful, but package readiness language is heavier than this focused UI cleanup needs unless release packaging is actually requested (`target-ui-cleanup...md:130-132`).

### 5) Questions that would change implementation order
1. Should the Values tab show two separate sections, or should advanced duplicate controls be visually integrated with existing Values field-selection controls?
2. After replacing the radio group, must users still be able to choose “follow system,” or is one-way conversion from `system` to explicit light/dark acceptable?
3. Which limits should govern the rehomed duplicate workflow in Values: existing duplicate limits, Values Explorer limits, or both with separate labels?
4. Should overflow fixes land before moving `AdvancedDuplicateWorkflow`, so the same toolbar is safe in both old and new locations?
