# Remaining fixtures backlog

This backlog separates captured fixture contracts from deliberately deferred behavior. Starter fixtures in `tests/fixtures/golden/source-mvp-starter-fixtures.json` cover validation, duplicate-key source limitation/target expectation, field paths, structure/statistics, exact duplicates, basic field duplicates, and basic min/max. Item 1 parity contracts in `tests/fixtures/golden/full-source-parity-contracts.json` cover future Values Explorer, advanced duplicate, PDF report data, curl parser/guardrail, expanded config, and error-shape foundations.

## Captured MVP fixture contracts

- [x] Parser edge cases: whitespace-only input, trailing garbage after a valid root, scalar roots, top-level arrays, and concatenated roots with mixed objects/arrays/scalars are captured in `source-mvp-starter-fixtures.json` under `mvp_regressions_phase_7.parser_edge_cases`.
- [x] 16 MiB size-limit boundary cases without committing huge blobs are captured as generated-test metadata in `source-mvp-starter-fixtures.json` and exercised through tiny-limit service tests.
- [x] Numeric semantics: large integers, exponent display, non-finite rejection, and huge decimal rejection are captured in `source-mvp-starter-fixtures.json` under `mvp_regressions_phase_7.numeric_semantics`.
- [x] Duplicate-preserving AST traversal and object member order are captured in `source-mvp-starter-fixtures.json` plus `full-source-parity-contracts.json.shared_dataset.raw_input_with_duplicate_keys`.
- [x] Exact duplicate ordering and compact target AST serialization are captured in `source-mvp-starter-fixtures.json` under `exact_duplicates` and `mvp_regressions_phase_7.duplicates`.
- [x] Field duplicate null/missing behavior with sparse records and container values is captured in `source-mvp-starter-fixtures.json` under `field_duplicates` and `mvp_regressions_phase_7.duplicates.sparse_field_duplicates`.
- [x] Min/max ties, no suitable records, and non-object records are captured in `source-mvp-starter-fixtures.json` under `mvp_regressions_phase_7.min_max_filled`.
- [x] Error DTO shape for validation failures and service errors is captured in `source-mvp-starter-fixtures.json` and expanded in `full-source-parity-contracts.json.error_shapes`.

## Captured Item 1 parity fixture contracts

- [x] Values Explorer field discovery, selected-field value groups, parent item inclusion, search, sorting, pagination, multi-field grouping, field limits, null/missing handling, and page-size decisions are captured in `full-source-parity-contracts.json.values_explorer`.
- [x] Advanced duplicate single-field filtering, all-values summary, parent item inclusion, composite duplicates, 2–5 field validation, unique-field validation, and target duplicate-key behavior are captured in `full-source-parity-contracts.json.advanced_duplicates` and `shared_dataset.duplicate_key_target_expectation`.
- [x] PDF report data shape is captured in `full-source-parity-contracts.json.pdf_report_data` as deterministic serializable report input data only.
- [x] Curl parser preview examples, bearer-token redaction, unsupported parser options, and guardrail allow/deny outcomes are captured in `full-source-parity-contracts.json.curl_executor`.
- [x] Expanded frontend-consumed config values for Values Explorer, advanced duplicates, curl defaults, and feature flags are captured in `full-source-parity-contracts.json.config`.

## Deliberately deferred or scoped out fixtures

- [ ] Complexity-warning payload metadata remains deferred until complexity warnings are implemented or a concrete warning threshold is selected.
- [ ] Additional structure/statistics DTO samples for scalar roots, empty containers, heterogeneous arrays, and list-of-lists remain useful hardening fixtures but are not required by Item 1.
- [ ] Full source OpenAPI route parity remains deferred because desktop parity maps operations to Tauri IPC; any browser/headless HTTP adapter must be a future optional adapter.
- [ ] Curl execution response bodies, async jobs, cancellation, batch progress, and persistence are deferred. Item 1 captures parser and guardrail contracts only; SQLite persistence is intentionally not part of the desktop target.
- [ ] PDF byte snapshots and filesystem save behavior are deferred. Item 1 captures report data input shape only.
- [ ] Metrics fixtures remain scoped out because metrics are diagnostics-only and not user-visible parity.
