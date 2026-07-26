---
tags: [testing, release, bundle-verification, ithy-opsx, ci, electron]
execution: worktree
---

## Why

`distribute-ithy-opsx-via-init-templates` (archived 2026-07-25) made
`templates/.claude/…` the sole shipping path for `/ithy-opsx:*`, removing
bare `.claude/…` entries from `package.json` `files` and
`electron/package.json` `extraResources`. `add-init-scaffold-smoke-test`
(just landed) covers the source-tree side of that contract: `npm pack
--dry-run` shape and `runInit()` scaffold reachability.

The distributed *bundle* side is still unverified. What real users
receive — the npm tarball unpacked on their disk, the packaged Electron
`.app` / `.exe` / `.AppImage` under `Resources/app/…` — could
independently regress:

1. A future edit to `electron/package.json` `extraResources` that re-adds
   `../,.claude` or copies the dev-copy `.claude/` alongside `templates/`
   ships duplicate skill files inside the packaged `.app`. The
   source-tree `npm pack` check does not catch this (it doesn't inspect
   the Electron bundle).
2. A future edit to `bin/init.js` that changes how the bundled `bin/ithyno`
   resolves `templates/` (e.g., wrong `resolveBundledSkillsRoot()` walk
   when invoked from inside `Contents/Resources/app/`) could leave the
   Electron bundle able to launch but unable to scaffold. `runInit()`
   run against the *dev* tree in `add-init-scaffold-smoke-test` does not
   catch this — it never exercises the packaged bin.
3. A `files` regression in the root `package.json` that ships bare
   `.claude/…` in the tarball would slip past today's Vitest
   `npm pack --json` grep (it checks the current HEAD's shape, not the
   post-`electron-builder` bundle's shape) if the Electron and npm
   paths diverge.

This is Follow-up #5 from `distribute-ithy-opsx-via-init-templates`
(originally noted in the earlier `unify-ithyno-slash-command-surface`
outcome doc, re-scoped after distribute landed). It is the Phase B
"bundled-init smoke + no bare `.claude/` in artifacts" item from
[`docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`](../../../docs/ideas/2026-07-26-comprehensive-skill-test-plan.md).

## What Changes

- **New**: `scripts/verify-bundle.mjs`, a plain Node ESM script (matching
  the shape of `scripts/release-build.mjs` and `scripts/release-summary.mjs`)
  that asserts three invariants against the current release output:
  1. **npm tarball check** — invoke `npm pack --pack-destination <tmp>` on
     `repoRoot`, extract the resulting `.tgz` into a temp dir, walk the
     unpacked tree, and assert every path containing `ithy-opsx` sits
     under `package/templates/.claude/…`. No entry SHALL match
     `^package/\.claude/commands/ithy-opsx` or
     `^package/\.claude/skills/ithy-opsx-`. Distinct from the source-tree
     `npm pack --dry-run` Vitest: this one unpacks the actual tarball
     bytes, catching regressions where `files` and packaged content
     diverge (e.g., a hypothetical `.npmignore` reintroducing a bare
     dir).
  2. **Electron bundle check** — for each host-OS bundle that exists in
     `electron/dist/` (Mac `.app` under `mac*/ithyno.app/Contents/Resources/app/`;
     Win `nsis` unpacked under `win-unpacked/resources/app/`; Linux
     AppImage extraction skipped — see design.md D3), assert every path
     containing `ithy-opsx` sits under `.../app/templates/.claude/…`, and
     assert `.../app/.claude/commands/ithy-opsx/` and
     `.../app/.claude/skills/ithy-opsx-*/` do NOT exist. Only asserts
     the bundles that were actually produced by the current release
     build; missing OS bundles are skipped, not fatal.
  3. **Init-from-bundle smoke** — shell out to the bundled
     `Contents/Resources/app/bin/ithyno init <tmp>` (Mac path;
     equivalent on other OSes) against a `mkdtemp()` target and assert
     the target ends up with the same file set the source-tree
     `runInit()` smoke asserts (every `.claude/commands/ithy-opsx/*` and
     every `.claude/skills/ithy-opsx-*/` file, byte-identical to the
     source under `templates/`). This is the strongest check: it proves
     the packaged bin resolves the bundled `templates/` correctly on a
     real filesystem, not just that the files sit at the expected path.
- **Hook**: `scripts/release-build.mjs` appends a
  `run("bundle verify", "node scripts/verify-bundle.mjs")` step
  immediately before the artifact-summary step. On failure the release
  build exits non-zero, matching the fail-fast contract of the existing
  steps.
- **Optional CI hook**: a new root npm script `release:verify-bundle`
  wraps `node scripts/verify-bundle.mjs` so CI (or a maintainer) can
  invoke bundle verification independently — useful when iterating on
  `electron-builder` config without re-running the full release chain.
  Not wired into `npm test`: verification requires a produced bundle,
  which `npm test` does not build.
- **Spec**: extends the `release:build` orchestrator requirement with
  a bundle-verification clause (see delta), asserting that the release
  build's output SHALL pass `scripts/verify-bundle.mjs` before the
  artifact summary prints.

### Non-goals

- **VSIX packaging.** The VSCode extension bundle has its own shape
  (`vsce package` does not include ithy-opsx templates today — the
  extension delegates to the packaged Electron flow for scaffolding).
  Adding VSIX bundle verification is deferred to `add-skill-e2e-harness`,
  which will exercise the VSCode extension's `openspec-ui.newProject`
  command end-to-end and assert scaffold reachability from that entry
  point.
- **Runtime skill invocation.** This change does NOT test that a
  scaffolded `/ithy-opsx:*` command actually runs correctly under
  Claude Code (dispatch, review, verify, merge, archive). That is
  Phase D of the comprehensive skill test plan
  (`add-skill-e2e-harness`).
- **Windows / Linux CI.** This change verifies whichever bundles the
  host build produced. Cross-OS CI matrix expansion is the scope of
  `add-windows-ci-matrix`.
- **Signing / notarization / publish.** Out of scope for
  `release:build` (per the existing "Scope of the orchestrator" spec
  scenario) and therefore out of scope here.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `release`: the "`release:build` orchestrator" requirement gains a
  bundle-verification clause. The release build's produced artifacts
  MUST pass a shape+scaffold check before the summary step prints. Not
  a new requirement; an ADDED scenario under the existing one.

## Impact

- **New script**: `scripts/verify-bundle.mjs` (~200 LoC estimate,
  plain ESM matching `release-build.mjs`).
- **Modified script**: `scripts/release-build.mjs` — one new `run(…)`
  call before the artifact summary.
- **Modified**: root `package.json` `scripts` — adds
  `"release:verify-bundle": "node scripts/verify-bundle.mjs"`.
- **Runtime**: adds ~10-30s to `release:build` (dominated by
  `npm pack` + tarball extract + one `bin/ithyno init` on a temp
  directory). Small compared to the electron-builder step it follows.
- **CI**: no `.github/workflows/release.yml` change needed — the
  workflow already invokes `release:build`, which now runs
  verification transitively.
- **No source code changes** to `bin/init.js`, `server/*`, or
  `electron/`. The script observes only; it does not modify the
  shipping surface.
- **No spec-level behavior change** for consumers: the invariants
  being asserted are already promised by the distribute-ithy-opsx
  contract. This change adds enforcement at the bundle layer, not new
  contract.
