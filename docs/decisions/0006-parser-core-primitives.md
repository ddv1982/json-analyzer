# ADR 0006: Parser and core primitive semantics

## Status

Accepted for Phase 2 MVP foundation.

## Decision

- `parse_json` is strict: it accepts exactly one JSON root with surrounding whitespace and rejects trailing non-whitespace data.
- `parse_json_documents` is the explicit source-style concatenated-root helper: it accepts one or more adjacent JSON roots and returns them in order. Later service layers must opt in and decide whether to normalize, warn, or reject multiple roots.
- Objects are `Vec<(String, JsonValue)>` in source order; duplicate keys are preserved and path traversal emits duplicate paths rather than collapsing values.
- Compact serialization is generated from the duplicate-preserving AST with no spaces. It preserves object member order, duplicate keys, and original number lexemes.
- `JsonNumber` accepts only JSON number grammar. Non-finite values such as `NaN` and `Infinity` are rejected by the parser. Equality and ordering are exact numeric comparisons; `1`, `1.0`, and `1e0` compare equal.
- `safe_str` returns raw strings for JSON strings, lowercase booleans, `null` for null, normalized decimal strings for numbers, and compact AST JSON for arrays/objects.
- Flattened paths use dot notation and numeric array indexes. Empty arrays/objects are terminal values. Field patterns normalize numeric path segments to `[]`.

## Consequences

- The target intentionally improves on the source app's duplicate-key limitation.
- Source legacy JSON spacing is not preserved for arrays/objects in `safe_str`; the target uses compact AST serialization as required by the rewrite plan.
- Concatenated roots are supported only through an explicit parser API, keeping strict single-root validation behavior available for Phase 4 service contracts.
