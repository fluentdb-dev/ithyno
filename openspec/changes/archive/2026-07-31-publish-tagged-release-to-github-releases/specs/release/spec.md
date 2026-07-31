## MODIFIED Requirements

### Requirement: Reproducibility CI workflow

The repository SHALL provide a `.github/workflows/release.yml` GitHub Actions workflow that runs `release:build` on macOS, Windows, and Linux hosts and uploads the resulting artifacts. Non-tag runs (`push` to `main`, `pull_request`, `workflow_dispatch`) SHALL produce ephemeral CI artifacts only. Tag pushes matching `v*.*.*` SHALL additionally trigger a `publish` job that creates a GitHub Release for the tag and attaches every produced asset.

The workflow SHALL use the default `GITHUB_TOKEN` (scoped narrowly per job) for artifact upload and — on tag runs — for creating the Release. It SHALL NOT reference any personal / signing / notarization secrets (no `VSCE_PAT`, no `APPLE_ID_PASSWORD`, no signing certs).

Before any tag-triggered build step, the workflow SHALL fail loudly if the pushed tag (stripped of leading `v`) does not match the current `package.json.version`. This closes the "tagged `v0.2.0` but package.json still says `0.1.5`" mismatch class.

#### Scenario: Matrix build on push and manual dispatch

- **GIVEN** a push to `main` or a manual `workflow_dispatch` trigger
- **WHEN** the workflow runs
- **THEN** three jobs execute in parallel on `macos-latest`, `windows-latest`, `ubuntu-latest`
- **AND** each job runs `npm ci` followed by `npm run release:build`
- **AND** each job uploads its produced artifacts via `actions/upload-artifact@v4` under a name that includes the runner OS and the commit SHA

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

- **GIVEN** any push to `main` (not a tag) or a manual `workflow_dispatch` trigger
- **WHEN** the workflow runs to completion
- **THEN** the `publish` job is skipped (its `if: startsWith(github.ref, 'refs/tags/')` guard evaluates false)
- **AND** no GitHub Release is created
- **AND** ephemeral CI artifacts remain the only distribution surface for non-tag runs
