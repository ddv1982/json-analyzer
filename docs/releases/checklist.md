# Release Checklist

Use this checklist for each release candidate.

1. Run `pnpm baseline` and inspect the largest-file list for unexpected growth.
2. Run `pnpm check`.
3. Run `pnpm run tauri:build:no-bundle`.
4. Run a desktop smoke test for JSON analysis, Values Explorer, Duplicates, Curl Executor, light theme, and dark theme.
5. For local Linux bundles, run `pnpm run tauri:package:local`, then validate generated `.deb` and `.rpm` artifacts with `python3 scripts/validate_linux_package_metadata.py <artifact>`.
6. Confirm `src-tauri/tauri.conf.json`, `src-tauri/appstream/com.jsonanalyzer.desktop.metainfo.xml`, and release notes all report the same version.
7. Keep release notes factual: shipped behavior, fixed bugs, verification performed, and known deferred work only.
8. Commit the release changes to `main`, push `main`, create the matching `vX.Y.Z` tag on that commit, and push the tag.
9. If the tag exists but no release was published, confirm `CI` succeeded for the tagged commit and still has release artifacts, then run the `Release` workflow manually from GitHub Actions with the existing tag.

Shortcut:

```sh
pnpm run release:verify
```
