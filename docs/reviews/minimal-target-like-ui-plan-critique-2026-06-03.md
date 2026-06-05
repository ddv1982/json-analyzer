# Minimal Target-Like UI Plan Critique

## Context/Scope

Scope: critique of `docs/plans/minimal-target-like-ui-2026-06-03.md`. No broad codebase exploration performed; references below are to the plan unless otherwise noted.

## Findings

### 1. Top 3 under-specified seams

1. **Target-like density lacks concrete guardrails.** Item 1 asks for “subtler shadows, smaller radii, tighter spacing, calmer typography, and compact default controls” (`docs/plans/minimal-target-like-ui-2026-06-03.md:47-55`), but does not define acceptable token ranges or which existing tokens/classes are the source of truth. An implementer must guess whether to tune current variables, introduce new semantic aliases, or directly edit many selectors.
2. **Header content strategy is unresolved.** Item 2 says title scale, lede, eyebrow, scope note, nav, and theme toggle should be quieter (`docs/plans/minimal-target-like-ui-2026-06-03.md:59-67`), but does not say whether any copy should be removed, collapsed, or merely restyled. That matters because “less explanatory chrome” can imply markup/content deletion, not just CSS.
3. **Values Explorer/dropdown visual simplification vs. information retention is ambiguous.** Item 5 requires denser selected-field summaries and target-like select/popover visuals while preserving current behavior (`docs/plans/minimal-target-like-ui-2026-06-03.md:92-103`), but it does not state which descriptive text, badges, selected summaries, or option metadata are essential. Implementers may either over-compress useful context or keep the bulky current shape.

### 2. Specificity balance

- **Over-specified tactical references:** the Background cites many target Tailwind/Radix implementation details and exact class-like dimensions (`docs/plans/minimal-target-like-ui-2026-06-03.md:13-31`). Since the plan correctly forbids migration/imports, these references should remain design inspiration, not implementation instructions.
- **Useful framing retained:** the CSS-first/native constraint is clear and load-bearing (`docs/plans/minimal-target-like-ui-2026-06-03.md:35-44`). The plan also usefully preserves tab and dropdown accessibility contracts (`docs/plans/minimal-target-like-ui-2026-06-03.md:81-103`).
- **Useful framing that could be sharper:** “target-like” is mostly expressed through tactical examples, not a prioritized visual hierarchy. A short statement such as “content over chrome; compact but not hidden; no behavior/schema changes” would give better decision support than many target-file citations.

### 3. Contradictions or missing dependencies

- **Curl dependency may be too late/serial.** Item 6 depends on Items 1–5 (`docs/plans/minimal-target-like-ui-2026-06-03.md:109-119`), but Curl should likely be smoke-checked after Item 1 and Item 3 to catch shared-style regressions early, then finalized after Values Explorer.
- **Validation command dependency is assumed.** Item 7 says run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and preferably `pnpm check` (`docs/plans/minimal-target-like-ui-2026-06-03.md:121-125`) without confirming these scripts exist or which is authoritative for frontend-only CSS work.
- **Open Questions says none blocking, but visual acceptance remains subjective.** The plan’s core goal depends on subjective target resemblance, so at least screenshot/manual acceptance criteria are a missing dependency.

### 4. Risk of over-planning

- The long Background should be trimmed for implementation handoff; keep only current seams, non-migration constraint, and accessibility/theme constraints.
- Item 3’s component/file list is broad enough to invite sweeping edits. It could be simplified to “shared card/table/state primitives first; component-specific edits only where inheritance fails.”
- Item 6 can be shortened to a regression checkpoint unless Curl-specific visual gaps are observed.

### 5. Questions that would change implementation order

1. Should header copy/scope note be removed/collapsed, or only restyled?
2. Are there screenshot/reference states that define “close enough” for light and dark modes?
3. Should Curl be checked immediately after shared CSS changes, before Values Explorer-specific work?
4. Which validation command set is mandatory for this pass: frontend scripts only, root `pnpm check`, or both?
