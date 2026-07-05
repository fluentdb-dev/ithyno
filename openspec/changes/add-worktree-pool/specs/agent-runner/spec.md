## ADDED Requirements

### Requirement: Worktree Pool Opt-In Configuration
The agent registry SHALL accept an optional per-agent `dedicated` boolean
(default `true`) and an optional top-level `worktreePool` block with
`max` (integer ≥ 1, default 5), `namePrefix` (default `"pool"`), and
`cleanupBetweenJobs` (only `"git-clean"` accepted in this phase). The
pool SHALL be used only for agents with `dedicated: false`; absent any
opt-in, the runner SHALL behave exactly as before this change and SHALL
create no pool directories.

#### Scenario: Legacy configuration is unchanged
- **GIVEN** an `agents.yaml` with no `dedicated` fields and no `worktreePool` block
- **WHEN** a job is started
- **THEN** the runner creates `.worktrees/<change-id>/` on branch `agent/<change-id>` as before
- **AND** no `.worktrees/pool-*` directory is ever created

#### Scenario: Pool block without opted-in agents is inert
- **GIVEN** a `worktreePool` block is present but every agent has `dedicated: true` or omits the field
- **WHEN** jobs are started
- **THEN** all jobs use dedicated per-change worktrees and no pool worktree is created

#### Scenario: Unsupported cleanup mode is rejected
- **GIVEN** a `worktreePool` block with `cleanupBetweenJobs: recreate`
- **WHEN** the registry loads the file
- **THEN** loading yields an error stating the mode is not yet supported

#### Scenario: Unknown pool keys are rejected
- **GIVEN** a `worktreePool` block containing `idleReleaseAfter: 300`
- **WHEN** the registry loads the file
- **THEN** loading yields an error naming the unrecognized key

### Requirement: Pool Worktree Acquisition
For an agent with `dedicated: false`, the runner SHALL lease a pool
worktree at job start: reusing a free `.worktrees/<prefix>-N/`, lazily
creating the next one while fewer than `max` exist, and adopting branch
`agent/<change-id>` in the leased worktree — creating the branch if it
does not exist, reusing it if it does. The checked-out branch is the
authoritative record of which change holds the lease. When all `max`
worktrees are leased, the job Start SHALL fail with an explicit
pool-exhausted error — no queueing and no fallback to a dedicated
worktree. If the branch is already checked out in another worktree,
git's refusal SHALL surface as a Start error (no partial lease).

#### Scenario: First pool job creates pool-1 lazily
- **GIVEN** a pool-enabled agent and no existing pool worktrees
- **WHEN** a job is started for change `<id>`
- **THEN** `.worktrees/pool-1/` is created with branch `agent/<id>` checked out and the agent spawns with that directory as its working directory
- **AND** `${worktree_path}` and `${branch}` template variables resolve to the pool path and `agent/<id>`

#### Scenario: Concurrent jobs get distinct pool worktrees
- **GIVEN** a running pool job leasing `pool-1` and `max` ≥ 2
- **WHEN** a second pool job starts for a different change
- **THEN** it leases `.worktrees/pool-2/` on its own `agent/<id>` branch

#### Scenario: Exhausted pool fails the start explicitly
- **GIVEN** `max: 2` with both pool worktrees leased
- **WHEN** a third pool job is started
- **THEN** the Start fails with an error identifying the pool as exhausted and stating the cap
- **AND** no `.worktrees/pool-3/` and no `.worktrees/<change-id>/` is created

#### Scenario: Reusing an existing agent branch
- **GIVEN** branch `agent/foo` already exists (from an earlier run of the same change) with commits
- **WHEN** a pool job for change `foo` is started
- **THEN** the pool worktree checks out `agent/foo` at its existing tip (no new commits, prior commits preserved)
- **AND** subsequent agent work builds on that history

#### Scenario: Same change cannot straddle two worktrees
- **GIVEN** a dedicated `.worktrees/foo/` worktree with `agent/foo` checked out (from a legacy `dedicated: true` job)
- **WHEN** a pool job is started for change `foo`
- **THEN** git refuses the checkout because the branch is in use elsewhere
- **AND** the Start fails with that git error surfaced verbatim
- **AND** no partial pool lease is recorded

### Requirement: Pool Worktree Release And Cleanup
When a pool job ends in any terminal state, the runner SHALL release the
worktree using `git-clean` semantics: reset tracked modifications
(`git reset --hard`), remove untracked files (`git clean -fd`), keep
ignored files (dependency and build caches — the pool's reuse benefit),
and detach HEAD at the repo's resolved default branch (via
`git symbolic-ref refs/remotes/origin/HEAD` with fallback to `main`
then `master`, cached for the pool's lifetime). The `agent/<change-id>`
branch SHALL be preserved for the normal merge flow. Uncommitted work
in the pool worktree is discarded at release.

#### Scenario: Completed job returns a clean worktree to the pool
- **GIVEN** a pool job on `pool-1` that committed its work to `agent/<id>` and left stray untracked files
- **WHEN** the job completes
- **THEN** `pool-1` has no tracked modifications and no untracked files, sits on a detached HEAD at the default branch, and is available for the next acquire
- **AND** branch `agent/<id>` still exists with the committed work

#### Scenario: Ignored files survive cleanup
- **GIVEN** a pool worktree containing an ignored `node_modules/` directory
- **WHEN** the leasing job ends and cleanup runs
- **THEN** `node_modules/` remains, and the next job leasing this worktree starts with the cache intact

#### Scenario: Failed cleanup quarantines the worktree
- **GIVEN** the cleanup sequence fails partway on `pool-1`
- **WHEN** release completes
- **THEN** `pool-1` is excluded from future acquires and the failure is logged, rather than being handed to the next job dirty

#### Scenario: Non-standard default branch
- **GIVEN** a repository whose default branch (per `git symbolic-ref refs/remotes/origin/HEAD`) is `develop`
- **WHEN** a pool job releases its worktree
- **THEN** the release detaches HEAD at `develop`, not `main` or `master`

### Requirement: Pool Worktree Restart Recovery
On startup, the runner SHALL extend the existing orphan-adoption scan
(which uses `.worktrees/<change-id>` PATH matching) with a
pool-worktree branch-name inference pass. A pool worktree with a branch
matching `agent/<change-id>` checked out SHALL be adopted as an orphan
job with its lease reconstructed from the branch name; a pool worktree
on a detached HEAD SHALL be registered as free and eligible for
acquisition.

#### Scenario: Restart during a pool job adopts it
- **GIVEN** a pool job running on `pool-1` (branch `agent/<id>` checked out)
- **WHEN** the server restarts
- **THEN** the job is adopted as an orphan for change `<id>` and `pool-1` is recorded as leased, exactly as a dedicated-worktree orphan would be

#### Scenario: Restart with idle pool worktrees keeps them available
- **GIVEN** `pool-1` and `pool-2` exist on detached HEADs with no jobs
- **WHEN** the server restarts and a new pool job is started
- **THEN** the job leases one of the existing worktrees rather than creating `pool-3`
