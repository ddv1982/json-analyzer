# Release Checklist

Use this checklist for each release candidate.

1. Run `pnpm baseline` and inspect the largest-file list for unexpected growth.
2. Run `pnpm check`.
3. Run `pnpm run tauri:build:no-bundle`.
4. Run a desktop smoke test for JSON analysis, Values Explorer, Duplicates, Curl Executor, light theme, and dark theme.
5. For local Linux bundles, run `pnpm run tauri:package:local`, then validate generated `.deb` and `.rpm` artifacts with `python3 scripts/validate_linux_package_metadata.py <artifact>`.
6. Confirm `src-tauri/tauri.conf.json`, `src-tauri/appstream/com.jsonanalyzer.desktop.metainfo.xml`, and release notes all report the same version.
7. Keep release notes factual: shipped behavior, fixed bugs, verification performed, and known deferred work only.

Shortcut:

```sh
pnpm run release:verify
```
