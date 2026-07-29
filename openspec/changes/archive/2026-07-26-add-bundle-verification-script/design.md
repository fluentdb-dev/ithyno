## Context

Release-only script change. The distribute-ithy-opsx contract lives in
three artifact shapes today (npm tarball, Electron bundle, VSIX) and is
enforced end-to-end in only one of them (source-tree `npm pack --dry-run`,
covered by `add-init-scaffold-smoke-test`). This change extends
enforcement to the post-`electron-builder` bundle and the extracted
tarball on disk. VSIX enforcement is deferred to `add-skill-e2e-harness`.

Foundation piece: Phase B of
`docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`, follow-up #5
of `distribute-ithy-opsx-via-init-templates`.

## Decisions

### D1: Plain `.mjs` script, not a Vitest test

**Choice**: `scripts/verify-bundle.mjs`, ESM Node script matching
`scripts/release-build.mjs` / `scripts/release-summary.mjs`.

**Rationale**:
- Verification needs a real, produced Electron bundle. Vitest runs
  before `electron-builder`; wiring bundle verification into `npm test`
  would either force every test run to invoke electron-builder
  (~minutes, unacceptable) or make the test silently skip when no
  bundle exists (worthless).
- The release-build pipeline is already a chain of Node scripts.
  Adding one more `run(...)` call is the smallest possible change to
  the existing shape.
- `.mjs` matches the file extension already used by peer scripts,
  keeps import shape trivial (`node:fs`, `node:path`, `node:child_process`),
  and avoids a TypeScript compile step in the release chain.

**Alternative rejected**: Vitest with `beforeAll` that shells to
electron-builder — moves minutes of build cost into `npm test` and
still doesn't run in dev iteration cycles (developers skip long tests).

### D2: Hook into `release:build`, not `npm test`

**Choice**: append the verify step to `scripts/release-build.mjs` after
electron-builder and before the artifact summary.

**Rationale**: verification is meaningful only when a bundle exists.
Placing it inside the release chain means:
- Every release run verifies automatically. Maintainers cannot ship
  an unverified build.
- CI already invokes `release:build`; no `.github/workflows/release.yml`
  edit needed.
- Failure fails the release build. This matches the fail-fast contract
  of the existing chain steps.

The optional `release:verify-bundle` root script lets a maintainer
iterate on `electron-builder` config against an existing `dist/`
without re-running typecheck / test / build / package.

### D3: OS bundle detection — verify what exists, skip what doesn't

**Choice**: `verify-bundle.mjs` probes `electron/dist/` and asserts
against whichever OS bundles are present:
- Mac: `mac*/ithyno.app/Contents/Resources/app/…` (both `mac/` and
  `mac-arm64/`, since electron-builder emits per-arch bundles).
- Win: `win-unpacked/resources/app/…` (electron-builder's unpacked
  NSIS staging directory — the `.exe` installer bundles this
  same tree, and the unpacked form is walkable without running the
  installer).
- Linux: **skipped**. AppImage is a compressed FUSE-mounted image;
  extraction requires either `--appimage-extract` (spawns a mount) or
  `unsquashfs`. Adding that dependency to the release pipeline is
  disproportionate to the coverage gain, given `mac-unpacked` and
  `win-unpacked` share the same `Resources/app/` shape derived from
  the same `extraResources` config. Note this limit inline in the
  script and reference this decision.

**Rationale**: on a Mac maintainer machine the host build only
produces `mac*/…`; on the CI matrix each OS runner produces its own
bundle. Skipping "no bundle → skip verification" (with a log line)
rather than "no bundle → fail" avoids false negatives on the
single-OS host-build path used by `scripts/release-build.mjs` today
(which builds only for the host platform per the existing `platform`
switch).

**Alternative rejected**: require all three bundles present — would
force every local `release:build` to build all three OSes, breaking
the current single-OS design of `release-build.mjs`.

### D4: `npm pack` on repo root, extract into tmpdir

**Choice**: verify script runs `npm pack --pack-destination <tmp>` on
`repoRoot`, then `tar -xzf` the resulting `.tgz` into the same tmpdir,
walks the `package/` subtree.

**Rationale**: exercises the exact bytes a `npm install ithyno` user
receives, distinct from the source-tree `--dry-run --json` check that
covers the file *list*. Catches regressions where the tarball content
diverges from the metadata (rare but has happened historically with
`.npmignore` interactions).

Cleanup uses `rm -rf <tmp>` in a `finally` block. If cleanup fails the
script logs a warning but does not fail — the OS tmpdir is
self-cleaning at reboot and a stale directory does not break the
next run (each invocation uses a fresh `mkdtemp`).

### D5: Init-from-bundle smoke — one bundle, not all

**Choice**: exercise the bundled bin on exactly one Electron bundle
(prefer Mac `arm64` if present, else `mac-x64`, else `win-unpacked`).

**Rationale**: the smoke's failure modes (bundled `bin/ithyno` fails
to resolve `templates/`, `walkTemplates` output shape wrong post-package,
node runtime signature mismatch) are OS-independent — they surface on
whichever bundle we exercise. Running the same smoke against multiple
bundles quadruples runtime for negligible signal. If a future
cross-OS regression is suspected, the CI matrix will already run
`release:build` on each OS, so each OS's runner exercises its own
bundle's bin.

## Risks / Trade-offs

- **Tarball extraction cleanup on catastrophic failure** → `rm -rf <tmp>`
  in `finally` handles the normal case. Process kill (Ctrl-C) leaves a
  `verify-bundle-XXXX` directory in `$TMPDIR`. Mitigated by using
  `mkdtemp` with a distinctive prefix so stale dirs are grep-able and
  by OS-level tmpdir sweep. No hard guarantee; accepted.
- **npm-pack runtime variance** → typically 3-5s locally; can spike on
  slow CI runners. Given release:build already tolerates minutes of
  electron-builder time, +5s is negligible.
- **Electron-builder path changes across versions** → the
  `Resources/app/` layout is stable across electron-builder 24-26
  (verified via docs and the current 25.1.8 output). A future major
  version could shift paths. Mitigation: probe with `existsSync` and
  log the actual `dist/` tree contents on assertion failure, so a
  version-bump reviewer sees the shape mismatch immediately.
- **Bundled `bin/ithyno init` writes to tmpdir** → the smoke creates a
  fresh empty dir via `mkdtemp` with autoGitInit disabled where
  possible (to avoid needing `git` on the CI verification host if it
  lacks it — unlikely but defensive). Rolled back via `rm -rf` in
  `finally`.

## Migration Plan

None. Additive script + release-build hook. Rolling back is `git
revert` of the impl commit; the release build reverts to the prior
non-verifying shape.

## Open Questions

None blocking. Two possible future extensions logged inline in
`tasks.md` for follow-up rather than gating this change:
- Do we want `release:verify-bundle` to accept a `--os=mac|win|linux`
  flag to force checking a specific bundle? Not needed today; add if
  CI matrix behavior demands it.
- Should Linux AppImage extraction be added if the Linux CI runner
  starts catching regressions the Mac / Win runners miss? Defer until
  we have data.
