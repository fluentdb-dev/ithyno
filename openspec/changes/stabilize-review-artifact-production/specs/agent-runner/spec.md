## ADDED Requirements

### Requirement: Fresh Review Artifact Contract

For every review or verify stage, the system SHALL use one absolute
`review.md` path under the server-resolved execution root. Worktree execution
SHALL target the resolved worktree and main-tree execution SHALL target the
project root. Worker instructions SHALL NOT direct the worker to a conflicting
tree.

Before starting a review or verify subprocess, AgentRunner SHALL remove a prior
artifact at that path. A completed stage SHALL be judged only from an artifact
created by the current launch.

#### Scenario: Review starts inside an existing worktree
- **GIVEN** AgentRunner resolved `.worktrees/add-x` as the execution root
- **WHEN** it launches the review worker with that directory as `cwd`
- **THEN** the review workflow does not enter `.worktrees/add-x` again
- **AND** it writes to `<worktree>/openspec/changes/add-x/review.md`

#### Scenario: Stale review exists before launch
- **GIVEN** a prior `review.md` exists in the resolved execution root
- **WHEN** AgentRunner starts a new review or verify worker
- **THEN** it removes the prior artifact before spawning the process
- **AND** the prior artifact cannot satisfy the new stage

#### Scenario: Main-tree review
- **GIVEN** the dispatcher selected main-tree execution
- **WHEN** the review worker starts
- **THEN** the artifact path is `<project-root>/openspec/changes/<id>/review.md`
- **AND** no worktree path is inferred
