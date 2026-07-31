---
tags: [release, ci, github, distribution]
execution: worktree
---

## Why

Today the `release:build` GitHub Actions workflow runs on every push to
`main` and stashes the .dmg / .exe / .AppImage / .vsix into the
workflow-run's Artifacts tab. Users can't discover or download those —
they have to know to open the Actions page, pick the right run, and
scroll to Artifacts. There's no versioned, permanent, human-facing
distribution surface.

Formal releases belong under **GitHub Releases**, keyed by semver tag,
with the same three-OS asset set attached. That's what the ecosystem
expects (Homebrew formulas, VS Code marketplace mirrors, "download the
latest" links). The existing `release:version` script and CI matrix
already produce everything needed — this change wires them to a
tag-driven publish path.

## What Changes

1. **New tag trigger** in `.github/workflows/release.yml`:
   `on.push.tags: ["v*.*.*"]`. Existing branch / PR / manual triggers
   are preserved (they still just produce ephemeral CI artifacts).

2. **Version-tag consistency guard**: when a tag build runs, a preflight
   step SHALL fail loudly if the tag (stripped of leading `v`) does not
   match `package.json.version`. This prevents "tagged v0.2.0 but the
   package.json still says 0.1.5" mismatches.

3. **Publish job**: after the three-OS build matrix completes on a tag
   trigger, a new `publish` job SHALL download all matrix artifacts and
   attach them to a GitHub Release created for the tag. Uses the
   default `GITHUB_TOKEN` with `permissions.contents: write`. No
   personal / signing / notarization secrets required.

4. **Release body**: the Release body SHALL name the tag and list the
   attached asset filenames. A stub body is fine for v1 —
   auto-generated changelog is out of scope (deferred as follow-up).
   Users can edit the body post-publish for release notes.

5. **The prior "no secrets referenced" scenario is stale** — need to
   update it to reflect that the default-scope `GITHUB_TOKEN` with
   `contents: write` IS now used for `gh release create` (via
   `softprops/action-gh-release@v2`), while personal / signing /
   notarization creds remain forbidden.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `release`: extend the "Reproducibility CI workflow" requirement with
  tag-triggered publish semantics + version-tag consistency guard + a
  new "publish to GitHub Releases" job. Update the "no secrets"
  scenario to permit the default `GITHUB_TOKEN` (with narrow scope)
  while still forbidding signing/notarization/personal secrets.

## Impact

- `.github/workflows/release.yml` — add tag trigger, version-tag guard
  step, new `publish` job with `softprops/action-gh-release@v2`.
- `openspec/specs/release/spec.md` — via MODIFIED delta.
- No code changes (the build script itself is untouched — this is
  purely CI orchestration).
- No new dependencies (uses a public GitHub Action, no npm additions).

## Non-goals for v1

- **Auto-generated changelog**. The Release body is a fixed template
  in v1. Automatic changelog generation from commit history / archived
  changes is a follow-up.
- **Draft / prerelease flags**. Every tag build creates a plain Release.
  Distinguishing pre-releases (e.g., `v0.1.0-rc.1`) as `prerelease: true`
  is a follow-up polish.
- **Homebrew tap / VS Code marketplace publish**. This change only
  populates GitHub Releases. Marketplace publish still requires
  personal `VSCE_PAT` and stays out of the automated pipeline (a
  maintainer can still `vsce publish` manually).
- **Signing / notarization**. Assets remain unsigned in v1 (same as
  today's ad-hoc artifact uploads). Signing is a separate spec-level
  change that requires cert/token secrets.

## Design notes

**Why `softprops/action-gh-release@v2` vs `gh release create` CLI?**
The Action handles idempotency (re-running the same tag replaces
assets rather than failing), works cleanly across OSes on the
`publish` job, and has a widely-used spec-driven surface. `gh release
create` in bash would need os-conditional escaping and per-asset
looping. Action reads simpler.

**Why keep branch push + PR triggers?** Non-tag builds still catch
regressions early (PR check, main push proof-of-build). They keep the
existing artifact-upload behavior (ephemeral CI artifacts) so nothing
about the current DX regresses.
