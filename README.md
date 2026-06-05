# JSON Analyzer

JSON Analyzer is a local-first desktop app for validating, formatting, and exploring JSON data. It helps you inspect large payloads, spot duplicate records and values, review field patterns, and safely preview or run guarded `curl` requests.

Your JSON stays on your machine. The app runs through a Rust + Tauri desktop shell and does not send pasted JSON to a remote service.

## Features

- Validate, format, clear, and load example JSON.
- Analyze objects, arrays, nested structures, and duplicate-key JSON.
- Review summary statistics, field patterns, duplicate records, and grouped values.
- Search, sort, page, expand, and copy values from the Values Explorer.
- Parse and run guarded `curl` requests with redaction, timeouts, response-size limits, redirect limits, and private-network guardrails.

## Install

Desktop builds are published on the GitHub Releases page:

- [Releases](https://github.com/ddv1982/json-analyzer/releases)

### macOS

Download the `.dmg` for your Mac from the latest release:

- Apple Silicon: `aarch64` / ARM64
- Intel: `x86_64`

Open the `.dmg` and drag JSON Analyzer into Applications.

### Linux

Linux builds require a distro with **WebKitGTK 4.1**.

Enable the repository once per machine:

```bash
bash <(curl -fsSL https://github.com/ddv1982/json-analyzer/releases/latest/download/install-apt-repo.sh)
```

The setup script downloads the repository setup package to a temporary file, verifies it against a GPG-signed SHA256 sidecar from the release, installs the JSON Analyzer archive keyring and APT source configuration, then removes the temporary files.

Refresh APT metadata:

```bash
sudo apt update
```

Install JSON Analyzer:

```bash
sudo apt install json-analyzer
```

After the repository is enabled, use normal `sudo apt update` and `sudo apt install json-analyzer` commands for installs and updates. JSON Analyzer can also be installed by searching for "JSON Analyzer" in GNOME Software or Ubuntu Software after package/AppStream metadata has refreshed.

The standalone `.AppImage`, `.deb`, and `.rpm` release assets remain available as direct-download fallback options. Use the `.rpm` package on RPM-based distributions such as Fedora, RHEL-compatible, and openSUSE systems that provide WebKitGTK 4.1.

## Run From Source

Requirements:

- Rust stable with edition 2024 support
- Node.js 24
- pnpm 11.5.1
- Tauri system prerequisites for your operating system

Install dependencies:

```sh
pnpm install
```

Run the desktop app:

```sh
pnpm tauri:dev
```

Run the frontend in a browser for UI-only work:

```sh
pnpm -C frontend dev
```

Some desktop behavior is mocked in browser mode, so `pnpm tauri:dev` is the authoritative local app path.

## Build And Check

Run the full local quality gate:

```sh
pnpm check
```

Compile the Tauri app without installer bundles:

```sh
pnpm tauri:build:no-bundle
```

Create unsigned local bundles for the current platform:

```sh
pnpm tauri:package:local
```

Build outputs are written under `src-tauri/target/release/`. Installer bundles are written under `src-tauri/target/release/bundle/` or a target-specific bundle directory when cross-target builds are used.

## Release Notes

Each release tag must have matching notes in:

```text
docs/releases/vX.Y.Z.md
```

CI builds and validates Linux packages, including desktop/AppStream metadata. The release workflow reuses the passing Linux CI artifact, signs Debian packages when signing is enabled, publishes the signed APT repository to GitHub Pages, and builds macOS DMGs from the same prebuilt frontend artifact.

## Project Layout

```text
frontend/     React + TypeScript UI
src/          Rust JSON parser, analyzers, DTOs, config, and service layer
src-tauri/    Tauri desktop shell, command handlers, permissions, and package metadata
scripts/      Packaging and release validation helpers
tests/        Rust integration tests and fixtures
docs/         Decisions, plans, reviews, release notes, and research notes
```

## Privacy And Security

- JSON analysis runs locally.
- The frontend talks to Rust through narrow Tauri commands.
- The app does not grant broad filesystem, shell, or general frontend network access.
- Curl execution is handled by Rust with guardrails and in-memory jobs only.
