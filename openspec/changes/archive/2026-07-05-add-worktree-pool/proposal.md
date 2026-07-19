---
tags: [feature/worktree, feature/agents, area/server]
---

> **REVERTED** by [revert-worktree-pool](../../changes/revert-worktree-pool/) — runtime-collapse pivot 方針で pool 撤廃、agent は常に dedicated worktree で spawn する初期形に戻す。4 requirements 全 REMOVE。

## Why

Today every job gets a fresh `.worktrees/<change-id>/` worktree: a full
checkout plus (for real projects) a dependency install per change. A
bounded pool of reusable worktrees (`.worktrees/pool-1/` … `pool-N/`)
amortizes that cost across changes and gives the future dispatcher a
fixed set of execution slots to lease. Phase 1 lands the pool as opt-in
infrastructure: config, acquire/release with cleanup, and restart
recovery. Users who do nothing see zero behavior change.

**Sequencing note**: this change is Phase 1 of the multi-agent redesign
sketched in `docs/ideas/2026-07-04-agent-roles-and-worktree-pool.md`. It
ships alongside `add-agent-role-field`. Both touch
`server/agents/registry.ts` and `templates/agents.yaml.example`, so they
cannot be implemented in parallel worktrees — implement
`add-agent-role-field` first, then rebase this change onto the merged
result.

## What Changes

### Activation model: per-agent `dedicated` flag, defaulting to true

An agent uses the pool only when its definition sets `dedicated: false`.
The optional top-level `worktreePool` block tunes the pool but does not
activate it. Rationale: a single opt-in gate is auditable per agent and
avoids the ambiguous half-configured states of a two-key handshake
(block present but no agent opted in, or the reverse). With the flag
defaulting to `true`, every existing `agents.yaml` keeps the per-change
worktree behavior verbatim.

### Config: `worktreePool` block (all keys optional)

- `max` — hard cap on pool worktrees; integer ≥ 1; default `5`.
- `namePrefix` — directory prefix; default `pool` (`.worktrees/pool-1/`).
- `cleanupBetweenJobs` — Phase 1 accepts only `git-clean`; other values
  from the idea note (`reset-to-main`, `recreate`) are rejected with a
  "not yet supported" error rather than silently accepted-and-ignored.

`idleReleaseAfter` is deferred: it requires a background reaper, which
belongs with the dispatcher. Unknown keys in the block are a validation
error so typos surface instead of silently disabling tuning.

### Pool module: `server/agents/pool.ts`

`WorktreePool` with in-memory lease tracking (Node is single-threaded; a
Map suffices, no mutex):

- `acquire(changeId)` — returns a free pool worktree, lazily creating
  `pool-N` (N ≤ max) if none exists; returns `null` when all `max` are
  leased. **On exhaustion the job Start fails with an explicit error** —
  no queueing (dispatcher's job, later phase) and no silent fallback to
  a dedicated worktree (a fallback would mask undersized pools and make
  behavior unpredictable under load).
- On acquire, the pool worktree adopts branch `agent/<change-id>`. The
  checked-out branch IS the change-id metadata: it survives server
  restarts, integrates with orphan-adoption's existing branch scan, and
  — unlike a meta file in the worktree — cannot be destroyed by the
  cleanup pass. Idle pool worktrees sit on a detached HEAD at the
  repo's default branch.
- **Branch already exists?** `git rev-parse --verify agent/<id>`; if
  found, `git checkout agent/<id>` (reuse). Otherwise
  `git checkout -b agent/<id>`. A reused branch may carry prior commits;
  that is the intended workflow when a job is restarted for the same
  change, but if a branch is currently checked out in ANOTHER worktree
  git will refuse the checkout — surface that error verbatim to the
  Start flow (see the "same change cannot straddle two worktrees"
  scenario in the spec).
- **Default branch resolution**: on WorktreePool construction, resolve
  once via `git symbolic-ref refs/remotes/origin/HEAD` → strip the
  `refs/remotes/origin/` prefix; fallback order on failure: `main`,
  then `master`. Cache the result for the pool's lifetime.
- `release(...)` — runs the `git-clean` cleanup, then detaches HEAD at
  the resolved default branch, leaving `agent/<change-id>` intact for
  the normal merge flow.

### Cleanup semantics: `git-clean`

`git reset --hard && git clean -fd && git checkout --detach <default>`.
Tracked modifications are reset; untracked files are removed; **ignored
files (node_modules, build caches) are kept** — that retention is the
pool's entire performance win. Consequence, stated plainly: uncommitted
work in a pool worktree is discarded at release. The bundled apply
skill already commits before stopping, so this only bites misbehaving
agents.

### Runner integration

- `run()`: when `def.dedicated === false`, acquire from the pool instead
  of `git worktree add .worktrees/<change-id>`. Template variables still
  resolve: `${worktree_path}` = the pool path, `${branch}` =
  `agent/<change-id>`.
- Job end (completed / crashed / cancelled / discarded): release back to
  the pool.
- Startup: **extend** the existing orphan-adoption scan with a
  pool-worktree branch-name inference path (existing scan uses
  `.worktrees/<change-id>` PATH matching; pool paths carry no change-id
  in the path, so the branch name `agent/<change-id>` is the source of
  truth). Pool worktrees with an agent branch checked out are adopted
  as orphan jobs (leases reconstructed); detached-HEAD pool worktrees
  are registered as free.

## Capabilities

### Modified Capabilities

- `agent-runner`: jobs for pool-enabled agents lease bounded, reusable
  worktrees with cleanup between jobs and restart recovery; dedicated
  per-change worktrees remain the default.

## Impact

- `server/agents/pool.ts` — new `WorktreePool` module
- `server/agents/registry.ts` — `dedicated?: boolean` on `AgentDef`;
  `worktreePool` block parsing/validation; exported resolved config
- `server/agents/runner.ts` — pool path in `run()`, release on job end,
  startup adoption of pool worktrees, default-branch resolution helper
- `templates/agents.yaml.example` — commented `dedicated` +
  `worktreePool` examples

## Out of scope

- **Queueing on exhaustion** and any lease scheduling — dispatcher, a
  later phase.
- **`idleReleaseAfter`** reaper — deferred with the dispatcher.
- **`reset-to-main` / `recreate`** cleanup modes — deferred until real
  usage shows `git-clean` is insufficient.
- **UI changes** — no pool visualization; existing job / worktree UI
  applies unchanged.
- **Kanban warning on dirty release** — the discard-uncommitted
  consequence is documented in the template and this proposal; a UI
  guard belongs with the dispatcher / narration work.
