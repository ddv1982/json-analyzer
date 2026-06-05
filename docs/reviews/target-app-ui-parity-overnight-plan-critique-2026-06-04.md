# Target App UI Parity Overnight Plan — Critique

## Context / Scope
Reviewed `docs/plans/target-app-ui-parity-overnight-implementation-2026-06-04.md` against the original context-builder draft at `docs/plans/target-app-ui-parity-context-builder-draft-2026-06-04.md`. Scope is limited to implementation-planning clarity; no plan rewrite or broad codebase exploration.

## Findings

### 1) Top 3 under-specified seams
1. **Analysis state/error ownership contract.** Item 3 says to “prefer splitting” shared `error` into input/validation and analysis channels, but does not define prop/state names, clear semantics, or how debounced validation and attempted analysis errors coexist (`target-app-ui-parity-overnight-implementation-2026-06-04.md:86-104`). The draft had a clearer state sketch and analyze flow (`target-app-ui-parity-context-builder-draft-2026-06-04.md:396-489`).
2. **Statistics tab composition.** Item 4 says to re-home `structure`, `statistics`, `fields`, and `min_max_filled` into `Statistics`, but leaves layout, priority, and whether Dashboard metrics survive to implementer judgment (`target-app-ui-parity-overnight-implementation-2026-06-04.md:107-119`). The draft preserved more useful hierarchy: metrics, distributions, structure/schema, fields, completeness/min-max (`target-app-ui-parity-context-builder-draft-2026-06-04.md:570-584`).
3. **Values vs Duplicates ownership.** Items 5–6 explicitly leave field/composite duplicate placement unresolved, yet call open questions “None blocking” (`target-app-ui-parity-overnight-implementation-2026-06-04.md:132`, `145-154`, `197`). This is a real seam because it changes component extraction, tests, and implementation order.

### 2) Specificity balance
- **Over-specified:** The plan prescribes orchestration mechanics like “keep a running checklist in this plan or an implementation note” and file conflict rules (`target-app-ui-parity-overnight-implementation-2026-06-04.md:189-194`). Useful, but too tactical for an implementation agent unless this is a coordination runbook.
- **Under-carried from draft:** The draft’s concrete `AnalysisResultsPanelProps`, `handleClearResults`, and analyze-flow steps were collapsed into broad prose (`target-app-ui-parity-context-builder-draft-2026-06-04.md:436-489`). That framing would reduce guessing without over-constraining UI markup.
- **Under-carried from draft:** The draft retained target-source verification as explicit blockers/fallbacks for Curl wording and duplicate placement (`target-app-ui-parity-context-builder-draft-2026-06-04.md:321`, `705-710`, `859-861`); the plan softens these into “None blocking,” which hides sequencing risk.

### 3) Contradictions / missing dependencies
- **Contradiction:** Open Questions says none are blocking while duplicate workflow placement remains unresolved (`target-app-ui-parity-overnight-implementation-2026-06-04.md:197`). That decision can change whether Item 5 or Item 6 owns field discovery/filter components.
- **Missing dependency:** Item 6 depends on Items 4 and 5, but if duplicate placement is answered as “Duplicates owns advanced duplicate workflow,” Item 5 should not first embed/reshape that workflow in Values.
- **Missing dependency:** Item 3 requires invalid JSON to be “reflected in results error state when analysis is attempted” (`target-app-ui-parity-overnight-implementation-2026-06-04.md:91-92`) but does not explicitly depend on preserving/adjusting existing debounced validation semantics.

### 4) Risk of over-planning
- The Visible Copy Inventory is useful, but combined with per-item copy instructions and validation gates it repeats substantially. Cut to one authoritative inventory plus item-specific deltas.
- Item 9 mostly repeats Item 8’s validation gate (`target-app-ui-parity-overnight-implementation-2026-06-04.md:164-183`). Keep Item 9 only for root/package readiness; move duplicate frontend gates to final validation.
- “Overnight Orchestration Guidance” should be shortened to conflict rules and sequencing only; checklist/process instructions are less important than resolving the duplicate-placement seam.

### 5) Questions that would change implementation order
1. Does the target place advanced field/composite duplicate analysis in `Values`, `Duplicates`, or both?
2. Should invalid JSON after an attempted Analyze create a distinct results-panel error while input validation remains independently visible?
3. Is Curl exact wording required before implementation, or is target-compatible product copy acceptable for the first pass?
4. Must Dashboard-derived summary metrics remain visible under `Statistics`, or is preserving raw structure/statistics/fields/min-max sections sufficient?
