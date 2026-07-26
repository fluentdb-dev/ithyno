# Tasks

## 1. Script skeleton

- [ ] 1.1 Create `scripts/verify-bundle.mjs` with the SPDX header + shebang matching `scripts/release-build.mjs`.
- [ ] 1.2 Reuse the `here` / `repoRoot` path-resolution pattern from `release-build.mjs`; import `node:fs`, `node:path`, `node:child_process`, `node:os`.
- [ ] 1.3 Log format matches `[release:build]` peers — use `[verify-bundle] <step>` prefix so release output stays scan-friendly.
- [ ] 1.4 Top-level `try / catch / finally` for tmpdir cleanup; on catch print the failure and `process.exit(1)`.
- [ ] 1.5 Factor per-assertion helpers (`assertTarballShape`, `assertElectronBundleShape`, `runInitFromBundle`) so each check is one function call from the entry point.

## 2. npm tarball assertion

- [ ] 2.1 Create a `mkdtemp(join(tmpdir(), "verify-bundle-tarball-"))` staging dir.
- [ ] 2.2 Run `execFileSync("npm", ["pack", "--pack-destination", stagingDir], { cwd: repoRoot })` and capture the produced `.tgz` filename from the last stdout line.
- [ ] 2.3 Extract the tarball: `execFileSync("tar", ["-xzf", tgzPath, "-C", stagingDir])`. The extracted root is `<stagingDir>/package/`.
- [ ] 2.4 Walk the extracted tree recursively; collect every relative path.
- [ ] 2.5 First assertion: every path matching `/ithy-opsx/` MUST start with `package/templates/.claude/`. On failure, message names the offending path AND names `distribute-ithy-opsx-via-init-templates` as the violated contract.
- [ ] 2.6 Second assertion: no path matches `^package/\.claude/commands/ithy-opsx` or `^package/\.claude/skills/ithy-opsx-`. Same failure message style.
- [ ] 2.7 Cleanup: `rmSync(stagingDir, { recursive: true, force: true })` in the caller's `finally`. Cleanup errors log a warning but do NOT fail the script (stale tmpdirs are OS-swept).

## 3. Electron bundle assertion

- [ ] 3.1 Probe `electron/dist/` for candidate bundle roots: `mac/`, `mac-arm64/`, `mac-x64/` (each containing `ithyno.app/Contents/Resources/app/`), and `win-unpacked/resources/app/`.
- [ ] 3.2 If no candidate exists, log `[verify-bundle] no electron bundle produced — skipping bundle shape check` and continue. This keeps the check compatible with `release:build`'s host-only build path.
- [ ] 3.3 For each present bundle, walk `<app>/` recursively and apply the same "ithy-opsx paths must live under `<app>/templates/.claude/`" invariant as the tarball assertion.
- [ ] 3.4 Assert `<app>/.claude/commands/ithy-opsx/` and `<app>/.claude/skills/ithy-opsx-*/` do NOT exist (`existsSync` should return false for both patterns). On violation, message identifies which bundle (path prefix) contained the violation.
- [ ] 3.5 Log Linux AppImage as skipped with an inline note pointing at `design.md` D3, so a future contributor can find the reasoning when extending coverage.

## 4. Init-from-bundle smoke

- [ ] 4.1 Select a single bundle to exercise: prefer `mac-arm64`, else `mac-x64`, else `win-unpacked`. If none present, log skip and continue (`release:build` on a host that produced no bundle has nothing to verify at this layer).
- [ ] 4.2 Build the bundled bin path: Mac → `<bundle>/ithyno.app/Contents/Resources/app/bin/ithyno`; Win → `<bundle>/resources/app/bin/ithyno.js` invoked via bundled node (or the packaged `ithyno.exe` wrapper, whichever ships).
- [ ] 4.3 Create a `mkdtemp(join(tmpdir(), "verify-bundle-init-"))` target.
- [ ] 4.4 Shell out: `execFileSync(bundledIthynoBin, ["init", targetDir], { stdio: "inherit" })`. Non-zero exit fails the script.
- [ ] 4.5 Walk the source repo's `.claude/commands/ithy-opsx/` and each `.claude/skills/ithy-opsx-*/` — for every file, assert `<targetDir>/.claude/commands/ithy-opsx/<rel>` (or the matching skills path) exists AND is byte-identical (`readFileSync` + `Buffer.equals`).
- [ ] 4.6 Failure message names the missing/diverging path AND identifies which bundle's bin was exercised, so a reader knows whether to blame `extraResources` or `bin/init.js`.
- [ ] 4.7 Cleanup target dir in `finally`.

## 5. Release-build hook

- [ ] 5.1 Edit `scripts/release-build.mjs` — after the `run("electron package (...)")` line and before the `run("artifact summary", ...)` line, add `run("bundle verify", "node scripts/verify-bundle.mjs")`.
- [ ] 5.2 Confirm the fail-fast contract holds: if `verify-bundle.mjs` exits non-zero, `execSync` in `release-build.mjs` throws and `release:build` fails without printing the artifact summary.

## 6. npm script

- [ ] 6.1 Add `"release:verify-bundle": "node scripts/verify-bundle.mjs"` to root `package.json` `scripts`, placed adjacent to `release:build` and `release:version`.

## 7. Verification

- [ ] 7.1 `npm run openspec -- validate add-bundle-verification-script --strict` passes.
- [ ] 7.2 `npm run release:build` completes successfully against a clean checkout on the host OS, with the new `[bundle verify]` step producing green output before the artifact summary.
- [ ] 7.3 `npm run release:verify-bundle` (standalone, against the `dist/` produced by 7.2) also passes without re-running the full chain.
- [ ] 7.4 Manual regression check: temporarily add `.claude/commands/ithy-opsx` to root `package.json` `files`, run `npm run release:verify-bundle` — MUST fail with the offending tarball path AND the contract reference. Revert; MUST pass again. Do NOT commit the temporary edit.
- [ ] 7.5 Manual regression check: temporarily add `{ from: "../.claude", to: "app/.claude" }` to `electron/package.json` `extraResources`, rebuild the electron package, run `npm run release:verify-bundle` — MUST fail with the offending bundle path. Revert; MUST pass again. Do NOT commit the temporary edit.
- [ ] 7.6 Manual regression check: temporarily edit `bin/init.js` `walkTemplates` to filter out `ithy-opsx-*` skills, rebuild the electron package, run `npm run release:verify-bundle` — the init-from-bundle smoke MUST fail naming a specific missing SKILL.md path. Revert; MUST pass again. Do NOT commit the temporary edit.
- [ ] 7.7 `npm test` still passes (no test suite change; the release-only script is not invoked by test).
- [ ] 7.8 `npm run typecheck` still passes.
- [ ] 7.9 Write `openspec/changes/add-bundle-verification-script/outcome.md` capturing ✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups.
