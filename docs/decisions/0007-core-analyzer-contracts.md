# ADR 0007: Core analyzer contracts

## Status

Accepted for Phase 3 MVP analyzers.

## Decision

- Core analyzers operate only on the duplicate-preserving `JsonValue` AST and do not depend on Tauri, Axum, frontend code, Python, pandas, or dataframe crates.
- Structure analysis uses Phase 2 flattened terminal paths. Size and top-level size are shallow container lengths, scalar size is `1`, and depth starts at `0` for the root while incrementing through arrays/objects.
- Statistics analysis iterates flattened terminal values. JSON null contributes to type distribution and `null_count` but is omitted from value distribution. String-length stats include JSON strings and terminal empty containers stringified with `safe_str`; numeric values do not contribute to string lengths. `unique_field_paths` counts unique top-level path segments.
- Exact duplicate analysis selects one best array candidate by preferring arrays of objects, paths containing `data`, arrays with at least five items, and larger arrays. Nulls, blank strings, empty arrays, and empty objects are skipped. Grouping keys use compact AST JSON, preserving member order and duplicate keys. Duplicate groups and indexes are reported in input encounter order.
- Field duplicate analysis matches normalized patterns like `users.[].email` against flattened paths. Missing fields are absent, JSON nulls are skipped, arrays/objects are compared with `safe_str`, and case-insensitive mode lowercases only the comparison key. Output groups keep first-seen order.
- Min/max filled analysis selects one best object-record array with source-style scoring. Filled values exclude null, blank strings, and empty arrays/objects. Shallow mode counts filled top-level fields, with non-empty containers counting as one. Deep mode recurses into arrays/objects and counts scalar leaves. All min/max ties are returned in input order. Statistics use mean, median, sample standard deviation, average completeness percentage, and first-seen filled-count distribution.

## Consequences

- Analyzer output is deterministic and source-derived while preserving target duplicate-key improvements.
- Phase 4 can wrap these core results into service DTOs without changing analyzer logic.
- Advanced Values Explorer/composite duplicate/report-preview behavior remains deferred.
