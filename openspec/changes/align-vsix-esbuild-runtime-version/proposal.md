## Why

The `0.8.1-alpha.3` VSIX can fail at startup because its JavaScript `esbuild` package is `0.28.2` while the bundled platform binary is `0.28.1`. The cross-platform packaging step must treat these packages as one versioned runtime instead of allowing npm to resolve them independently.

## What Changes

- Pin the staged `esbuild` JavaScript package and every bundled `@esbuild/*` platform package to one authoritative version.
- Resolve that version from the installed, lockfile-backed root dependency used by the release build instead of silently falling back to a hard-coded value.
- Fail VSIX prepack when the staged JavaScript package or any required platform package is missing or has a different version.
- Add regression tests for dependency generation, aligned packages, and mismatch detection.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `vscode-extension`: Require the packaged VSIX to contain an aligned esbuild JavaScript runtime and platform binaries so the extension server can start on every supported OS.

## Impact

- Affects `vscode-extension/scripts/prepack.mjs` and its esbuild packaging helper/tests.
- Changes only build-time dependency staging; no dashboard API or stored data changes.
- The already published `0.8.1-alpha.3` artifact remains immutable and requires a follow-up release containing the corrected VSIX.
