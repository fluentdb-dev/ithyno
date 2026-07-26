## Context

The idea doc `docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`
identifies Windows as a current CI gap. Existing state:

- `.github/workflows/release.yml` — runs `release:build` on
  `[macos-latest, windows-latest, ubuntu-latest]`. Triggers on push to
  `main`, on PR, and on `workflow_dispatch`. Its scope is the release
  artifact build, not the per-commit test signal.
- No `test.yml` (or equivalent) exists. `npm test`, `npm run
  typecheck`, `npm run build`, `npm run openspec -- validate --all`
  currently have zero CI coverage on any OS. Contributors run them
  locally on their dev machine (macOS) and hope for the best.

The predecessor change `distribute-ithy-opsx-via-init-templates`
deleted `templates/.claude/` install machinery whose original
justification cited Windows-cross-platform-safety. Removing it is
only defensible if the replacement (Init scaffold via `walkTemplates`)
is proven to work on Windows — which today it is not, because Windows
never sees the test suite.

This change closes both gaps: a new per-commit workflow, with the OS
matrix that Windows regressions demand.

## Goals / Non-Goals

**Goals:**
- Every PR runs `npm test`, `npm run typecheck`, `npm run build`, and
  `npm run openspec -- validate --all` on macOS, Windows, and Linux
  before merge.
- Windows-specific regressions (path separator, line endings, HOME
  environment variable, node-pty binary) fail CI, not user bug reports.
- The Phase A tests added by `add-init-scaffold-smoke-test` (drift
  guard, init smoke, npm-pack shape) run on Windows so their
  catch-value extends across the actual OS surface.
- Shell portability: every workflow step is a single-source `bash`
  script that runs identically on Linux, macOS, and Windows git-bash.

**Non-Goals:**
- Automating the Doctor sanity manual check ("no `[install-skills]`
  line at startup"). Requires spawning the server, hitting `/api/doctor`,
  parsing its response, and asserting on the log stream — three moving
  parts too many for this change. Remains Phase C manual.
- Electron / VSCode packaged-artifact smoke on Windows — covered by
  `add-bundle-verification-script`, out of scope here.
- Cross-arch coverage (arm64 Windows, arm64 Linux). Runner availability
  is limited and cost multiplies; defer until a specific regression
  motivates it.
- Replacing or reshaping `release.yml`. That workflow is intentionally
  scoped to release-build; its matrix already covers Windows for the
  release-artifact axis.
- Node.js version matrix. Node 20 (matching `release.yml`) is the
  single target. Multi-version matrix is deferrable.

## Decisions

### D1: New file `test.yml`, do not extend `release.yml`

**Choice**: create a sibling workflow file rather than adding a
`test`-only job to `release.yml`.

**Rationale**:
- Trigger semantics differ. `release.yml` uploads artifacts and is
  gated by intent to build a release; `test.yml` should run on every
  commit including drafts and pushes to feature branches. Sharing a
  file entangles the two intents.
- Cancellation semantics differ. `release.yml` uses `concurrency:
  release-${{ github.ref }}` (cancel-in-progress). `test.yml` should
  use a distinct concurrency group so a push to a PR cancels the
  previous test run but does not cancel an in-flight release build.
- Cognitive locality. A reader hunting "why did my PR test fail"
  finds `test.yml` immediately without wading through release-artifact
  step definitions.

**Alternative considered**: fold everything into `release.yml` with
job-level `if:` guards. Rejected — the resulting file would need
per-job trigger conditions and doubled matrix definitions.

### D2: Matrix is `[macos-latest, windows-latest, ubuntu-latest]`

**Choice**: three-OS matrix from the start.

**Rationale**:
- Windows is the primary target: the entire justification for this
  change.
- Ubuntu is essentially free (fastest runner, no billing multiplier)
  and catches Linux-specific regressions cheaply. The `AppImage`
  packaging axis of `release.yml` proves the Ubuntu runner works for
  this repo already.
- macOS matches the dev-primary platform. Losing it in test would mean
  regressions land on `main` before any CI signal fires. Even if
  contributors dev on macOS, PR authors don't necessarily.

**Alternative considered**: `[windows-latest, ubuntu-latest]` and skip
macOS on the theory that dev machines cover it. Rejected — CI is the
integration signal; local dev coverage is inconsistent across
contributors.

### D3: `shell: bash` on every step

**Choice**: every `run:` block declares `shell: bash` explicitly.

**Rationale**:
- Windows runners default to PowerShell for `run:` steps. PowerShell
  syntax diverges from bash on quoting, escaping, and pipe behavior;
  a step that works on macOS/Linux breaks on Windows silently.
- git-bash ships with the `windows-latest` runner image, so `bash` is
  available without extra install steps.
- Single-source scripts are easier to review than shell-conditional
  step blocks.

**Alternative considered**: use `pwsh` uniformly. Rejected — most of
the repo's dev tooling (`bin/clean-worktrees.sh`, various scripts) is
already bash; forcing PowerShell in CI would create a second dialect.

### D4: Line-ending policy — `.gitattributes` with `* text=auto eol=lf`

**Choice**: add a repo-level `.gitattributes` file declaring
`* text=auto eol=lf` (with a `-text` exception for known-binary
patterns as needed).

**Rationale**:
- The templates drift guard uses byte-comparison. On Windows without
  an eol policy, git checkout converts LF → CRLF for text files
  matching heuristic rules, and the dev-copy vs `templates/` comparison
  breaks despite the source blobs being identical.
- `.gitattributes` is authoritative across all contributors and CI —
  it does not rely on per-machine `git config` state.
- The `add-init-scaffold-smoke-test` package-shape test also
  byte-compares tarball entries; the same eol drift would break it.

**Alternative considered**: `git config --global core.autocrlf false`
as the first workflow step on Windows. Rejected — leaves developer
Windows machines exposed to the same drift when running tests locally.
`.gitattributes` fixes both surfaces at once.

**Follow-up note**: adding `.gitattributes` may re-normalize existing
files on checkout for the first contributor on Windows. Mitigation:
document in `tasks.md` that the repo may need a one-time
`git add --renormalize .` commit landed alongside `.gitattributes`.

### D5: node-pty install policy — normal `npm ci`, no special handling

**Choice**: install node-pty through the standard `npm ci
--include=optional` path used by `release.yml`.

**Rationale**:
- node-pty ships prebuilt binaries for Windows x64. The `release.yml`
  matrix already exercises this install path on Windows without
  incident (per the workflow's continued success).
- Adding platform-conditional install steps adds complexity for a
  problem that has not surfaced.

**Fallback plan (documented, not implemented up-front)**: if the
Windows job fails at `npm ci` due to node-pty rebuild:
1. Add `npm ci --ignore-scripts --include=optional` for Windows only.
2. Introduce an `env: NODE_PTY_UNAVAILABLE=1` guard on tests that
   spawn PTY sessions; skip those tests when the flag is set.
3. Open a follow-up change to fix node-pty prebuilds properly.

The tasks file references this fallback in verification steps.

### D6: `openspec validate --all` runs on all three OSes

**Choice**: include `npm run openspec -- validate --all` in the
matrix, not as a separate one-OS job.

**Rationale**:
- The OpenSpec CLI itself is JS; running it on Windows verifies its
  own cross-platform behavior (path handling, file walking).
- Extremely cheap (~2s). No reason to conditionally skip.

### D7: `fail-fast: false`

**Choice**: matrix strategy sets `fail-fast: false`, matching
`release.yml`.

**Rationale**:
- When Windows fails, we want to see whether macOS and Linux also
  failed (regression vs Windows-specific issue) in one CI run without
  a re-run.
- Cost cost is negligible — three OSes running to completion vs
  cancelling on first failure.

## Risks / Trade-offs

- **Windows runner cost.** For public repos GitHub bills Windows
  minutes at a 2× multiplier normally, but public repos get free
  minutes. For private repos the runtime bill roughly doubles vs
  macOS-only. Trade-off: accepted; the value of catching Windows
  regressions before ship dominates.
- **node-pty prebuilt fragility.** The Windows prebuild has historically
  been the shakiest install target. Mitigation: fallback plan in D5;
  clear failure-mode taxonomy in tasks.md so a future maintainer knows
  which knob to turn.
- **Drift-guard vs eol conversion.** Addressed by D4, but requires a
  `.gitattributes` commit whose renormalization may generate a
  one-time diff. Mitigation: document the `git add --renormalize .`
  step and land it as a single-purpose commit.
- **Test flake amplification.** Adding two more OS surfaces means
  flakes can now surface from any of three environments. Mitigation:
  `fail-fast: false` and per-OS log inspection; existing tests are
  believed deterministic (Vitest with mkdtemp cleanup), but any new
  flake gets triaged with OS identified.
- **Windows shell-path edge cases.** Even with `shell: bash`, some
  npm scripts invoke `.mjs` files whose `#!/usr/bin/env node` line
  behaves differently on Windows. Mitigation: package.json scripts
  are the invocation entry, so `node scripts/foo.mjs` (not `./scripts/foo.mjs`)
  works uniformly. This change does not audit script shebangs; if
  a Windows-only failure surfaces there, it becomes a scoped follow-up.

## Migration Plan

None. Additive change:

1. Land `test.yml` — starts running immediately on new PRs.
2. Land `.gitattributes` + one-time `git add --renormalize .` commit
   as a preceding cleanup PR (or bundled with this change; tasks.md
   decides during impl).
3. No changes to `release.yml`, no changes to production code, no
   changes to existing spec contracts.
4. Rollback: `git revert` of the workflow-file commit. Restores the
   pre-change state exactly.

## Open Questions

1. Should `test.yml` also run on push to feature branches, or only on
   PR + push to `develop` / `main`? Cost-vs-fast-feedback trade-off.
   Default proposal: PR + push to `develop` / `main`; contributors can
   open a draft PR for CI signal on a feature branch. Revisit if
   friction reports.
2. Do we want `pull_request_target` for external contributor PRs (to
   grant secrets access) or is the standard `pull_request` trigger
   sufficient? Answer: `pull_request` is sufficient — this workflow
   references no secrets (mirrors the `release.yml` "No secrets"
   scenario).
3. Is `windows-latest` sufficient, or do we need `windows-2022` /
   `windows-2019` pinning? Answer: latest is fine to start; pin only
   if runner-image drift causes flakes.
