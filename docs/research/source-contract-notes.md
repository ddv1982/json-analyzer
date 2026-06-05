# Source contract notes for MVP

Captured on 2026-06-02 from `/Users/vriesd/projects/qa-toolbox/json-analyzer`, with stack observations from `/Users/vriesd/projects/csv-align`.

## Verified source files

- `json_analyzer/core/validation.py`
- `json_analyzer/core/json_ops.py`
- `json_analyzer/analyzers/{json_analyzer,structure,statistics,duplicates,minmax}.py`
- `json_analyzer/api/routes/analysis.py`
- `json_analyzer/api/utils/analysis_helpers.py`
- Source unit/integration tests under `tests/unit/core`, `tests/unit/analyzers`, and `tests/integration/api/analysis`

## MVP source behavior to preserve or intentionally refine

### Validation

- Request-level `json_string` must exist, be a string, be non-empty, and stay within 16 MiB.
- Complexity warnings are warnings, not hard failures.
- `validate_json` first tries strict `json.loads`.
- If strict parsing fails, source tries consecutive `raw_decode` parsing. Multiple adjacent roots become a list of documents.
- Invalid syntax returns the JSON decode message.
- Source core helper `validate_json` returns a tuple equivalent to `{ valid, parsed_data, error }`; the starter validation fixture captures this helper shape.
- Source route `/api/v2/validate` returns `{ "valid": true, "data": parsed_data }` when accepted; the fixture includes a route-response example for the valid case.

MVP decision: keep both helper and route behavior documented before Phase 2/4 decide exact target parser and service DTO shapes for concatenated roots.

### Duplicate object keys

- Source parsing uses Python `json.loads`, so duplicate object keys collapse to the last value.
- This is a verified source limitation, not target behavior.
- MVP target must preserve duplicate object members in the Rust core AST per ADR 0004.

### Flattening and field patterns

- Flattened paths use dot notation and numeric array indexes, for example `users.0.profile.email`.
- Empty arrays/objects are terminal flattened values.
- Field patterns convert array indexes to `[]` when numeric siblings indicate an array, for example `users.[].department`.
- Pattern metadata includes `label`, `pattern`, up to five `sample_paths`, `category`, and `count`.
- `safe_str` converts `null` to `"null"`, booleans to lowercase strings, arrays/objects to JSON text via Python `json.dumps` default separators, and strings to raw strings. The target plan currently asks for compact JSON from the duplicate-preserving AST; Phase 2 must explicitly lock whether target compatibility keeps source spacing or intentionally normalizes compact output.

### Structure/statistics

- Structure returns Python type names (`dict`, `list`, `str`, `int`, etc.), top-level size, depth, field paths, field count, generated schema, and container summary.
- Statistics use flattened terminal values: total fields, type distribution, null count, string length stats, field value distribution, and unique top-level path count.

### Exact duplicates

- Exact duplicates analyze the best array candidate, preferring arrays of objects, paths containing `data`, and larger arrays.
- Empty objects, empty arrays, `null`, and blank strings are skipped as non-meaningful items.
- Grouping keys are `json.dumps(item, ensure_ascii=False)` strings with Python default separators, preserving object insertion order after parsing.
- Output includes total meaningful items, unique items, duplicate group count, duplicates map, boolean flag, and analysis path.

### Basic field duplicates

- Field duplicate matching uses pattern paths such as `users.[].department`.
- `None` values are skipped.
- Case-insensitive mode lowercases `safe_str(value)`.
- Parent item selection returns the nearest numeric ancestor object for matched paths.
- Route-level pagination/filtering exists in source but advanced Values Explorer behavior is deferred unless explicitly pulled into an MVP fixture later.

### Basic min/max filled records

- Source uses pandas internally; target MVP must not require a dataframe dependency.
- Candidate record arrays prefer arrays of objects, paths containing `data`, and larger arrays.
- Filled values exclude `None`, empty string, whitespace-only strings, and empty arrays/objects.
- Deep analysis recurses into nested objects and arrays; shallow analysis counts top-level present containers as one filled field when non-empty.
- Ties are returned as all min/max records in input order.

## Reference stack observations from csv-align

- `csv-align` uses a Rust root crate plus `src-tauri` and `frontend` directories.
- Its Tauri config uses `beforeDevCommand`, `beforeBuildCommand`, `devUrl`, and `frontendDist` for Vite integration.
- Tauri commands in `src-tauri/src/commands.rs` are thin wrappers over Rust workflow/service functions and managed state.
- Its frontend package uses Vite scripts for `dev`, `build`, `lint`, and `test`.

These observations are layout/workflow references only; JSON Analyzer MVP should not copy CSV-specific filesystem permissions, export commands, or CSV domain logic.
