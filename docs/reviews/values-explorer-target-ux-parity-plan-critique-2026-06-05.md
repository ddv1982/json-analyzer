# Values Explorer Target UX Parity Plan Critique

## Context/Scope
Reviewed only `docs/plans/values-explorer-target-ux-parity-2026-06-05.md` against its context-builder export, per request. No codebase exploration beyond the named docs.

## Findings

### 1. Top 3 under-specified seams
1. **Expansion identity/state semantics.** The plan requires duplicate/all section keys, stable group IDs, and reset-on-request behavior (`docs/plans/values-explorer-target-ux-parity-2026-06-05.md:95-99`), but does not define whether identical groups appearing in both sections share expansion state, copy state, DOM IDs, or per-section IDs. Implementers must guess whether expanding a duplicate row should also expand its all-results counterpart.
2. **Record-detail reload targeting.** The plan says a row-level CTA sets global `includeParentItems` to true and reloads analysis (`docs/plans/values-explorer-target-ux-parity-2026-06-05.md:201-206`), but not whether this reload affects the current page only, all expanded rows, pagination state, loading presentation, or expansion preservation. The export retained useful nuance: “resets page if needed only if current behavior requires” (`docs/plans/values-explorer-target-ux-parity-2026-06-05.context-builder-export.md:546`); the final plan dropped that qualifier.
3. **Compact field metadata decision.** The plan allows field stats to be omitted or moved into a disclosure (`docs/plans/values-explorer-target-ux-parity-2026-06-05.md:133-135`) without specifying the minimum metadata needed to avoid losing discoverability. The export gave more concrete framing for chip contents and optional detail disclosure (`...context-builder-export.md:337-356`).

### 2. Specificity balance
- **Over-specified tactical choices:** The forced two-option sort mapping (`Frequency`/`Alphabetical`) and hiding `first_source_path` (`docs/plans/...md:48-57`) may be too prescriptive for an implementation agent; the requirement should be outcome-based: remove backend-facing sort UI while preserving supported request semantics.
- **Dropped useful export framing:** The export explicitly preserved copy-field-set behavior during compact field selection (`...context-builder-export.md:869-872`), but the plan’s Item 3 omits it. If that behavior exists today, the final plan should not let it disappear accidentally.

### 3. Contradictions or missing dependencies
- **Record-details contradiction:** The plan says copy records stays disabled until parent items exist (`docs/plans/...md:205`) but also lists “copy action state” in collapsed rows (`docs/plans/...md:60-64`, `181`). It should clarify whether collapsed copy is “copy value/summary” while expanded copy is “copy records,” or whether a disabled record-copy control appears collapsed.
- **Verification dependency mismatch:** The plan specifies `pnpm --dir frontend ...` (`docs/plans/...md:253-255`), while the export’s generated plan later says `npm run typecheck/test/lint` from `frontend/` (`...context-builder-export.md:852-890` implies broader final verification after implementation). The plan should align on the package manager and whether lint is required.

### 4. Risk of over-planning
- Item 1 as a standalone “local UI model” pass (`docs/plans/...md:91-108`) may be unnecessary ceremony; it could merge into Items 3/5 unless a separate no-visual refactor is intentionally desired.
- The long CSS selector checklist (`docs/plans/...md:219-239`) should be simplified to “namespace Values changes and avoid shared selector churn”; the implementation agent can choose exact classes.
- The test item is useful but dense (`docs/plans/...md:241-255`); keep core contract tests and defer expand-all edge fixtures unless implementation adds meaningful branching.

### 5. Questions that would change implementation order
1. Should row expansion be implemented before the single-card/card CSS refactor, or should layout land first to reduce test churn?
2. Should record-detail loading preserve expanded row/page state after reload? If yes, expansion identity must be solved before Item 6.
3. Is copy-field-set/current copy summary behavior required to remain visible in the compact UI? If yes, field-selection and section-action work should account for it early.
4. Is lint part of acceptance, or only typecheck plus `App.values.test.tsx`?

## Recommendations
Clarify the three seams above, align verification commands, and trim tactical CSS/model sequencing. The plan is otherwise appropriately scoped to frontend-first parity and honest page-local metrics (`docs/plans/...md:271-278`).
