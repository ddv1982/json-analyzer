# Test Architecture Improvement Plan Critique

## Context / Scope
Reviewed `docs/plans/test-architecture-improvement-2026-06-05.md` against the original context-builder export `prompt-exports/oracle-plan-2026-06-05-011430-test-plan-ab7adc-8614.md`. Scope is limited to implementer ambiguity, specificity balance, contradictions/dependencies, over-planning risk, and order-changing questions.

## Findings

### 1. Top 3 under-specified seams
1. **Rust module-root mechanics:** The plan mandates `#[path = "..."] mod ...;` and `tests/support/*.rs` (`docs/plans/test-architecture-improvement-2026-06-05.md:22`, `:122`) but does not state how support modules are imported from nested test modules or where shared `use` statements should live. An implementer may guess between `crate::support`, per-module imports, or duplicated imports.
2. **Frontend harness ownership boundary:** Item 5 lists many helpers the harness “should own” (`:179-196`) but does not define whether it should import/render `App`, export command mocks only, or provide a pre-rendered fixture API. This matters because the plan’s mock-ordering rule (`:24`, `:196`, `:215`) is the riskiest frontend seam.
3. **Test-count preservation method:** Multiple items require unchanged counts (`:89`, `:108`, `:127`, `:146`) but only baseline commands are listed. The plan does not specify whether counts are per crate/file, snapshot text from `-- --list`, Vitest reported test count, or PR-summary notes, so implementers can satisfy this inconsistently.

### 2. Specificity balance
- **Over-specified tactical choices:** The target filenames and exact module partitioning (`:30-58`, `:69-82`, `:129`, `:148`, `:203`) are useful as a suggested layout but read as mandatory. The implementation agent should own minor grouping adjustments discovered during verbatim moves.
- **Export framing retained well:** The final plan kept the export’s important guardrails: low-risk curl pilot, one Rust integration crate per domain, fixture data-only policy, frontend harness before workflow split, and no `browser-mocks.ts` refactor (`:19-26`).
- **Dropped useful framing:** The export explicitly warned against new Tauri plugin permissions, HTTP frontend access, Flask/Python helpers, SQLite persistence, and new production seams. The final plan says no production behavior changes (`:4`, `:256`) but loses that concrete “do-not-add” list, which was useful for unattended execution.

### 3. Contradictions or missing dependencies
- Item 4 depends only on Item 1 (`:167`), while Item 8 depends on Items 1-7 (`:243`). That is not contradictory, but it leaves execution ambiguous: Tauri extraction can run before service/analyzer and frontend work, yet the plan presents it between Rust analyzer and frontend phases. Clarify whether Item 4 is parallelizable after Item 1 or strictly fourth.
- Item 7 depends on Item 6 (`:224`), but command/browser mock tests are largely independent of the App workflow split. If the goal is unattended sequencing, this dependency may unnecessarily delay a separable cleanup.

### 4. Risk of over-planning
The Background plus Target Layout is long relative to the actual work (`:6-82`). For implementers, the exact “Target Layout” blocks and repeated validation sections could be simplified into “recommended target names” plus per-phase gates. The official-doc references (`:15-17`, `:262-268`) can likely be kept as provenance, not execution guidance.

### 5. Questions that would change implementation order
1. Should Item 4 be allowed immediately after Item 1, in parallel with service/analyzer splits?
2. Should Item 7 move before Item 6, since command-wrapper/browser-mock splitting may not depend on App workflow file movement?
3. Is exact filename/layout adherence required, or may the implementer adjust module grouping if verbatim moves reveal better seams?
