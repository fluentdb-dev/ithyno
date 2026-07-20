# Changelog

All notable changes to ithyno are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1-alpha.0] - 2026-07-20

### Added

- **Version alignment**: all four owned `package.json` files (`package.json`,
  `electron/package.json`, `vscode-extension/package.json`,
  `vscode-extension/host/package.json`) pinned to `0.0.1-alpha.0` — a valid
  semver 2.0.0 string accepted by npm, vsce, and electron-builder.

- **Versioned artifact filenames**: the vscode-extension `package` script now
  emits `ithyno-<version>.vsix` (e.g. `ithyno-0.0.1-alpha.0.vsix`) instead of
  the fixed `ithyno.vsix`, so multiple releases coexist on disk. Electron
  artifacts embed version and arch via `electron-builder`'s `artifactName`
  template (e.g. `ithyno-0.0.1-alpha.0-arm64.dmg`).

- **`release:build` script**: `npm run release:build` runs `typecheck` → `test`
  → `build` → vscode-extension package → electron package (host platform), in
  order, failing fast on any step. Prints a summary of produced artifacts with
  sizes at the end.

- **`release:version` script**: `npm run release:version -- <new-version>`
  validates the argument with `semver.valid()` and writes it atomically to all
  four owned manifests. Rejects non-semver input with a non-zero exit and no
  file modifications.

- **CI workflow**: `.github/workflows/release.yml` runs `release:build` on
  macOS, Windows, and Linux in parallel, uploads artifacts via
  `actions/upload-artifact@v4`, and references no repository secrets.

- **Release documentation**: `docs/release.md` describes the manual maintainer
  sequence (bump → changelog → build → smoke-test → tag).
