# JSON Analyzer

JSON Analyzer is a local-first desktop app for checking, formatting, and exploring JSON data. It helps you understand JSON payloads, find duplicate records and values, inspect field patterns, and safely preview or run guarded `curl` requests.

The app runs locally through a Rust + Tauri desktop shell. It does **not** start a backend HTTP server, and it does not send your JSON to a remote service.

## What you can do

- Paste JSON, validate it, format it, clear it, or load an example.
- Analyze objects, arrays, and duplicate-key JSON while preserving duplicate-key information.
- Optionally flatten a top-level list of lists for analysis.
- Review analysis results in focused views:
  - **Statistics** — summary counts, structure, field patterns, and min/max-filled records.
  - **Values** — grouped values, duplicate value groups, and field-level exploration.
  - **Duplicates** — exact duplicate JSON records.
- Use Values Explorer to search, sort, paginate, and inspect grouped values for selected fields.
- Parse, preview, and execute guarded `curl` requests with redaction, timeouts, response-size limits, private-network guardrails, and in-memory async job cancellation.

## Quick start

### Requirements

- Rust stable with edition 2024 support.
- Node.js 24 recommended. Node 22.12+ should also work.
- pnpm 11.5.1.
- Tauri system prerequisites for your OS when running or building the desktop app.

The repo pins pnpm in `package.json`. If Corepack is available:

```sh
corepack enable
```

Or install pnpm directly:

```sh
npm install -g pnpm@11.5.1
```

### Install dependencies

```sh
pnpm install
```

### Run the desktop app

```sh
pnpm tauri:dev
```

This starts the Vite dev server and opens the Tauri desktop app. The Rust analysis code is compiled into the desktop app and called through Tauri commands; there is no separate Flask, Axum, or localhost API server to run.

### Frontend-only mode

```sh
pnpm -C frontend dev
```

Use this for quick UI work in a browser. Some desktop behavior is represented by fixture-backed browser mocks, so `pnpm tauri:dev` remains the authoritative local app path.

## Useful commands

Run the full local quality gate:

```sh
pnpm check
```

This runs Rust formatting, clippy, Rust tests, frontend lint/typecheck/tests/build, and Tauri tests.

Run a Tauri compile smoke check without creating installers:

```sh
pnpm tauri:build:no-bundle
```

Refresh Tauri icon assets after editing `src-tauri/icons/app-icon.svg`, then do a local smoke check:

```sh
pnpm exec tauri icon src-tauri/icons/app-icon.svg
pnpm tauri:build:no-bundle
```

For a quick visual check, open `pnpm tauri:dev` and confirm the window/app icon renders as expected on your platform.

Create a local unsigned packaged build:

```sh
pnpm tauri:package:local
```

Build outputs are written under `src-tauri/target/release/`. Installer bundles, when created, are under `src-tauri/target/release/bundle/`.

## Project layout

```text
frontend/     React + TypeScript UI and browser mocks
src/          Rust JSON parser, analyzers, DTOs, config, and service layer
src-tauri/    Tauri desktop shell, command handlers, permissions, and app config
tests/        Rust integration tests and fixtures
docs/         Architecture decisions, plans, reviews, and research notes
```

At runtime the flow is:

```text
React UI → typed command wrappers → Tauri commands → JsonAnalyzerService → Rust analysis core
```

## Privacy and security notes

- JSON analysis runs locally.
- The app exposes a narrow Tauri command surface instead of a general backend API.
- The frontend does not receive broad filesystem, shell, or general HTTP permissions.
- `curl` execution is handled by Rust service code with private/sensitive network guardrails, timeout and response-size limits, conservative redirects, and sensitive-value redaction.
- Curl jobs are in-memory only; there is no durable job history or SQLite storage.
- PDF export UI and general report download/save flows are intentionally deferred.

## CI

GitHub Actions runs on pushes and pull requests to `main`:

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Run `pnpm check`.
3. Install Linux Tauri dependencies.
4. Run `pnpm tauri:build:no-bundle`.

Release signing, notarization, installer policy, and distribution checks are not part of CI yet.

## More documentation

- `CONTRIBUTING.md` — development guardrails and expected checks.
- `docs/decisions/` — architecture decision records.
- `docs/plans/` — implementation plans and status notes.
- `docs/reviews/` — design and code review notes.
- `docs/research/` — source-contract notes and fixture backlog.
