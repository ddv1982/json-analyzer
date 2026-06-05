# 0009: Frontend State and Command Architecture

## Status

Accepted

## Context

The React frontend has grown around a small number of broad modules: a single command wrapper, a large browser mock, feature-heavy view components, and local component state for cross-view navigation. The UI behavior is now intentionally aligned with the target app, so architecture work should improve maintainability without changing the approved visual or interaction model.

The existing backend decisions still stand:

- Rust owns JSON analysis and guarded curl execution.
- Tauri commands are the IPC boundary; there is no localhost backend.
- React code should call typed command wrappers, not raw Tauri `invoke`.

## Decision

Use TanStack Query for asynchronous Tauri command state and Zustand for lightweight client UI state.

TanStack Query is the default home for command pending/error/success state when a command behaves like a query or mutation. The app uses desktop-oriented defaults: no implicit retries and no focus refetches.

Zustand is limited to safe UI/session state such as the active app view and result navigation. It must not persist raw JSON input, curl commands, credentials, response bodies, or large analysis payloads.

The frontend command boundary is split into domain modules under `frontend/src/lib/commands/`, with `frontend/src/lib/commands.ts` retained as a compatibility export. Raw Tauri `invoke` usage is only allowed in the shared invoke client.

## Consequences

- Feature code can migrate incrementally without changing public command wrapper names.
- Async status handling becomes more consistent across analysis, values, duplicates, and curl flows.
- UI state can be shared across shell-level components without prop-drilling.
- Guard tests enforce the command boundary and command-name parity with Tauri permissions.

## Follow-Ups

- Continue extracting large feature views into controller hooks and presentational components.
- Continue splitting browser mocks by command family behind the preserved `browserMockInvoke` entrypoint.
- Split Rust service and analyzer modules only after frontend contract boundaries are stable.
