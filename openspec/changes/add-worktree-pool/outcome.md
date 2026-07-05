# Outcome — add-worktree-pool

## ✅ Worked

- Opt-in gate as a single flag (`dedicated: false` on the agent
  entry) held up. Every unmodified `agents.yaml` runs the byte-
  identical pre-Phase-1 dedicated path — the runner branches
  cleanly at the top of `run()`.
- Branch-name as change-id metadata paid off on the first
  `adoptExisting()` test: leased vs free is a single
  `git branch --show-current` check, no meta files, no fragile
  path scans. Restart recovery falls out for free.
- Default-branch resolution cached-on-first-use worked
  identically in tests (`main` fallback) and would work with
  `git symbolic-ref refs/remotes/origin/HEAD` for a repo with a
  proper origin. The `_setDefaultBranchForTest` escape hatch
  kept the integration tests fast (no need to set up an origin
  remote in each test repo).
- Reuse-existing-branch path validated end-to-end: a
  same-change second acquire finds the prior commits intact.
  This is the intended flow for "user Discards, re-Starts the
  same change" — the branch preserves the aborted work.
- Branch-straddling refusal surfaces git's own error to the
  caller instead of us re-implementing "is this branch busy?"
  logic. Newly-created worktree gets cleaned up on failure so
  a dangling `pool-N` doesn't accumulate.

## ⚠️ Surprises

- **`startWorktreeProgressWatcher` hardcoded the worktree path.**
  The pre-pool signature took `projectRoot + changeId` and
  computed the path as `projectRoot/.worktrees/<changeId>`. Pool
  worktrees at `.worktrees/<prefix>-N/` broke that assumption.
  Fixed by adding an optional `worktreePath` override and
  defaulting to the old computation for the dedicated path.
  Change was purely additive, no callers except runner.ts need
  to know.
- **AgentDef stricter type broke `registry-initial-input.test.ts`
  again**, this time for `dedicated`. Same as the last change —
  test literal maintenance. Filed the same "if you add a
  required AgentDef field, update every construction site"
  observation twice now; worth capturing as an ADR later if the
  pattern keeps biting.
- **`git worktree add ... --detach`** creates the worktree at
  a detached HEAD by default, but the returned worktree isn't
  actually detached in some git versions on macOS — I saw the
  worktree land on a branch name that matched the current
  branch of the parent repo (`phase-multi-agent`). Then the
  `git checkout -b agent/<id>` complained the branch existed
  because git had "reused" phase-multi-agent's tip. Confusing
  behavior; worked around by explicit `--detach` on the
  `git worktree add`. Worth staying alert to on Linux and older
  git binaries.

## 🔁 Differently

- Nothing on the pool module design would land differently.
- **Runner integration would benefit from a small helper** to
  register an orphan job (the dedicated and pool orphan paths
  in `adoptOrphanWorktrees()` are ~50 lines of near-duplicate).
  Deliberately left duplicated for Phase 1 to keep the diff
  small; a follow-up refactor (`extractOrphanRegistrationFn`)
  can consolidate.
- **Pool config hot-reload** on `agents.yaml` change is not
  wired up — the runner captures pool config at construction
  time. If a user edits `worktreePool.max` at runtime the pool
  won't notice. Acceptable for Phase 1; document as follow-up.

## 🌱 Follow-ups

- **Discard UX for pool jobs.** The current Kanban Discard
  button emits `git worktree remove --force <path> && git
  branch -D <branch>`. For a pool worktree, removing the
  worktree destroys the pool slot — the pool doesn't watch for
  that (its next `acquire()` might try to reuse the slot and
  fail on the missing directory). Phase 1 doesn't fix this;
  the dispatcher phase should route Discard through
  `pool.release()` + `git branch -D` instead of raw
  `worktree remove`.
- **Pool visualization in the UI.** The pool's `snapshot()`
  method exposes slot table; a roster panel could display
  "pool-1: leased to add-foo, pool-2: free" without any new
  data plumbing.
- **`idleReleaseAfter` reaper.** Deferred with the dispatcher.
  Once a user has enough live pool jobs to see idle worktrees
  accumulate, this becomes worth building.
- **`reset-to-main` and `recreate` cleanup modes.** Deferred
  until `git-clean` proves insufficient. `git-clean` retains
  ignored `node_modules/` — the whole point of the pool — so
  hard-reset variants are only useful when a dep bump requires
  a fresh install.
- **Hot-reload of pool config on agents.yaml change.** See
  the note above.
