# ADR 0001: Rust core and application service

## Status

Accepted for MVP.

## Decision

Implement the target JSON analysis core and transport-neutral application service in Rust 2024.

## Consequences

- Python is only a temporary source-app parity oracle while fixtures are captured.
- The target repo must not include Flask/Python runtime code.
- Analyzer behavior must be testable without Tauri, HTTP, or frontend code.
- Phase 1 scaffolds Rust; Phase 2 establishes parser/AST primitives before analyzers are ported.
