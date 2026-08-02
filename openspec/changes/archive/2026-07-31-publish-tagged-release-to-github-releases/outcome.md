# Outcome — publish-tagged-release-to-github-releases

## ✅ Worked

- **YAML diff was surgically small.** ~50 new lines total: 3-line tag
  trigger under `on.push`, 15-line preflight verify step, and a
  ~35-line `publish` job. All other pieces of the workflow (matrix
  build, concurrency group, artifact upload) stayed identical.
- **Least-privilege permissions worked cleanly.** `permissions: contents: write`
  at the job level (not workflow level) is the correct scope for
  Release creation via `GITHUB_TOKEN`. No workflow-wide permission
  bump needed.
- **Node-based version guard sidesteps shell-portability drama.**
  A single `node -e "..."` block runs identically on macOS / Linux /
  Windows runners — no bash vs pwsh conditionals, no jq install.
  Grabs `package.json.version`, strips the `v` prefix off
  `GITHUB_REF_NAME`, prints both, exits non-zero on mismatch.

## ⚠️ Surprises

- **`actions/download-artifact@v4` without `name:` grabs everything
  the workflow uploaded and puts each under its own subdirectory.**
  That's exactly the fan-in behavior we want (`dist-artifacts/
  ithyno-macos-latest-<sha>/…`, etc.), but it's easy to
  underread from the docs. `files: dist-artifacts/**/ithyno-*.<ext>`
  in the release step then aggregates across all subdirs.
- **`fail_on_unmatched_files: true` catches silent matrix regressions.**
  Without it, if one OS build failed to produce (e.g., macOS DMG
  packaging broke), the Release would still create with only 3-of-4
  asset shapes and no error. With it, the workflow fails — the
  correct behavior for a formal Release.

## 🔁 Differently next time

- **Consider a dedicated preflight job instead of an in-`build` step.**
  Right now the version-guard runs 3 times (once per matrix OS). A
  single upstream `preflight` job with `needs: preflight` on `build`
  would fail once, cheaply, before any matrix minutes get spent. For
  MVP the 3x cost is negligible (guard runs in <1s), but for future
  polish this'd be cleaner.
- **The Release body template is fixed markdown.** It'd be nice to
  auto-generate a changelog from OpenSpec archive entries between
  the last tag and this one (`git log v_prev..v_current --grep=archive:`).
  Deferred as a follow-up per the propose's non-goals.

## 🌱 Follow-ups

1. **Auto-generated changelog** — walk the OpenSpec archive dir for
   entries dated between last tag and this tag, format them into the
   Release body. Could be a small `scripts/release-changelog.mjs`
   invoked by the `publish` job before `softprops/action-gh-release`.
2. **Prerelease flag** — tags matching `v*-alpha.*` / `v*-beta.*` /
   `v*-rc.*` should probably set `prerelease: true`. Currently every
   Release is a plain one. Small conditional in the publish step.
3. **Homebrew tap PR bump** — after a Release lands, open a PR to a
   tap repo updating the formula's version + SHA256. Requires a
   personal token for the tap repo, so lives outside this workflow's
   "no personal secrets" contract; would be a separate opt-in job.
4. **VS Code marketplace publish** — same shape: requires `VSCE_PAT`,
   so out of scope for this workflow. Maintainer keeps doing
   `vsce publish` manually for now.
5. **Codesign / notarize the macOS DMG** — requires Apple ID +
   app-specific password + signing certs. Would materially improve
   the "download-and-open" UX on macOS (avoids the Gatekeeper
   warning), but again requires personal secrets so it's a separate
   spec change.
