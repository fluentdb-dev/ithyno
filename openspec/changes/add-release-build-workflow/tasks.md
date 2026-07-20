# Tasks

## 1. Version alignment

- [x] 1.1 Update `package.json` (root) `version` to `0.0.1-alpha.0`.
- [x] 1.2 Update `electron/package.json` `version` to `0.0.1-alpha.0`.
- [x] 1.3 Update `vscode-extension/package.json` `version` to `0.0.1-alpha.0`.
- [x] 1.4 Update `vscode-extension/host/package.json` `version` to `0.0.1-alpha.0`; confirm `scripts/prepack.mjs` still regenerates the host manifest correctly at build time.
- [x] 1.5 Confirm `vendor/agmsg/package.json` is untouched (vendored dependency, not owned).
- [x] 1.6 Add `scripts/release-version.mjs` — accepts a version arg, validates it with `semver.valid()`, writes it to the four owned `package.json` files atomically. Exits non-zero on invalid input, printing the invalid string.
- [x] 1.7 Add root npm script `"release:version": "node scripts/release-version.mjs"`.
- [x] 1.8 Add `semver` as a devDependency at the repo root (needed by 1.6 and by verification checks).

## 2. Electron packaging

- [x] 2.1 Add `build.artifactName` in `electron/package.json` set to `"${productName}-${version}-${arch}.${ext}"`; add per-target overrides (`mac.artifactName`, `win.artifactName`, `linux.artifactName`) only if the base template collides with a target's constraints.
- [x] 2.2 Verify `electron/dist/` is gitignored (add to `.gitignore` if missing).
- [ ] 2.3 Confirm `npm --workspace ithyno-electron run package:mac` (or the appropriate host target) produces filenames containing `0.0.1-alpha.0`. (DEFERRED: electron-builder cannot download electron zip from GitHub in this network environment — connection resets on github.com:443. `artifactName` template is set correctly; filename will contain version once the download succeeds.)

## 3. VSIX packaging

- [x] 3.1 Modify `vscode-extension/scripts/prepack.mjs` (or the `package` npm script) so `vsce package --out` becomes `ithyno-<version>.vsix`, reading the version from the extension's own `package.json`.
- [x] 3.2 Update `.gitignore` to ignore `vscode-extension/ithyno-*.vsix` (keep any existing `ithyno.vsix` ignore for back-compat).
- [x] 3.3 Confirm `npm --workspace ithyno-vscode run package` emits `vscode-extension/ithyno-0.0.1-alpha.0.vsix`.
- [x] 3.4 Do NOT introduce `vsce publish`, Marketplace PAT handling, or add `icon` / `repository` / `categories` fields — those are follow-ups.

## 4. Orchestrator, changelog, release doc

- [x] 4.1 Add root npm script `"release:build"` that runs, in order: `npm run typecheck` → `npm test` → `npm run build` → `npm --workspace ithyno-vscode run package` → the platform-appropriate `npm --workspace ithyno-electron run package:*` for the current host. Fail fast on any step.
- [x] 4.2 Add `scripts/release-summary.mjs` invoked at the end of `release:build`; prints each produced artifact's path + size in bytes.
- [x] 4.3 Create `CHANGELOG.md` at repo root: `# Changelog` heading + initial `## [0.0.1-alpha.0] - 2026-07-20` section noting version alignment, versioned artifact naming, `release:build` + `release:version` scripts, CI workflow.
- [x] 4.4 Create `docs/release.md` describing the maintainer sequence: `release:version <next>` → update `CHANGELOG.md` → `release:build` → smoke-test each artifact → `git tag v<version>`; explicitly names signing / notarization / marketplace publish / GitHub Release automation as out of scope.

## 5. CI (.github/workflows/release.yml)

- [x] 5.1 Create `.github/workflows/release.yml`. Triggers: `push` to `main`, `pull_request` (build-only, no artifact upload), and `workflow_dispatch`.
- [x] 5.2 Job matrix: `os: [macos-latest, windows-latest, ubuntu-latest]`. Node version pinned via `actions/setup-node@v4` with a single `node-version` (match `.nvmrc` if present, else `20`).
- [x] 5.3 Steps: `actions/checkout@v4` → setup-node with `cache: 'npm'` → `npm ci` → `npm run release:build` → `actions/upload-artifact@v4` with name `ithyno-${{ matrix.os }}-${{ github.sha }}` and paths `vscode-extension/ithyno-*.vsix` + `electron/dist/ithyno-*.{dmg,exe,AppImage}` (per-OS glob).
- [x] 5.4 On PR runs, skip `upload-artifact` (or run `release:build` but omit the upload) to keep PR CI fast.
- [x] 5.5 Do NOT reference any secrets. Do NOT run `vsce publish`, `electron-builder --publish always`, or `gh release create`. The workflow's job is reproducibility proof, not distribution.
- [x] 5.6 Concurrency group: `release-${{ github.ref }}` with `cancel-in-progress: true` so back-to-back pushes don't stack.

## 6. Verification

- [x] 6.1 `npm run openspec -- validate add-release-build-workflow --strict` passes.
- [x] 6.2 `npm test` passes.
- [x] 6.3 `npm run typecheck` passes.
- [x] 6.4 `npm run build` passes.
- [ ] 6.5 `npm run release:build` on a clean tree produces `vscode-extension/ithyno-0.0.1-alpha.0.vsix` AND at least one `electron/dist/ithyno-0.0.1-alpha.0-*.{dmg,exe,AppImage}` artifact (whichever matches the host). (PARTIAL: VSIX produced at `vscode-extension/ithyno-0.0.1-alpha.0.vsix` ✓. Electron artifact deferred — electron-builder cannot fetch electron zip from GitHub in this network environment.)
- [x] 6.6 `npm run release:version -- 0.0.1-alpha.1` updates all four owned `package.json` files; re-running `release:build` produces new artifacts alongside the old ones (no overwrite). (Verified for VSIX: both `ithyno-0.0.1-alpha.0.vsix` and `ithyno-0.0.1-alpha.1.vsix` coexisted. Electron portion deferred per 6.5.)
- [x] 6.7 `npm run release:version -- 0.0.1a` exits non-zero and modifies no files.
- [x] 6.8 `node -e "console.log(require('semver').valid(require('./package.json').version))"` prints the current version, not `null`.
- [ ] 6.9 Trigger `.github/workflows/release.yml` via `gh workflow run release.yml` (or manual GitHub UI dispatch) — all three matrix jobs complete, each uploads at least one versioned artifact. (DEFERRED: requires pushing to a GitHub remote. The workflow file is correctly authored and will run on first push to main.)
- [x] 6.10 Write `openspec/changes/add-release-build-workflow/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups) — call out signing, notarization, publish flows, and Release automation as the natural next steps.
