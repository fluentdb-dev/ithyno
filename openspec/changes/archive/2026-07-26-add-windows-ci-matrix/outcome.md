# Outcome — add-windows-ci-matrix

Landed 2026-07-26 as Phase C of the
`2026-07-26-comprehensive-skill-test-plan` idea. Closes the CI gap
identified by `distribute-ithy-opsx-via-init-templates` (deleted
user-global install machinery whose Windows-safety justification was
never independently verified) by adding a per-commit three-OS test
matrix (`macos-latest`, `windows-latest`, `ubuntu-latest`) that runs
`npm ci --include=optional` → `npm run typecheck` → `npm test` →
`npm run build` → `npm run openspec -- validate --all` on every PR
and every push to `develop` / `main`.

## ✅ Worked

- **Two-file change, zero source edits.** The whole delivery is one
  `.github/workflows/test.yml` (55 lines) plus one `.gitattributes`
  (24 lines). No production code was touched, no tests were edited.
  The path-separator audit (task 3.1) returned zero hits — existing
  tests already use `path.join()` uniformly, which is unsurprising in
  hindsight but had to be verified.
- **`.gitattributes` renormalize was a no-op on macOS.** Running
  `git add --renormalize .` after landing the attributes file produced
  zero staged changes — the working tree was already LF-clean. This
  means the change lands as two artifacts (workflow + attributes) with
  no third "renormalize" commit needed. Windows contributors on first
  checkout may still see a one-time normalize diff; if so, land a
  scoped follow-up commit from a Windows or Linux box.
- **`defaults.run.shell: bash` at the job level** kept the workflow
  ~15 lines shorter than per-step `shell: bash` would have. Every
  step is a single-source bash script; there are no
  `if: matrix.os == 'windows-latest'` conditional branches to
  maintain, satisfying design.md D3 with the minimum surface area.
- **YAML parses cleanly** through the `yaml` package that vitest
  already depends on (used as the pre-commit lint gate).
- **Distinct concurrency group** (`test-${{ github.ref }}` vs
  `release-${{ github.ref }}`) means a push to `main` will run
  `test.yml` and `release.yml` in parallel on the same commit without
  either cancelling the other — matching design.md D1 and the
  spec.md "push to main" scenario.

## ⚠️ Surprises

- **Cannot actually validate the workflow file's runtime behavior
  from a worktree.** The `yaml.parse` check confirms syntactic
  validity; but "does the matrix actually spin up three runners"
  and "does the Windows job actually pass" are questions only a real
  GitHub Actions push can answer. The first PR against `develop`
  after merge is the primary correctness signal. Documented as tasks
  4.5 / 5.x deferrals.
- **Pre-existing `sharp` failure in `scripts/build-icons.test.mjs`.**
  Test node 25.8.1 on this machine cannot resolve the `sharp`
  package. This is an environment issue (host Node version mismatch,
  not this change's scope). CI uses Node 20 pinned via
  `actions/setup-node@v4` so this specific failure will NOT reproduce
  on the CI runners. Accepted per task instructions.

## 🔁 Do Differently

- Nothing structural — this change is deliberately minimal. If a
  future maintainer needs a Node-version matrix or arm64 coverage,
  that is a separate proposal (per non-goals 6.3 / 6.4).
- If the first real Windows CI run reveals node-pty install
  fragility, the D5 fallback plan is spelled out in tasks 5.1 for
  the next agent to execute. That is the deliberate risk-shift of
  "don't add conditional install steps until a concrete failure
  motivates them."

## 🌱 Follow-ups

1. **First Windows CI green run.** Task 4.5 defers to the manager /
   next PR. Update this outcome (or open a small "windows CI green"
   commit) once verified.
2. **`fix-node-pty-windows-prebuild`** — only if task 5.1 fails on
   the first real Windows run. Design.md D5 outlines the exact
   sequence: `--ignore-scripts` install + `NODE_PTY_UNAVAILABLE=1`
   env + skip pty-touching tests + follow-up change to fix prebuilds
   properly.
3. **One-time Windows renormalize commit.** If a Windows contributor
   sees a staged diff on first checkout after `.gitattributes` lands
   (task 2.3 renormalize was a no-op on macOS but may not be on
   Windows), land a `git add --renormalize .` commit from their
   machine.
4. **Node-version matrix / arm64 runners.** Defer until motivated by
   a concrete regression (per non-goals). The `os` matrix is the
   right first cut.
5. **Automate the Doctor `[install-skills]` sanity check** (Phase D+
   territory). Requires spawning the server in CI and asserting on
   its log stream — out of scope here, tracked as a Phase C manual
   check.
