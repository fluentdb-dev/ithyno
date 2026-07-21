# Purpose

TBD — created by archiving change add-release-build-workflow. Update Purpose after archive.

## ADDED Requirements

### Requirement: Canonical version string

The repository SHALL use a single semver-2.0.0-valid version string, shared across all owned `package.json` files, as the source of truth for a release. The initial version SHALL be `0.0.1-alpha.0`.

#### Scenario: Initial version is valid semver

- **GIVEN** the repository at the state introduced by this change
- **WHEN** any consumer parses `package.json.version` with `node-semver`
- **THEN** `semver.valid(version)` returns `"0.0.1-alpha.0"` (not `null`)
- **AND** `npm install`, `vsce package`, and `electron-builder` all accept the value without version-parse errors

#### Scenario: All owned package.json files agree

- **GIVEN** the three owned manifests: `package.json`, `electron/package.json`, `vscode-extension/package.json`
- **WHEN** a reader inspects the `version` field of each
- **THEN** all three report the same value
- **AND** `vendor/**` manifests are treated as vendored and are excluded from this rule
- **AND** `vscode-extension/host/package.json` is a build artifact regenerated from `vscode-extension/package.json` by `prepack.mjs`; it is NOT an owned source and is not enumerated here

### Requirement: Coordinated version bump

The system SHALL provide an idempotent script that bumps the `version` field of all owned `package.json` files to a caller-supplied value, rejecting non-semver input.

#### Scenario: Valid bump succeeds atomically

- **GIVEN** the current version is `0.0.1-alpha.0`
- **WHEN** a maintainer runs `npm run release:version -- 0.0.1-alpha.1`
- **THEN** all three owned `package.json` files are rewritten with `"version": "0.0.1-alpha.1"`
- **AND** no other fields in those files are modified

#### Scenario: Invalid version is rejected

- **GIVEN** a maintainer runs `npm run release:version -- 0.0.1a`
- **WHEN** the script validates the argument via `semver.valid()`
- **THEN** the script exits non-zero with a message identifying `0.0.1a` as invalid semver
- **AND** no `package.json` files are modified

### Requirement: Versioned artifact filenames

Every release artifact SHALL embed the current `version` in its filename so multiple releases coexist on disk without overwriting each other.

#### Scenario: VSIX filename includes version

- **WHEN** the vscode-extension package script runs at version `X.Y.Z[-pre]`
- **THEN** the produced file is `vscode-extension/ithyno-X.Y.Z[-pre].vsix`
- **AND** the fixed-name `ithyno.vsix` is NOT produced by this script

#### Scenario: Electron artifact filenames include version and arch

- **WHEN** `electron-builder` runs at version `X.Y.Z[-pre]` on any supported host
- **THEN** each produced installer under `electron/dist/` contains both the version and the architecture in its filename (e.g. `ithyno-0.0.1-alpha.0-arm64.dmg`, `ithyno-0.0.1-alpha.0-Setup-x64.exe`, `ithyno-0.0.1-alpha.0-x86_64.AppImage`)
- **AND** re-running the build after a version bump does not overwrite the previous version's artifacts

### Requirement: `release:build` orchestrator

The repository SHALL expose a single root npm script `release:build` that produces all release artifacts locally in a deterministic order.

#### Scenario: End-to-end local release build

- **GIVEN** a clean checkout with the current version pinned in all owned `package.json` files
- **WHEN** a maintainer runs `npm run release:build`
- **THEN** the script executes `npm run typecheck`, `npm test`, `npm run build`, the vscode-extension package script, and the electron package script, in that order
- **AND** the script fails fast if any step exits non-zero
- **AND** on success the script prints a summary listing each produced artifact path with its size

#### Scenario: Scope of the orchestrator

- **WHEN** a maintainer runs `npm run release:build`
- **THEN** the script does NOT sign artifacts, does NOT notarize, does NOT publish to any marketplace or registry, and does NOT create git tags or GitHub releases
- **AND** those actions remain manual follow-ups documented in `docs/release.md`

### Requirement: Changelog and release documentation

The repository SHALL maintain a `CHANGELOG.md` at its root and a `docs/release.md` describing the manual release sequence.

#### Scenario: Changelog exists and covers the initial alpha

- **WHEN** a reader opens `CHANGELOG.md`
- **THEN** the file contains a `# Changelog` heading
- **AND** a `## [0.0.1-alpha.0]` section describes the initial release-build workflow

#### Scenario: Release doc lists the maintainer steps

- **WHEN** a reader opens `docs/release.md`
- **THEN** the document lists, in order: bump version via `release:version`, update `CHANGELOG.md`, run `release:build`, smoke-test each produced artifact, and create a `v<version>` git tag
- **AND** it explicitly names signing, notarization, marketplace publish, and Release-automation as out of scope for this workflow and tracked as follow-ups

### Requirement: Reproducibility CI workflow

The repository SHALL provide a `.github/workflows/release.yml` GitHub Actions workflow that runs `release:build` on macOS, Windows, and Linux hosts and uploads the resulting artifacts, without referencing any repository secrets.

#### Scenario: Matrix build on push and manual dispatch

- **GIVEN** a push to `main` or a manual `workflow_dispatch` trigger
- **WHEN** the workflow runs
- **THEN** three jobs execute in parallel on `macos-latest`, `windows-latest`, `ubuntu-latest`
- **AND** each job runs `npm ci` followed by `npm run release:build`
- **AND** each job uploads its produced artifacts via `actions/upload-artifact@v4` under a name that includes the runner OS and the commit SHA

#### Scenario: No secrets referenced

- **WHEN** a reviewer inspects `.github/workflows/release.yml`
- **THEN** the file does NOT reference `secrets.*` (no `VSCE_PAT`, no signing certs, no notarization creds, no `GITHUB_TOKEN` beyond the default write scope for artifact uploads)
- **AND** the workflow does NOT invoke `vsce publish`, `electron-builder --publish always`, or `gh release create`

#### Scenario: PR builds skip artifact upload

- **GIVEN** the workflow runs for a `pull_request` event
- **WHEN** the build step completes
- **THEN** the `actions/upload-artifact` step is skipped (either via an `if:` guard or by conditional inclusion) so PR CI stays fast
- **AND** the build itself still runs, so PR authors get build-failure signal
