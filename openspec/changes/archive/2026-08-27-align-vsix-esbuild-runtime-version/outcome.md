# Outcome: align-vsix-esbuild-runtime-version

## Worked

- Resolving one authoritative esbuild version from the root installation kept
  the JavaScript host and all six bundled platform packages aligned at `0.28.1`.
- Prepack validation now fails before VSIX creation when a runtime package is
  missing or version-drifted.
- Both the locally built and GitHub-published `0.8.1-alpha.4` VSIX were unpacked
  and verified; the bundled binary started successfully and the POSIX binaries
  retained executable permissions.

## Surprises

- Pinning only the `@esbuild/*` packages was insufficient because the staged
  transitive `esbuild` package could independently advance during a fresh CI
  install.
- The `0.8.1-alpha.3` permission fix was valid, but it exposed a separate
  host/binary version mismatch in the same packaged runtime.

## Differently

- Treat JavaScript wrapper packages and native platform binaries as one atomic
  runtime in future packaging changes.
- Inspect the final downloadable artifact, not only the staging directory or
  local dependency tree, before completing a release.

## Follow-ups

- Keep the esbuild alignment check in the release packaging path so dependency
  updates cannot silently reintroduce host/binary drift.
