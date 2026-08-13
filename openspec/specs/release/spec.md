# release Specification

## Purpose
TBD - created by archiving change add-release-build-workflow. Update Purpose after archive.
## Requirements
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

The repository SHALL expose a single root npm script `release:build` that produces all release artifacts locally in a deterministic order, and SHALL verify the produced bundles' shape and scaffold reachability before the artifact summary prints.

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

#### Scenario: Bundle verification runs before the artifact summary

- **GIVEN** a `release:build` invocation that has completed `typecheck`, `test`, `build`, vscode-extension `package`, and electron `package` steps successfully
- **WHEN** the orchestrator continues past the electron package step
- **THEN** it executes `node scripts/verify-bundle.mjs` before invoking `scripts/release-summary.mjs`
- **AND** if `verify-bundle.mjs` exits non-zero the orchestrator fails fast with that exit code, matching the fail-fast contract applied to every earlier step
- **AND** on verification success the orchestrator proceeds to the artifact summary as before

#### Scenario: Bundle verification asserts npm tarball shape

- **GIVEN** the `verify-bundle.mjs` script is invoked from `release:build` (or directly via `npm run release:verify-bundle`)
- **WHEN** the script runs `npm pack --pack-destination <tmpdir>` on the repo root, extracts the resulting `.tgz`, and walks the extracted `package/` tree
- **THEN** every path containing `ithy-opsx` MUST live under `package/templates/.claude/…` or the canonical universal source `package/ithyno/skills/…`
- **AND** no path MUST match `^package/\.claude/commands/ithy-opsx` or `^package/\.claude/skills/ithy-opsx-`
- **AND** on either invariant violation the script exits non-zero with a message naming the offending path AND naming `distribute-ithy-opsx-via-init-templates` as the contract being violated

#### Scenario: Bundle verification asserts Electron bundle shape for each produced OS bundle

- **GIVEN** the `verify-bundle.mjs` script inspects `electron/dist/` for produced bundles
- **WHEN** it finds a Mac bundle at `electron/dist/mac*/ithyno.app/Contents/Resources/app/` or a Windows unpacked bundle at `electron/dist/win-unpacked/resources/app/`
- **THEN** for each such bundle it MUST assert every path containing `ithy-opsx` lives under `<app>/templates/.claude/…` or the canonical universal source `<app>/ithyno/skills/…`
- **AND** MUST assert `<app>/.claude/commands/ithy-opsx/` and `<app>/.claude/skills/ithy-opsx-*/` do NOT exist
- **AND** MUST skip (with a logged notice, not a failure) any OS bundle not present in `electron/dist/`, so the host-only `release:build` path (which produces only the host OS bundle) still verifies the bundle it did produce without failing on the absent bundles
- **AND** Linux AppImage bundle contents SHALL be skipped in this change (documented in `design.md` D3 and reserved for a future extension)

#### Scenario: Bundle verification runs init from the packaged bin

- **GIVEN** at least one Electron bundle is present under `electron/dist/`
- **WHEN** `verify-bundle.mjs` selects one bundle (prefer Mac arm64 if present, else Mac x64, else Windows unpacked) and shells out to that bundle's `<app>/bin/ithyno init <mkdtemp target>`
- **THEN** the bundled bin MUST exit zero
- **AND** the target MUST contain every file under the source repo's `.claude/commands/ithy-opsx/` at `<target>/.claude/commands/ithy-opsx/…`, byte-identical
- **AND** the target MUST contain every file under each source `.claude/skills/ithy-opsx-*/` at `<target>/.claude/skills/<skill>/…`, byte-identical
- **AND** on any mismatch the script exits non-zero with a message identifying the missing or diverging path, so a reader can grep `bin/init.js` or the bundle's `extraResources` config in one step

#### Scenario: `release:verify-bundle` invokes verification independently

- **GIVEN** an existing `electron/dist/` populated by a prior `release:build`
- **WHEN** a maintainer runs `npm run release:verify-bundle`
- **THEN** the script executes `node scripts/verify-bundle.mjs` and applies the same assertions as the `release:build`-integrated path
- **AND** the script does NOT re-run typecheck, test, build, vscode-extension package, or electron package (its purpose is to iterate on verification without paying the full release chain's cost)

#### Scenario: Bundle verification failure surfaces a specific, actionable message

- **GIVEN** a hypothetical regression that reintroduces `.claude/commands/ithy-opsx` to root `package.json` `files` OR to `electron/package.json` `extraResources`
- **WHEN** `release:build` runs and reaches the `verify-bundle` step
- **THEN** the script exits non-zero with a message that (a) names the specific path that violated the invariant, (b) identifies the artifact (tarball, mac bundle, or win bundle), and (c) references `distribute-ithy-opsx-via-init-templates` as the contract being violated
- **AND** the release build stops before the artifact summary prints, ensuring no unverified bundle is announced as ready

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

The repository SHALL provide a `.github/workflows/release.yml` GitHub Actions workflow that runs `release:build` on macOS, Windows, and Linux hosts. The workflow's build SHALL fire on exactly three trigger classes: tag pushes matching `v*.*.*`, `pull_request` events, and manual `workflow_dispatch`. Branch pushes (including to `main`) SHALL NOT trigger the build — the tag push that follows a release-branch merge is the single authoritative build for a given release commit. Tag pushes SHALL additionally trigger a `publish` job that creates a GitHub Release for the tag and attaches every produced asset. PR builds SHALL skip artifact upload (regression check only). Dispatch runs SHALL upload artifacts to the workflow run.

The workflow SHALL use the default `GITHUB_TOKEN` (scoped narrowly per job) for artifact upload and — on tag runs — for creating the Release. It SHALL NOT reference any personal / signing / notarization secrets (no `VSCE_PAT`, no `APPLE_ID_PASSWORD`, no signing certs).

Before any tag-triggered build step, the workflow SHALL fail loudly if the pushed tag (stripped of leading `v`) does not match the current `package.json.version`. This closes the "tagged `v0.2.0` but package.json still says `0.1.5`" mismatch class.

#### Scenario: Matrix build on push and manual dispatch

- **GIVEN** a tag push matching `v*.*.*` OR a manual `workflow_dispatch` trigger
- **WHEN** the workflow runs
- **THEN** three jobs execute in parallel on `macos-latest`, `windows-latest`, `ubuntu-latest`
- **AND** each job runs `npm ci` followed by `npm run release:build`
- **AND** each job uploads its produced artifacts via `actions/upload-artifact@v4` under a name that includes the runner OS and the commit SHA
- **AND** a plain push to `main` (or any other branch) does NOT trigger the workflow — the workflow's `on.push` block declares only `tags:`, not `branches:`

#### Scenario: No secrets referenced

- **WHEN** a reviewer inspects `.github/workflows/release.yml`
- **THEN** the file does NOT reference `secrets.VSCE_PAT`, `secrets.APPLE_ID_PASSWORD`, `secrets.CSC_LINK`, `secrets.CSC_KEY_PASSWORD`, or any similar signing / notarization / marketplace credentials
- **AND** the workflow does NOT invoke `vsce publish` or `electron-builder --publish always`
- **AND** the only secret referenced is the default `secrets.GITHUB_TOKEN`, used exclusively by the `publish` job with `permissions: contents: write` for creating the GitHub Release and uploading assets to it

#### Scenario: PR builds skip artifact upload

- **GIVEN** the workflow runs for a `pull_request` event
- **WHEN** the build step completes
- **THEN** the `actions/upload-artifact` step is skipped (either via an `if:` guard or by conditional inclusion) so PR CI stays fast
- **AND** the build itself still runs, so PR authors get build-failure signal

#### Scenario: Tag push publishes a GitHub Release

- **GIVEN** a maintainer pushes an annotated or lightweight tag matching `v*.*.*` (e.g., `v0.0.1-alpha.1`)
- **AND** `package.json.version` equals the tag's version part (`0.0.1-alpha.1`)
- **WHEN** the release workflow runs
- **THEN** the three-OS matrix `build` job completes and each uploads its assets as workflow artifacts
- **AND** a `publish` job runs afterwards (via `needs: build`, gated on `if: startsWith(github.ref, 'refs/tags/')`)
- **AND** the `publish` job downloads every matrix artifact via `actions/download-artifact@v4`
- **AND** it invokes `softprops/action-gh-release@v2` with `tag_name: ${{ github.ref_name }}`, `name: ${{ github.ref_name }}`, `files:` covering `ithyno-*.vsix`, `ithyno-*.dmg`, `ithyno-*.exe`, `ithyno-*.AppImage`, and `fail_on_unmatched_files: true`
- **AND** a GitHub Release for the tag appears with all four asset kinds attached

#### Scenario: Tag / version mismatch fails the build

- **GIVEN** a maintainer pushes tag `v0.2.0`
- **AND** `package.json.version` is still `0.1.5` (bump was forgotten)
- **WHEN** the workflow's preflight version-guard step runs
- **THEN** the step exits non-zero with a message that names both values (`tag=v0.2.0 vs package.json.version=0.1.5`)
- **AND** no downstream build or publish step runs
- **AND** no partial / mismatched GitHub Release is created

#### Scenario: Non-tag pushes do NOT create a Release

- **GIVEN** a `workflow_dispatch` trigger OR a `pull_request` event (branch pushes to `main` do not trigger the workflow at all)
- **WHEN** the workflow runs to completion
- **THEN** the `publish` job is skipped (its `if: startsWith(github.ref, 'refs/tags/')` guard evaluates false)
- **AND** no GitHub Release is created
- **AND** ephemeral CI artifacts (for dispatch runs) or a build-only regression check (for PR events) remain the only workflow outputs for non-tag runs
