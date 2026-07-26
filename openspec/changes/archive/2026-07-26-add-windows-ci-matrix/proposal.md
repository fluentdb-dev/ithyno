---
tags: [ci, github-actions, windows, cross-platform, matrix, testing]
execution: worktree
---

## Why

`distribute-ithy-opsx-via-init-templates` deleted the user-global install
machinery that had explicit Windows-safety concerns (`os.homedir()`,
cross-platform `copyFile`), and delegated all `/ithy-opsx:*` shipping to
`bin/init.js::walkTemplates` scaffolding into the target project's
`.claude/`. That deletion is only safe if we can prove the replacement runs
uniformly on Windows.

Today, the only CI on Windows is `release.yml` — it runs `release:build`
per push to `main` and per PR, but the *primary* per-commit signal
(`npm test`, `npm run typecheck`, `npm run build`, `npm run openspec --
validate --all`) has no dedicated workflow on any OS. Every Windows-
specific regression — `HOME` → `USERPROFILE` divergence, `path.sep`
assumptions (`\` vs `/`), node-pty prebuilt architecture mismatch,
`%APPDATA%` vs `~/.claude` resolution in Manager PTY skill lookup, CRLF
vs LF byte drift breaking the template drift guard — only surfaces when
a Windows user files a bug post-release, if at all.

The idea doc
[`docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`](../../../docs/ideas/2026-07-26-comprehensive-skill-test-plan.md)
lists Windows as a current gap ("no Windows CI runner. GitHub Actions
matrix currently macOS-only") in the recommended implementation order
step 3. Phase A tests (drift guard, init smoke, npm-pack shape) added by
`add-init-scaffold-smoke-test`, and Phase B tests (bundle verification)
added by `add-bundle-verification-script`, both derive their catch-value
from running across the actual OS surface — a passing macOS-only run
proves nothing about Windows behavior.

## What Changes

- **New**: `.github/workflows/test.yml` (name TBD during impl) — a
  per-commit workflow, distinct from `release.yml`. Triggers on
  `pull_request` and on `push` to `develop` and `main`.
- **Matrix**: `strategy.matrix.os: [macos-latest, windows-latest,
  ubuntu-latest]` with `fail-fast: false`. All three OSes run:
  `npm ci --include=optional`, `npm run typecheck`, `npm test`,
  `npm run build`, `npm run openspec -- validate --all`.
- **Shell normalization**: every `run:` step declares `shell: bash`
  explicitly so Windows uses git-bash (bundled with the runner image)
  rather than PowerShell. Keeps step scripts portable and single-source.
- **Line-ending safety**: either `git config --global core.autocrlf false`
  as the first step on Windows, OR add a repo-level `.gitattributes`
  with `* text=auto eol=lf`. Design.md picks. Without this, the
  templates drift guard (byte-comparison) fails on Windows checkout
  because `.md` and `.yml` files get CRLF converted.
- **node-pty install policy**: the workflow SHALL install node-pty via
  its normal `npm ci` path so the Windows prebuilt binary resolves;
  if that install fails on the Windows runner, tasks include a
  documented follow-up to gate node-pty-touching tests behind an
  environment flag (rather than skipping the entire Windows job).
- **Path assertions in tests**: `tasks.md` includes an audit pass over
  existing tests for hard-coded `/` separators, replacing with
  `path.sep` / `path.join`. This is an in-scope fixup for regressions
  the new matrix will surface; it is NOT a proactive refactor.
- **Non-goals**:
  - Automating the Doctor sanity manual check ("no `[install-skills]`
    line at startup") — requires spawning the server in CI, which is
    scope creep. Remains a Phase C manual check.
  - Adding an Electron / VSCode packaged-artifact smoke on Windows —
    that is `add-bundle-verification-script` territory; this change
    only covers per-commit test flows.
  - Ubuntu-specific integration coverage (Wayland, AppImage runtime).
    Ubuntu is added for cheap smoke breadth, not depth.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `build-system`: adds one new requirement — a per-commit CI workflow
  that runs the test-suite matrix across macOS, Windows, and Linux.
  This is pure ADDED (no existing per-commit CI requirement to modify).
  The existing `release` capability's `Reproducibility CI workflow`
  requirement is untouched — that governs `release:build` matrix
  behavior, which is orthogonal.

## Impact

- **Workflow files added**: 1 (`.github/workflows/test.yml`).
- **Workflow files modified**: 0 (`release.yml` remains as-is).
- **Source code changes**: potentially small — audit for hard-coded
  path separators may edit ~1-3 tests. No production code edits
  expected.
- **Runner cost**: Windows minutes are billed at 2× the macOS rate on
  GitHub-hosted runners for public repos, effectively free (0-multiplier
  for public); for private repos, ~2× a macOS test job. Design.md
  notes this as an accepted trade-off.
- **Wall-clock time to green PR**: adds ~5-8 minutes on the slowest OS
  (Windows) as the critical path; `fail-fast: false` lets the mac /
  linux jobs finish independently.
- **No spec-level behavior change to the app itself.** This change adds
  test-infrastructure coverage; the app's contract is unchanged.
