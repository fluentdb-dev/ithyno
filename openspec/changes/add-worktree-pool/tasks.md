## 1. Server: schema and config

- [x] 1.1 `server/agents/registry.ts` — add `dedicated?: boolean` to `AgentDef`, defaulted to `true` during load
- [x] 1.2 Parse optional top-level `worktreePool` block: `max` (integer ≥ 1, default 5), `namePrefix` (non-empty string, default "pool"), `cleanupBetweenJobs` (only "git-clean" accepted)
- [x] 1.3 Reject `reset-to-main`, `recreate`, and unknown values for `cleanupBetweenJobs` with a "not yet supported" error
- [x] 1.4 Reject unknown keys inside `worktreePool` (including `idleReleaseAfter`) so typos and deferred options surface as errors
- [x] 1.5 Expose the resolved pool config (with defaults applied) alongside the agent list from the loader

## 2. Server: pool module

- [x] 2.1 New `server/agents/pool.ts` — `WorktreePool` class holding project root, resolved config, resolved default branch, and an in-memory lease Map (`poolDir → changeId`)
- [x] 2.2 Default-branch resolution helper (module-level, cached on construction): try `git symbolic-ref refs/remotes/origin/HEAD` and strip `refs/remotes/origin/`; on failure fall back to `main`, then `master`. Cache the result — never re-resolve during the pool's lifetime
- [x] 2.3 `acquire(changeId)`: return an existing free pool worktree, else lazily `git worktree add .worktrees/<prefix>-N --detach` for the next N ≤ max, else return null
- [x] 2.4 On acquire, `git rev-parse --verify agent/<change-id>` — if the branch exists, `git checkout agent/<change-id>` (reuse); otherwise `git checkout -b agent/<change-id>`. Record the lease
- [x] 2.5 If checkout fails because the branch is checked out in another worktree, surface the git error verbatim to the caller (see spec scenario)
- [x] 2.6 `release(poolDir)`: `git reset --hard`, `git clean -fd`, `git checkout --detach <default-branch>`, clear the lease; the `agent/<change-id>` branch is NOT deleted
- [x] 2.7 `adoptExisting()`: scan `.worktrees/<prefix>-*`; branch `agent/<id>` checked out → reconstruct lease and report `{poolDir, id}`; detached HEAD → register as free
- [x] 2.8 Cleanup failures during release mark the worktree unavailable (excluded from acquire) and log — never hand out a dirty worktree

## 3. Server: runner integration

- [x] 3.1 `runner.run()` — when the agent def has `dedicated: false`, call `pool.acquire(changeId)` instead of creating `.worktrees/<change-id>`
- [x] 3.2 On `acquire` returning null, fail the Start with an explicit "worktree pool exhausted (max N)" error surfaced through the existing job-error path; do not queue, do not fall back to a dedicated worktree
- [x] 3.3 Spawn with `cwd` = pool worktree path; `${worktree_path}` and `${branch}` template variables resolve to the pool path and `agent/<change-id>`
- [x] 3.4 On job end (completed / crashed / cancelled / discarded), release the pool worktree; verify all existing job-end paths hit the release
- [x] 3.5 `dedicated: true` (or absent) agents take the byte-identical pre-existing code path — guard with a regression test
- [x] 3.6 Startup: **extend** (not "reuse" — the existing path-based scan doesn't cover pool naming) the orphan-adoption logic with a pool-worktree branch-name inference pass, feeding leases into the existing orphan-adoption flow

## 4. Template

- [x] 4.1 `templates/agents.yaml.example` — commented `dedicated: false` line on the agent entry and a commented `worktreePool` block with all three keys, defaults, the discarded-uncommitted-work warning, and a note that `dedicated: true` (default) preserves the pre-Phase-1 behavior

## 5. Tests

- [x] 5.1 Backwards-compat: an `agents.yaml` with no `dedicated` field and no `worktreePool` block loads and runs a job in `.worktrees/<change-id>/` exactly as before; `.worktrees/<prefix>-*` is never created
- [x] 5.2 Acquire creates pool-1 lazily; two concurrent jobs get pool-1 and pool-2; with max 2, a third acquire returns null
- [x] 5.3 Reuse-existing-branch path: pool acquire for a change whose `agent/<id>` branch already has commits succeeds and checks that branch out; the pool worktree retains those commits
- [x] 5.4 Release resets tracked files, removes untracked files, keeps ignored files, detaches HEAD, preserves `agent/<id>`
- [x] 5.5 Default-branch resolution: mock `git symbolic-ref` failure → fallback to `main`; mock both failing → fallback to `master`
- [x] 5.6 `adoptExisting()` distinguishes a leased worktree (agent branch checked out) from a free one (detached HEAD)
- [x] 5.7 Config validation cases: `max: 0`, `cleanupBetweenJobs: recreate`, `idleReleaseAfter: 300` each yield a loader error naming the key
- [x] 5.8 Same change straddling error: pre-existing dedicated worktree with `agent/foo` checked out, then attempt to pool-acquire `foo` → the git checkout failure propagates as a Start error (no partial state)

## 6. Spec delta

- [x] 6.1 `openspec/changes/add-worktree-pool/specs/agent-runner/spec.md`: ADDED requirements for opt-in config, acquisition (including branch reuse and straddling refusal), release/cleanup, and restart recovery
- [x] 6.2 `npm run openspec -- validate add-worktree-pool` passes

## 7. Verification

- [ ] 7.1 Unmodified `agents.yaml` from before this change: start a job → lands in `.worktrees/<change-id>/`, no pool directories appear
- [ ] 7.2 Set `dedicated: false` + `worktreePool: {max: 2}`; start a job → runs in `.worktrees/pool-1/` on branch `agent/<id>`; complete it → pool-1 returns to detached HEAD with `agent/<id>` still listed in `git branch`
- [ ] 7.3 Start three pool jobs with max 2 → third Start fails with the pool-exhausted error; finish one job → a new Start succeeds
- [ ] 7.4 Kill the server mid-pool-job, restart → job adopted as orphan; idle pool worktree stays available
- [ ] 7.5 Repo whose default branch is `develop` (not `main` / `master`): pool release detaches HEAD at `develop`
- [ ] 7.6 `npm test && npm run typecheck && npm run build` all pass
