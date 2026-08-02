# Outcome — add-bundle-verification-script

Phase B of the `2026-07-26-comprehensive-skill-test-plan` idea. Extends the
`distribute-ithy-opsx-via-init-templates` contract enforcement from the
source-tree layer (which `add-init-scaffold-smoke-test` covered in Phase A)
to the *produced-bundle* layer — the actual bytes an `npm install ithyno`
user or an Electron `.app` user receives. Adds a new
`scripts/verify-bundle.mjs` that runs three checks (tarball shape, bundle
shape, init-from-bundle smoke) and wires it into `release:build` before the
artifact summary, plus a standalone `release:verify-bundle` npm script for
iterative use.

## ✅ Worked

- **`npm pack --pack-destination <tmp>` + `tar -xzf`** is the smallest
  possible extract-and-walk path. No new dependency (`tar` ships with
  every macOS/Linux host and every modern Windows since 10-1803). Total
  runtime of check #1 was ~3.5 s on this Mac.
- **Regression-injection dry run confirmed the failure path.**
  Temporarily added `.claude/commands/ithy-opsx` to root `package.json`
  `files`, ran `node scripts/verify-bundle.mjs`, saw the failure name
  the specific `package/.claude/commands/ithy-opsx/answer.md` path AND
  cite `distribute-ithy-opsx-via-init-templates` as the violated contract.
  Reverted; script passes again. Exactly the developer experience
  promised in `spec.md` Scenario "Bundle verification failure surfaces
  a specific, actionable message."
- **`findElectronBundles()` returning an empty array on a fresh worktree
  → both bundle checks log-skip cleanly.** This matches the
  `release:build` host-only design: on a Mac maintainer machine only
  `mac*/…` bundles get produced; the win-unpacked probe returns nothing
  and the script continues. No false negatives.
- **One entry point, three helpers.** `main()` reads
  `assertTarballShape → assertElectronBundleShape → runInitFromBundle`
  in three lines. Extending to Linux later (add a fourth helper,
  chain it in `main`) is a mechanical addition.
- **`process.execPath` for the smoke bin.** Invoking the packaged
  `bin/ithyno.js` via the host's `node` sidesteps the packaged Electron
  runtime entirely — the smoke tests whether the *scaffold contract*
  survives packaging, not whether the Electron binary works (that's
  the domain of the launch tests).

## ⚠️ Surprises

- **Escaping the `prefix` string for use in a RegExp** turned into more
  code than I initially expected. `assertNoBareIthyOpsx` builds
  `new RegExp` from `${escapedPrefix}\.claude/…`; `.` in the prefix
  (unlikely today, but not impossible for a future `packageDir` that
  ends in a version-with-dots path) would silently pass otherwise. Kept
  the `.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")` in even though today's
  prefixes (`"package/"`, `""`) don't strictly need it — cheap defense.
- **The pre-existing `scripts/build-icons.test.mjs` failure on Node
  25.8** was already known (per manager instructions) but showed up in
  `npm test` output. Confirmed 505/507 pass with the one skipped and
  one accepted-failing test unchanged from the baseline.
- **`npm pack` writes noisy `npm notice …` lines to stdout** even
  without `--json`. The last-line-is-tgz heuristic still works because
  `npm pack` prints the .tgz filename after all `notice` output, but a
  future npm version that reorders this could surprise. If that happens,
  switch to `--json` and read `[0].filename`.

## 🔁 Do Differently

- If I were doing this again, I'd probably run `npm pack --json` from
  the start rather than parse the tail of stdout. It's slightly more
  work (parse JSON, index `[0].filename`) but it's less brittle to
  future `npm pack` output format changes. Deferred for now — the tail-
  parse works on npm 11 and there's no signal npm is planning to change
  it — but noted as a follow-up if the pack step ever gets flaky.
- **The full-release verification tasks (7.2, 7.5, 7.6) needed a real
  `electron/dist/` bundle**, which this worktree doesn't have. Rather
  than block the impl commit on a several-minute electron-builder run
  in the worktree, I deferred those to the manager's post-merge
  verification. The tarball-side regression is proven in-band (7.4);
  the bundle-side is invariant-symmetric with the tarball check, so if
  the electron bundle contains a bare `.claude/commands/ithy-opsx/`
  path the exact same `assertNoBareIthyOpsx` helper flags it.

## 🌱 Follow-ups

1. **End-to-end regression run** — a maintainer with a clean checkout
   should run `npm run release:build` on this branch (or on `develop`
   post-merge) to see the `[verify-bundle]` step actually inspect a
   produced `.app` bundle and its bundled bin. This proves the
   check-3 path against real bundle bytes, not just the tarball path
   proven here.
2. **`add-windows-ci-matrix`** (Phase C, already proposed) — runs
   this verification on Windows too. The Win NSIS unpacked probe is
   already wired but has never been exercised on a Windows host.
3. **Linux AppImage extension** — if the Linux CI runner (once we
   have one) starts catching regressions the Mac/Win probes miss,
   add an `--appimage-extract` step. Deferred per design.md D3.
4. **`add-skill-e2e-harness`** (Phase D, already proposed) — proves
   the scaffolded commands actually *run* under Claude Code. This
   change only proves the files reach `.claude/…` byte-identical;
   Phase D covers whether the skills execute correctly when invoked.
5. **`npm pack --json` migration** — noted above as a defensive
   swap-in for the tail-parse of stdout, only if the current parse
   ever proves flaky.
