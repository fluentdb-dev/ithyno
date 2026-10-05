# dispatch-worktree-change-artifacts Specification

## Purpose
TBD - created by archiving change fix-windows-copilot-validation. Update Purpose after archive.
## Requirements
### Requirement: Dispatched worktrees contain the current change definition

Dispatch and dispatch-multi SHALL place the complete current
`openspec/changes/<change-id>/` directory in a worktree before starting a worker.

#### Scenario: Change artifacts are not committed to HEAD

- **WHEN** a worktree is created while change artifacts are uncommitted or
  untracked in the Manager tree
- **THEN** the dispatcher SHALL copy those artifacts into the worktree

#### Scenario: Required change artifacts are missing

- **WHEN** `proposal.md` or `tasks.md` is absent after worktree setup
- **THEN** the dispatcher SHALL NOT start a worker for that change

