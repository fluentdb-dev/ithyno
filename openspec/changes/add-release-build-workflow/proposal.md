---
tags: [release, packaging, electron, vscode-extension, versioning, ci]
execution: worktree
---

## Why

The repo ships three distributable surfaces — the Fastify + Vite CLI
(`bin/ithyno.js` + `server/` + `web/dist/`), an Electron desktop shell
(`electron/`), and a VS Code extension (`vscode-extension/`) — but has
**no reproducible release-build workflow**. Every `package.json` is
pinned at `0.1.0` with no coordinated bump path, there are no git
tags, no `CHANGELOG.md`, and the vsix output filename is a fixed
`ithyno.vsix` that silently overwrites itself, so two "releases" are
indistinguishable on disk. The Electron side produces DMG / NSIS /
AppImage artifacts under `electron/dist/` with default filename
templates that don't embed the version either. `.github/workflows/`
does not exist yet, so nothing rebuilds any of this on a fresh
runner.

The user has asked to "set up the vsix and electron workflow,
starting from version 0.0.1a." That request implies (1) a single
command that produces versioned, side-by-side installer + vsix
artifacts locally, (2) a canonical starting version, and (3) an
extension of the same flow into GitHub Actions so the artifacts can
be reproduced on a clean runner. `0.0.1a` is **not valid semver
2.0.0** — npm, `vsce`, and `electron-updater` all reject it — so the
closest valid equivalent that preserves intent ("0.0.1, alpha
stage") and gives a bumpable counter is **`0.0.1-alpha.0`**. That is
what this change adopts everywhere.

Scope is deliberately narrow: local + CI-runnable reproducible
builds at a chosen version, uploaded as GitHub Actions build
artifacts (not GitHub Releases). Out of scope: code signing,
notarization, Marketplace / npm publish, GitHub Release automation,
auto-update wiring, and any secret-holding step — those depend on
identities and PATs the project doesn't yet own, and belong to
follow-ups.

## What Changes

- **Version alignment**: bump `version` to `0.0.1-alpha.0` in
  `package.json`, `electron/package.json`,
  `vscode-extension/package.json`, and
  `vscode-extension/host/package.json`. (`vendor/agmsg` is a vendored
  third-party tree and is left untouched.)
- **New `release` capability** documenting the contract for producing
  versioned artifacts locally and in CI.
- **Root `npm run release:build`** orchestrator that runs
  `typecheck` → `test` → `build` → vsix package → electron package,
  and prints a summary of produced artifacts + their sizes.
- **Version-bump helper**: `npm run release:version -- <new-version>`
  writes the same version into all four owned `package.json` files,
  rejecting non-semver input.
- **VSIX artifact naming**: `vscode-extension/scripts/prepack.mjs` (or
  the `package` script) emits `ithyno-<version>.vsix` instead of
  `ithyno.vsix`, and `.gitignore` covers the pattern.
- **Electron artifact naming**: add `build.artifactName` in
  `electron/package.json` so DMG / NSIS / AppImage filenames embed
  `${version}` and `${arch}` (e.g. `ithyno-0.0.1-alpha.0-arm64.dmg`).
- **`CHANGELOG.md`** at repo root seeded with an
  `## [0.0.1-alpha.0]` entry.
- **Release checklist doc** at `docs/release.md` describing the
  manual sequence a maintainer runs (bump → build → smoke-test →
  tag).
- **`.github/workflows/release.yml`** — secret-free CI that runs
  `release:build` on `macos-latest`, `windows-latest`,
  `ubuntu-latest`, uploads each host's vsix + electron artifacts as
  an `actions/upload-artifact` bundle, triggered on push to `main`
  and on manual `workflow_dispatch`. No signing, no publish, no
  release creation — just reproducibility proof.

## Success

- `node -e "console.log(require('semver').valid(require('./package.json').version))"`
  prints `0.0.1-alpha.0` (not `null`), and the same value appears in
  all four owned `package.json` files.
- `npm run release:build` completes on a clean checkout and produces:
  - `vscode-extension/ithyno-0.0.1-alpha.0.vsix`
  - `electron/dist/ithyno-0.0.1-alpha.0-*.dmg` (mac), `…-Setup.exe`
    (win), `…-.AppImage` (linux) — each with the version in the
    filename.
- `npm run release:version -- 0.0.1-alpha.1` updates all four
  `package.json` files and re-running `release:build` produces
  artifacts with the new version in their names, with the old
  artifacts still present (no silent overwrite).
- `npm run release:version -- 0.0.1a` exits non-zero and modifies
  nothing.
- `vsce package` accepts the version (no "Invalid version" error),
  and `npm install` on a fresh clone does not error on version
  parsing.
- `CHANGELOG.md` exists at repo root with a `[0.0.1-alpha.0]`
  section; `docs/release.md` lists the maintainer sequence.
- `.github/workflows/release.yml` runs to completion on all three
  runners for a manual `workflow_dispatch` invocation, and each
  runner uploads at least one artifact whose filename contains
  `0.0.1-alpha.0`. No secrets are referenced by the workflow.
