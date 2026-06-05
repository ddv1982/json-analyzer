# Results Page and Copy UX Polish Plan

## Goal

Improve the current JSON Analyzer results page so it feels closer to the target app and makes copy actions predictable, local to the content, and visibly confirmed.

This is a frontend-focused UX pass. It should preserve the current three top-level result tabs, Tauri command wrappers, Rust DTOs, theme tokens, and existing Values/Curl functionality.

## Current Findings

- The current page now has the target-like top-level result model: `Statistics`, `Values`, and `Duplicates`.
- The visible Duplicates page is still table-first. It shows exact duplicate values and indexes, but it does not provide the target app's inspectable group treatment, per-group copy action, copied state, or expand/collapse affordance.
- The target app's exact duplicate page treats duplicate groups as content units: each group has metrics, an alert, group cards, index context, expand/collapse, and an icon copy action with a temporary success state.
- In the target app, exact duplicate copy is not a table export. The copy action copies the single canonical duplicate JSON value for that group, formatted with `JSON.stringify(parsedItem, null, 2)` after attempting `JSON.parse(itemJson)`.
- In the current app, exact duplicates have no copy behavior, so users cannot copy the duplicate value they are inspecting without manually selecting table text.
- Current Values copy actions are toolbar-level buttons: `Copy Field Set` and `Copy duplicate groups`. They work, but the copied target is not visually close to the content being copied.
- In the target app, value group copy is per group and copies the full parent JSON items in that group, each formatted with `JSON.stringify(item.item, null, 2)` and joined by newline separators.
- In the current app, `Copy duplicate groups` copies a TSV summary of duplicate groups visible on the current page: `Value group`, `Count`, `Source paths`, and `Record indexes`. That is useful as an audit summary, but it does not match the target's more intuitive "copy the inspected JSON records" behavior.
- Current Curl preview copy actions copy URL, headers, and body, but they do not expose a consistent visible copied/error state.
- Current clipboard behavior is implemented inline in multiple components, with separate success/error copy messages and no shared state/timer model.
- Browser inspection at `http://127.0.0.1:5173/` confirmed the Values page reads as a compact form/table workflow, while copy buttons sit above the field picker instead of next to the field set or duplicate groups they affect.

## Target Copy Payload Research

### Exact Duplicates

Target source: `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/exact-duplicates-view.tsx`

What is copied:

- One duplicate group's canonical JSON value, not the whole duplicate table.
- The payload is the duplicate object/value represented by the map key from `analysis.duplicates`.
- The target attempts `JSON.parse(itemJson)` first. If parsing succeeds, it copies `JSON.stringify(parsedItem, null, 2)`. If parsing fails, it treats the source as a string and copies the JSON string representation produced by `JSON.stringify(parsedItem, null, 2)`.

How it is done:

- Copy sits in the duplicate group's card header beside expand/collapse.
- The visible affordance is icon-only with a tooltip, and the icon changes from copy to check when copied.
- The copied state is scoped to `copiedGroup`, resets after 2 seconds, and shows a toast success/error.

Implication for this app:

- Exact duplicate copy should copy `group.value` as pretty JSON when parseable, falling back to the original string when it is not parseable.
- The button label should make the payload explicit: `Copy duplicate group 1 JSON`.
- We should not add a broad `Copy all duplicate groups` button in the first pass because it would be less aligned with the target behavior and less clear for large files.

### Values Groups

Target source: `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/value-groups.tsx`

What is copied:

- One value group's underlying full JSON items, not just the grouped value label or summary columns.
- The payload is `data.items.map((it) => JSON.stringify(it.item, null, 2)).join("\n")`.
- This means copying a group gives the user the actual records that share the selected value.

How it is done:

- Copy sits on each group card header, next to expand/collapse.
- The copied state is scoped to the copied group index and resets after 1.5 seconds.
- Clipboard writes go through `safeClipboardWrite`, which throws a clear error when `navigator.clipboard.writeText` is unavailable.

Implication for this app:

- Our `ValuesGroup` DTO already includes `parent_items` with `summary`, `record_index`, and optional `source_path`.
- For parity with the target without changing Rust DTOs, per-group copy should copy the best available JSON-like record payload for that group:
  - Prefer each `parent_items[n].summary` as pretty JSON.
  - Include `record_index` and `source_path` only if the summary alone is too ambiguous, or provide a second explicit summary-copy action later.
  - Join copied parent items with blank-line separators so multiple records remain readable.
- The existing TSV page summary copy should either be renamed to `Copy visible summary` and kept near the table controls, or deferred. It should not be the primary duplicate-group copy action because users expect the group copy button to copy the records they are looking at.

### Curl Results

Target source: `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/curl-executor/curl-executor-provider.tsx`

What is copied:

- Single mode copies the response payload: string data as-is, object data as `JSON.stringify(result.data, null, 2)`.
- Batch mode copies `batchResult.merged_data` as pretty JSON.

Implication for this app:

- The current Curl preview copy buttons copy parsed request parts rather than response data, so this is a different workflow. We should preserve the current payloads but reuse the target's explicit copied state/timer model.

## Research Notes

- HashiCorp Helios recommends placing a copy button close to the content being copied so users understand the clipboard target. It also supports icon-only copy buttons when the copied content is clearly associated, while requiring accessible text and success/error callbacks.
- Blueprint UI and Fluid Primitives both model clipboard controls with distinct idle/copied/error states and visual feedback.
- PatternFly's clipboard-copy component supports compact/inline copy controls for snippets and JSON-like content, with accessible labels and click/hover tips.
- MDN documents `navigator.clipboard.writeText()` as Promise-based and limited to secure contexts, so copy failures should remain user-visible rather than silently swallowed.
- React Aria's toast guidance recommends a minimum 5 second timeout for auto-dismissed toasts. For this app, a local copied state near the button is preferable for frequent copy actions; if a global toast is added later, it should follow that accessibility rule.
- Multiple button design systems reinforce that icon-only buttons need clear accessible names, while visible text buttons should use concise action labels and `type="button"`.

## UX Direction

Use copy as a contextual action, not a generic toolbar action.

Recommended pattern:

- Put copy actions next to the exact content being copied.
- Use icon-only copy buttons only where the content association is obvious and the button has a strong accessible label.
- Show a temporary copied state on the button itself, using label/icon change and `aria-live` status where useful.
- Preserve a non-silent error path when the Clipboard API is unavailable or denied.
- Avoid global toasts for every copy in dense tables/lists; use local feedback first to keep repeated work fast.
- Use expandable duplicate groups instead of a bare table when the user benefits from inspecting JSON before copying it.

## Work Items

### Item 1 - Add a Small Shared Clipboard Helper

**Goal:** Replace scattered inline clipboard calls with one small frontend helper and hook.

**Done when:**

- A shared helper wraps `navigator.clipboard.writeText()`, handles missing clipboard support, and returns success/error state.
- A small React hook manages copied state, failure state, timeout cleanup, and optional copied key for per-row actions.
- Existing copy behavior in Values and Curl can consume the helper without changing command payloads.

**Key files:** `frontend/src/lib/clipboard.ts`, `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`, `frontend/src/components/curl-executor/CurlExecutorView.tsx`

**Size:** Medium.

### Item 2 - Rework Exact Duplicates Into Target-Like Groups

**Goal:** Make the Duplicates tab useful for inspection and copying, not just a compact table.

**Done when:**

- `ExactDuplicatesView` shows a target-like no-duplicates state with concise copy and metrics.
- Duplicate results render as group cards or compact grouped rows rather than only a two-column table.
- Each duplicate group shows group number, duplicate count, indexes, and a preview of the duplicate JSON.
- Each group has a copy action that copies the canonical duplicate JSON value for that group, pretty-formatted when `group.value` is parseable JSON.
- The fallback for non-JSON values copies the original duplicate value string, not a table row, TSV row, or wrapper object.
- Groups can expand/collapse to inspect the formatted JSON without overwhelming the panel.
- Long JSON and indexes wrap/scroll safely inside the panel.

**Key files:** `frontend/src/components/analysis/views/ExactDuplicatesView.tsx`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`

**Size:** Large.

### Item 3 - Make Values Copy Actions Contextual

**Goal:** Keep existing Values functionality while making copy targets obvious.

**Done when:**

- `Copy Field Set` moves into or directly beside the `Field Set` panel.
- The primary duplicate-group copy action becomes per-group and sits on each duplicate/value group row or expanded group header.
- Per-group copy copies the group's parent record summaries as pretty JSON, using `ValuesGroup.parent_items[].summary` as the closest current equivalent to the target app's full `item`.
- Multiple copied parent summaries are separated by blank lines for readability.
- The current TSV export of visible duplicate groups is either renamed to `Copy visible summary` and placed near the table controls, or removed from the primary action row for this pass.
- Copied/error feedback appears near the button that was used.
- Disabled copy states explain themselves through accessible labels or nearby status text when the target is empty.

**Key files:** `frontend/src/components/analysis/values-explorer/ValuesExplorerView.tsx`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`

**Size:** Medium.

### Item 4 - Normalize Curl Copy Feedback

**Goal:** Make Curl preview copy actions behave like the results copy actions.

**Done when:**

- `Copy URL`, `Copy headers`, and `Copy body` use the shared clipboard helper.
- Each action shows a short local copied state.
- Clipboard failure is visible and accessible instead of silently ignored.
- Buttons stay close to their associated URL/header/body content.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx`, `frontend/src/styles.css`

**Size:** Medium.

### Item 5 - Add Copy Button Styling and Accessibility Guardrails

**Goal:** Support copy controls without adding visual clutter.

**Done when:**

- A compact `.copy-button` / `.icon-action-button` style exists for content-local actions.
- Icon-only copy buttons have accessible names such as `Copy duplicate group 1 JSON`.
- Copied states have a visible success affordance and are announced with `role="status"` or an `aria-live` region where useful.
- Focus-visible styling remains clear in light and dark themes.
- Buttons remain at least the existing compact control height and do not shrink below usable hit targets in dense rows.

**Key files:** `frontend/src/styles.css`, `frontend/src/components/common/*` if a reusable component is introduced.

**Size:** Small to medium.

### Item 6 - Tests and Visual Smoke

**Goal:** Prove the copy polish does not regress behavior.

**Done when:**

- Tests cover successful copy and failed/unavailable clipboard behavior.
- Tests cover Duplicates group copy, expand/collapse, and copied state reset.
- Tests cover Values field-set copy and duplicate-groups copy after the buttons move.
- Existing tab, theme, dropdown, and command wrapper tests still pass.
- Browser smoke covers Statistics, Values, Duplicates, Curl preview, light mode, dark mode, and narrow desktop.

**Validation commands:**

- `pnpm -C frontend run lint`
- `pnpm -C frontend run typecheck`
- `pnpm -C frontend run test`
- `pnpm -C frontend run build`

## Implementation Order

1. Add the shared clipboard helper and hook.
2. Rework `ExactDuplicatesView` into grouped duplicate cards with copy/expand behavior.
3. Move Values copy actions closer to their target content.
4. Route Curl copy actions through the same helper.
5. Add/adjust compact copy styles.
6. Update tests and run browser visual smoke.

## Non-Goals

- No changes to Rust analysis logic or DTO shapes.
- No new component library.
- No broad redesign of the whole app shell.
- No global toast system unless local copied/error states prove insufficient.
- No packaging run unless requested after implementation.

## References

- Target app exact duplicates: `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/exact-duplicates-view.tsx`
- Target app value groups: `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/analysis/value-groups.tsx`
- HashiCorp Helios Copy Button: https://helios.hashicorp.design/components/copy/button
- PatternFly Clipboard Copy: https://patternflyelements.com/components/clipboard-copy/
- MDN Clipboard writeText: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
- React Aria Toast accessibility timing: https://react-spectrum.adobe.com/react-aria/Toast.html
