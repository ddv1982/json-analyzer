# Values Explorer Target Text Parity Plan Critique

## Context/Scope
Reviewed only `docs/plans/values-explorer-target-text-parity-2026-06-05.md` and its context-builder export. No broad codebase exploration.

## Findings

### 1. Top 3 under-specified seams
1. **Collapsed-state status policy.** The plan says the card defaults collapsed and errors remain visible (`docs/plans/values-explorer-target-text-parity-2026-06-05.md:67-71`), but not which non-error statuses must be surfaced in the header vs body: discovery/analysis loading, selected-field count, clipboard failure, page-size clamp warning, or stale-result clearing. The export was more concrete about clipboard failure and “do not auto-expand on error” (`...context-builder-export.md:239-242`); the final plan should preserve that decision.
2. **Collapsed row copy semantics.** Item 5 requires collapsed rows to show a “copy action” (`...text-parity-2026-06-05.md:154`), while Item 6 says `Copy records` remains disabled until parent items exist (`...md:181-182`). Implementers must guess whether the collapsed action copies the value/group label, remains a disabled record-copy button, or moves record copy into expanded details.
3. **Field-chip metadata minimum.** The plan moves field stats behind `Field details` (`...md:90-91`) and says path may be available via code/title/accessible text, but it does not define the minimum visible metadata for disambiguating similar labels. The export’s “use existing `MultiSelectDropdown`” framing (`...context-builder-export.md:250`) is useful, but the final plan should state whether full path must be visible by default.

### 2. Specificity balance
- **Over-specified:** Hiding `direction`/`first_source_path` and moving page size to a specific header/footer location (`...text-parity-2026-06-05.md:109-114`) may over-constrain implementation. Better acceptance: remove backend-facing controls, keep honest sort/search semantics, and reduce toolbar density.
- **Dropped useful framing:** The export notes target source files were unavailable and target facts come from selected docs (`...context-builder-export.md:50`). The final plan references target local paths directly, which could imply stronger evidence than the planning context had.

### 3. Contradictions or missing dependencies
- Follow-ups A/B are correctly out of scope, but implementation order should depend on them only if exact target filter/global metrics are required (`...text-parity-2026-06-05.md:242-259`).
- Verification says only typecheck plus focused Values test unless shared primitives change (`...md:224-227`), but Items 2/7 name `MultiSelectDropdown`, `Metric`, and CSS seams. That likely triggers broader frontend tests, not merely “if shared primitives are changed.”

### 4. Risk of over-planning
- The CSS selector checklist can be simplified to “Values-scoped density styles; avoid global token/shared-surface churn.”
- Item 8’s test list is valuable but long; prioritize behavior-contract tests and a few visible hierarchy/text assertions rather than encoding every copy removal.
- Backend follow-up sketches should stay brief; request/response examples risk becoming premature API design.

### 5. Questions that would change implementation order
1. Should collapsed-card status handling be implemented before visual CSS so tests can lock the disclosure/error behavior first?
2. What exactly should the collapsed row copy action copy before parent items are loaded?
3. Must full field paths be visible on chips by default, or is title/accessible text sufficient?
4. Is exact target filtering/global metrics a near-term backend dependency, or should this pass deliberately avoid any API work?
5. Should broader frontend tests be mandatory if `MultiSelectDropdown`, `Metric`, or shared CSS primitives are touched?
