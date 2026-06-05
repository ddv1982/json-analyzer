# ADR 0004: Duplicate-preserving JSON AST

## Status

Accepted for MVP.

## Decision

The Rust core must parse into a duplicate-preserving JSON representation for analysis. Object members must be represented in source order as key/value pairs rather than collapsed into a map.

## Consequences

- `serde_json::Value` may be used for DTO serialization and non-authoritative normalized responses, but not as the duplicate-sensitive analysis representation.
- Source Flask behavior is not sufficient here: Python `json.loads` keeps only the last duplicate key. The target intentionally improves on that limitation.
- Phase 2 must define object order, duplicate-key traversal, compact serialization, equality/grouping, and numeric formatting before analyzers are implemented.
