# Curl Executor Target-App UX Parity Plan

## Goal

Mirror the target app's Curl Executor UX as closely as possible: one obvious execution path, no visible preview/background choice in the default flow, and result copy actions that belong to the response/result surface.

This replaces the earlier simplification plan. The target app is now the source of truth for this screen's interaction model.

## Target App Behavior

Target source:

- `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/curl-executor/curl-command-section.tsx`
- `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/curl-executor/curl-executor-provider.tsx`
- `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/curl-executor/results/single-results.tsx`
- `/Users/vriesd/projects/qa-toolbox/json-analyzer/frontend/components/curl-executor/results/batch-results.tsx`

Observed target UX:

- The command card has one primary execution button.
- In single mode, the button reads `Execute`.
- While single execution is running, the button reads `Executing...`.
- `Stop` appears only while a single request or batch is running.
- `Clear` is separate and secondary.
- There is no `Preview request` button.
- There is no `Start background run` or explicit async-job button.
- Batch mode is disabled until a successful single request extracts a bearer token.
- In batch mode, the primary button reads `Execute Batch`.
- While batch execution is running, the button reads `Executing Batch...`.
- The target's batch input is customer IDs, not one full curl command per line.
- Result copy actions are on results:
  - Single result: `Copy Response`
  - Batch result: `Copy Merged Data`

## Current App Mismatches

- Single mode currently exposes three competing actions: `Preview request`, `Execute`, and `Start background run`.
- Parsed request preview is a separate visible result area, including an empty state that tells users to preview before execution.
- Request-copy actions currently copy parsed URL, headers, and body. The target app's copy affordance is response-focused instead.
- Background jobs are exposed as a user-facing concept for a single request. The target app hides this implementation detail.
- Batch mode currently accepts one curl command per line. The target app's batch mode accepts customer IDs after a bearer token has been extracted from a successful single request.
- Current cancellation is labeled `Cancel job`; the target labels the active interrupt action `Stop`.

## Product Direction

For this screen, prefer target parity over preserving our extra visible affordances.

Default single-request flow should be:

1. Paste curl command.
2. Click `Execute`.
3. If running, optionally click `Stop`.
4. Inspect result.
5. Use `Copy Response` from the result.

Default batch flow should be:

1. Execute one successful single request first.
2. Extract bearer token.
3. Enable `Batch Mode`.
4. Paste customer IDs.
5. Click `Execute Batch`.
6. If running, optionally click `Stop`.
7. Use `Copy Merged Data` from batch results.

## Proposed UX

### Command Card

Keep the command surface close to the target:

- Title: `Curl Command`
- Description: `Paste your curl command from Postman here`
- Textarea placeholder should remain close to the target Postman curl example.
- Show progress prerequisites:
  - `Step 1: Execute successful single request`
  - `Step 2: Bearer token extracted`
  - `Step 3: Batch mode now available`
- Show `Batch Mode - Execute for multiple customer IDs` as a disabled toggle until a token exists.
- Do not show a visible `Preview request` action.
- Do not show `Start background run`.
- Show only:
  - `Execute` or `Execute Batch`
  - `Stop` only while active and cancellation is available
  - `Clear`

### Single Execution

- `Execute` should remain the only normal single-request action.
- Execution can still use the existing direct `execute_curl` command initially.
- If the backend requires async execution for cancellation parity, the implementation can later move single execution to the async command path, but this must not surface as `background run` in the UI.
- Parse/guardrail failures should show inline error states during execution rather than requiring a separate preview step.
- If `execute_curl` returns `request_preview`, it can be used internally or shown as compact metadata inside/near the result, but there should be no standalone preview-first workflow.

### Stop Behavior

- Replace visible `Cancel job` copy with `Stop`.
- Show `Stop` only when work is actively running.
- If cancellation is disabled by configuration, hide `Stop` and use a small configuration note only when a running job cannot be stopped.
- Keep existing Rust/Tauri cancellation commands where needed.

### Result Copy

Move copy parity toward the target:

- Add `Copy Response` to the single execution response panel.
- Add `Copy Merged Data` to batch results if the available result shape supports it.
- Remove parsed-request copy actions from the default Curl Executor flow, or hide them with any non-target diagnostic details.
- Copy buttons should use concise local feedback: `Copied` / `Copy failed`.

### Batch Mode

There are two implementation levels.

Level 1, minimal target-action parity:

- Rename `Start batch` to `Execute Batch`.
- Rename running state to `Executing Batch...`.
- Rename `Confirm and start batch` to `Confirm and Execute Batch` if large-batch confirmation remains.
- Rename active cancellation from `Cancel job` to `Stop`.
- Remove single background and preview buttons.
- Keep the current one-curl-per-line batch input temporarily.

Level 2, full target-flow parity:

- Gate batch mode behind successful single execution and bearer-token extraction.
- Replace one-curl-per-line batch input with `Customer IDs (comma-separated)`.
- Add concurrency and timeout controls matching the target:
  - `Concurrent Requests`
  - `Request Timeout`
- Build batch requests from the single curl command plus customer IDs and bearer token.
- Show target-style large/very-large batch warnings based on customer ID count.
- Add `Copy Merged Data` to final batch results.

Recommendation: implement Level 1 first because it removes the confusing buttons immediately. Then implement Level 2 as a follow-up because it changes batch semantics and may require backend/API support beyond styling.

## Work Items

### Item 1 - Remove Preview as a Visible Command

**Goal:** Match the target's single-action model.

**Done when:**

- `Preview request` is no longer visible in the command action row.
- The empty parsed-preview panel is removed from the default screen.
- Users can execute directly without any preview-first messaging.
- Parser/guardrail errors still appear when execution fails or is rejected.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx`, `frontend/src/App.test.tsx`

### Item 2 - Hide Single Background Run

**Goal:** Stop exposing async implementation details in single mode.

**Done when:**

- `Start background run` is no longer visible in normal single mode.
- Single-mode tests no longer expect a background-run button.
- Existing `start_curl_job` support remains available for batch and future internal use.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx`, `frontend/src/App.test.tsx`

### Item 3 - Match Target Action Labels

**Goal:** Make command actions read like the target.

**Done when:**

- Single primary button: `Execute`.
- Single loading label: `Executing...`.
- Batch primary button: `Execute Batch`.
- Batch loading label: `Executing Batch...`.
- Active interrupt action: `Stop`.
- Secondary clear action: `Clear`.
- No default `Cancel job`, `Start batch`, or `Confirm and start batch` copy remains.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx`, `frontend/src/App.test.tsx`

### Item 4 - Add Target Result Copy Actions

**Goal:** Make copy behavior target-like.

**Done when:**

- Single response panel has `Copy Response`.
- Batch results panel has `Copy Merged Data` when there are successful response bodies to merge.
- Request-detail copy buttons are removed from the default flow or hidden with diagnostic details.
- Clipboard tests assert exact copied payloads.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx`, `frontend/src/lib/clipboard.ts`, `frontend/src/App.test.tsx`

### Item 5 - Decide Batch Flow Scope

**Goal:** Choose whether this pass is action parity only or full target batch semantics.

**Done when:**

- If Level 1 is chosen, current batch input remains but action labels and stop/copy behavior match the target.
- If Level 2 is chosen, batch mode is gated by successful single execution and uses customer IDs, bearer token extraction, concurrency, and timeout controls.
- The implementation does not mix both models ambiguously.

**Key files:** `frontend/src/components/curl-executor/CurlExecutorView.tsx`, `frontend/src/lib/commands.ts`, Tauri command layer if Level 2 requires new request shaping.

## Implementation Order

1. Remove visible `Preview request` and standalone parsed-preview empty state.
2. Hide `Start background run` from single mode.
3. Rename action labels to target copy: `Execute`, `Executing...`, `Execute Batch`, `Executing Batch...`, `Stop`, `Clear`.
4. Add `Copy Response` and batch result copy parity.
5. Update tests around disabled flags, execution, cancellation, and copy payloads.
6. Decide and implement Level 2 batch semantics only if we are ready to change the current batch model.
7. Run lint, typecheck, tests, build, and browser smoke in light/dark modes.

## Validation Commands

- `pnpm -C frontend run lint`
- `pnpm -C frontend run typecheck`
- `pnpm -C frontend run test`
- `pnpm -C frontend run build`

## Non-Goals

- No removal of Rust/Tauri job commands in this pass.
- No removal of guardrail enforcement.
- No new backend semantics unless Level 2 batch parity is explicitly selected.
- No advanced/debug request preview in the default UX.
