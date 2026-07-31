# Tasks

## 1. Workflow: tag trigger + version guard

- [x] 1.1 Add `on.push.tags: ["v*.*.*"]` to `.github/workflows/release.yml` alongside the existing branch / PR / dispatch triggers. Existing `concurrency.group: release-${{ github.ref }}` covers tag refs correctly (each tag ref gets its own group), so no `concurrency` change needed.
- [x] 1.2 Add a preflight `Verify tag matches package.json version` step in the `build` job, gated on `if: startsWith(github.ref, 'refs/tags/')`. The step extracts the tag (strip `refs/tags/v` prefix), reads `package.json.version`, and fails the workflow with a clear error if they differ.

## 2. Workflow: publish job

- [x] 2.1 Add a new `publish` job to `.github/workflows/release.yml`, gated on `if: startsWith(github.ref, 'refs/tags/')`, with `needs: build` so it waits for all three matrix builds.
- [x] 2.2 The `publish` job SHALL declare `permissions: contents: write` at the job level (not workflow level — least-privilege). No other permissions needed.
- [x] 2.3 The `publish` job SHALL download all matrix artifacts via `actions/download-artifact@v4` (all-of-workflow pattern — omit `name:` to pull every uploaded artifact).
- [x] 2.4 The `publish` job SHALL invoke `softprops/action-gh-release@v2` with:
      - `tag_name: ${{ github.ref_name }}` (the v-prefixed tag as-pushed)
      - `name: ${{ github.ref_name }}` (Release title = tag name)
      - `files:` glob over every asset filename shape emitted by build (`ithyno-*.vsix`, `ithyno-*.dmg`, `ithyno-*.exe`, `ithyno-*.AppImage`)
      - `body:` a stub explaining "Built from tag <ref_name>. Attached assets:" + a listing of file basenames (Action interpolation)
      - `draft: false`, `prerelease: false` (v1 doesn't distinguish; follow-up)
      - `fail_on_unmatched_files: true` — if a matrix build didn't produce something, don't silently ship an incomplete release
- [x] 2.5 The download+publish steps SHALL use only `GITHUB_TOKEN` (the default token exposed via `secrets.GITHUB_TOKEN`). No personal/signing/notarization secrets referenced.

## 3. Spec + docs

- [x] 3.1 Write the MODIFIED delta at `openspec/changes/publish-tagged-release-to-github-releases/specs/release/spec.md` extending the "Reproducibility CI workflow" requirement with the tag trigger, version guard, and publish job. Add three new scenarios (tag-triggered publish / version-guard fails on mismatch / publish attaches assets from all matrix jobs). Update the "no secrets" scenario to permit `GITHUB_TOKEN` narrow-scope while continuing to forbid signing / notarization / personal secrets.
- [x] 3.2 Add PENDING annotation to the current `openspec/specs/release/spec.md`'s "Reproducibility CI workflow" requirement.

## 4. Verification

- [x] 4.1 `npm run openspec -- validate publish-tagged-release-to-github-releases --strict` — passes.
- [ ] 4.2 GitHub Actions lint (`actionlint` if the maintainer runs it locally, or trust the syntax on push).
- [ ] 4.3 Manual smoke (deferred to maintainer): create a test tag on a scratch branch (e.g., `v0.0.1-test.0` after bumping `package.json`), push it, watch the workflow complete + Release appear under GitHub Releases with all four asset types attached.

## 5. Docs

- [x] 5.1 Write outcome.md capturing: which asset filenames landed on the test Release, whether the `softprops/action-gh-release@v2` action handled asset globbing across the three OS matrix outputs correctly, and any lessons for the deferred follow-ups (auto-changelog, prerelease flag).
