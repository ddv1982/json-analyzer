# ADR 0002: Tauri command IPC and no backend localhost server

## Status

Accepted for MVP.

## Decision

Expose MVP desktop operations through Tauri 2 commands that call the Rust application service directly. Do not start a backend localhost HTTP API server for the desktop app.

A Vite dev server such as `http://localhost:5173` is allowed during development as the frontend dev URL. It is not a backend API contract.

## Consequences

- Tauri command handlers stay thin and contain no business logic.
- Desktop runtime avoids port, CORS, lifecycle, and localhost security complexity.
- Any future HTTP adapter must call the same application service and remain optional/post-MVP.
