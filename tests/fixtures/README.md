# Fixtures

`golden/source-mvp-starter-fixtures.json` contains starter behavior captured from the source Flask/Python app on 2026-06-02.

`golden/full-source-parity-contracts.json` contains Item 1 source-inspired and target-decided contracts for upcoming Values Explorer, advanced duplicate, PDF report data, curl parser/guardrail, expanded config, and error-shape work.

Use these fixtures as parity contracts for the Rust core and application service. Some entries intentionally document source limitations, especially duplicate object keys: source parsing collapses duplicate keys, while the target MVP must preserve them in its core AST.

Fixture files are data only. Do not add Flask/Python runtime helpers, feature analyzers, Tauri command surfaces, frontend UI, curl execution, or PDF byte generation just to consume them.
