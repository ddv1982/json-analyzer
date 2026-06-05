# Critique: Full Source Functionality Parity Plan

## Context/Scope

Scope limited to `docs/plans/full-source-functionality-parity-2026-06-03.md` compared with `prompt-exports/oracle-plan-2026-06-03-092042-parity-plan-f248ab-56fc.md`. No broad codebase exploration performed.

## Findings

### 1. Top 3 under-specified seams

1. **Flatten semantics before implementation.** Item 4 says to add a “flatten nested arrays toggle” and `flatten` analysis option (`docs/plans/full-source-functionality-parity-2026-06-03.md:122-129`), but not whether this means source-compatible recursive flattening, one-level flattening, analysis-only flattening, or field-path normalization changes. An implementer could change analyzer contracts before fixtures pin this.
2. **Values Explorer contract shape.** Item 5 requires selected fields, counts, source paths, parent records, missing/null handling, search/filter/sort/page (`docs/plans/full-source-functionality-parity-2026-06-03.md:139-147`), but omits the response row identity, stable sort tie-breakers, page index base, and whether field discovery is part of the same operation. The export explicitly framed this as “field discovery, selected-field value rows” (`prompt-exports/oracle-plan-2026-06-03-092042-parity-plan-f248ab-56fc.md:358-359`); the plan’s Item 5 goal dropped “field discovery.”
3. **Report/PDF boundary.** Item 10 mandates report data with a “generated timestamp” (`docs/plans/full-source-functionality-parity-2026-06-03.md:223-231`) but does not specify deterministic timestamp injection, timezone, or whether report generation is service-owned vs. frontend-owned. This can make tests flaky and blur the “data shape” vs. “PDF rendering” boundary.

### 2. Specificity balance

- **Over-specified tactical choices:** Item 13 names `src/curl/mod.rs`, `parser.rs`, and `guard.rs` (`docs/plans/full-source-functionality-parity-2026-06-03.md:275-287`); Item 10 names `src/analysis/report.rs` or `src/report.rs` (`docs/plans/full-source-functionality-parity-2026-06-03.md:223-235`). These are reasonable examples, but the plan reads as prescriptive file architecture rather than allowing the implementation agent to choose once DTOs/tests exist.
- **Useful framing dropped/softened:** The export says HTTP/OpenAPI is “not required for desktop user-visible parity” and the “recommended default” is to keep it deferred (`prompt-exports/oracle-plan-2026-06-03-092042-parity-plan-f248ab-56fc.md:204-207`). The plan moves this to optional Item 19 (`docs/plans/full-source-functionality-parity-2026-06-03.md:375-386`), which may invite unnecessary planning/implementation attention.
- **Metrics ambiguity expanded:** The export says metrics only “if required by parity” (`prompt-exports/oracle-plan-2026-06-03-092042-parity-plan-f248ab-56fc.md:602-614`); the plan title says “optional metrics parity,” but Item 2 includes optional metrics DTOs early (`docs/plans/full-source-functionality-parity-2026-06-03.md:94`) and Item 12 includes a possible `get_metrics` command (`docs/plans/full-source-functionality-parity-2026-06-03.md:258-267`). This is borderline over-planning for a non-core user-visible feature.

### 3. Contradictions or missing dependencies

- Open Questions says decisions “are not blockers for Items 1–14” (`docs/plans/full-source-functionality-parity-2026-06-03.md:419-426`), but question 4 asks whether URL/query state should become desktop-local or support deep links. Item 7 already decides desktop-local state (`docs/plans/full-source-functionality-parity-2026-06-03.md:180-181`), so either the question is not open or Item 7 should wait for it.
- Item 12 depends only on Item 2 (`docs/plans/full-source-functionality-parity-2026-06-03.md:258-273`), but its useful config values depend on Values Explorer/duplicates/curl limits being known. It likely belongs after Values/duplicates contracts, or split into “base config” and “feature config.”
- Item 14 depends on Item 13, but it adds command wrappers/permissions for parse/preview without explicitly depending on Item 2 DTO expansion (`docs/plans/full-source-functionality-parity-2026-06-03.md:292-307`).

### 4. Risk of over-planning

Cut or compress Items 18 and 19 into decision notes unless the user asks for persistence or HTTP compatibility; the export framed HTTP as deferred by default. Also consider merging Item 12 metrics into final hardening unless fixtures prove metrics are user-visible parity.

### 5. Questions that would change implementation order

1. Is URL/deep-link/session restoration wanted, or is Item 7’s desktop-local state final?
2. Are metrics considered user-visible parity, or diagnostics-only?
3. Must Curl Executor parse/preview ship before all JSON-analysis parity, or is it acceptable to complete Values/duplicates/PDF first?
4. Should report timestamps be deterministic/injected for tests and offline reproducibility?
