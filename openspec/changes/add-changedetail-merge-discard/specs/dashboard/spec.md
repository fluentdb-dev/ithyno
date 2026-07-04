## MODIFIED Requirements

### Requirement: Change Detail Action Row
The ChangeDetail page's header SHALL expose the same post-run agent
actions (Merge / Discard) that the Kanban card exposes for a change
whose latest job is in `completed`, `crashed`, `cancelled`, or
`orphaned` state, in addition to the existing Archive action.

#### Scenario: Merge button on ChangeDetail for post-run job
- **GIVEN** a change `X` whose latest job's status is `completed` / `crashed` / `cancelled` / `orphaned`
- **WHEN** the user navigates to `/change/X`
- **THEN** the ChangeDetail header renders a **Merge** button
- **AND** clicking it opens the CommandModal with the same preview command as the Kanban card's Merge button (`/ithy-opsx:merge <id>` when `commandStyle === "claude"`, `git merge --no-ff agent/<id>` when `commandStyle === "cli"`)

#### Scenario: Discard button on ChangeDetail for post-run job
- **GIVEN** the same precondition as the Merge scenario
- **WHEN** the user navigates to `/change/X`
- **THEN** the ChangeDetail header renders a **Discard** button
- **AND** clicking it opens the CommandModal with `git worktree remove .worktrees/<id>` + `git branch -D agent/<id>` (or the corresponding `/ithy-opsx:discard` when claude-mode is active)

#### Scenario: No Merge / Discard when no post-run job
- **GIVEN** a change with no job history, or whose latest job is still `running`
- **THEN** the ChangeDetail header does NOT render Merge or Discard buttons
- **AND** the Start button behavior (from `add-parallel-start-launcher`) is unchanged

#### Scenario: Shared hook keeps Kanban unchanged
- **WHEN** the Kanban card renders its Merge / Discard buttons
- **THEN** the preview commands, submit label, and success side-effects (clear `worktreeProgress` on merge/discard success) SHALL match what ChangeDetail produces — both call into a single shared hook
