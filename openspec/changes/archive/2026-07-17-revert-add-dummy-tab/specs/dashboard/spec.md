# Delta: dashboard — throwaway verification change pattern

## ADDED Requirements

### Requirement: Throwaway Verification Change Pattern

The dashboard SHALL recognize a **throwaway verification change**
pattern for testing multi-agent dispatch chains, folder-driven
placement, semaphore behavior, or any other cross-cutting mechanic
that benefits from an end-to-end target change.

A change proposal MAY be introduced as a throwaway verification
target when ALL of the following hold:

1. The proposal's `Why` section explicitly names the verification
   exercise and states that the change is intended for eventual
   revert. Frontmatter tags SHOULD include a testing marker (e.g.
   `testing`, `multi-agent-verify`).
2. The proposal names its intended revert change up front — e.g.
   "This change is designed to be reverted via `revert-<id>` after
   verification completes." This gives future readers the exit
   path.
3. The revert change (`revert-<id>`) lands after verification is
   complete. The revert:
   - Deletes the target's `specs/` directory (so `openspec archive`
     folds nothing into the current spec).
   - Rewrites the target's `outcome.md` to document the revert
     rationale, linking to the verification archives that consumed
     the target.
   - Archives the target so it appears in `openspec/changes/archive/
     YYYY-MM-DD-<id>/` as a historical record.
   - Removes the target's worktree and agent branch (`git worktree
     remove` + `git branch -D`).

The pattern SHALL NOT be used for real user-facing features —
"throwaway" means throwaway. Features that ship live through the
normal propose → apply → archive flow without a revert.

#### Scenario: throwaway change declared up front
- **GIVEN** a change proposal whose `Why` names an intended `revert-<id>` and states that the change is verification-only
- **WHEN** reviewers read the proposal
- **THEN** they can distinguish it from a permanent feature at proposal-review time (before impl starts)

#### Scenario: revert deletes specs before archive
- **GIVEN** a throwaway target's revert change is being applied
- **WHEN** the revert workflow runs
- **THEN** the target's `specs/` directory is deleted before `openspec archive <target-id>`, so no spec fold occurs and the current spec stays clean

#### Scenario: worktree and branch removed after revert
- **GIVEN** a throwaway target had a worktree at `.worktrees/<id>/` on branch `agent/<id>`
- **WHEN** the revert workflow completes
- **THEN** `git worktree remove` and `git branch -D` are run so the impl doesn't linger; the archive record still preserves the proposal, tasks, and outcome for history

#### Scenario: outcome captures why it was thrown away
- **GIVEN** the archived throwaway target
- **WHEN** a future reader inspects `openspec/changes/archive/YYYY-MM-DD-<id>/outcome.md`
- **THEN** it explains that the target was verification-only, names the verifications it enabled, and links to the archives (or successor changes) that consumed it
