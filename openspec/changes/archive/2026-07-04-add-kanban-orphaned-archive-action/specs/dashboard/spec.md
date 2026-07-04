## ADDED Requirements

### Requirement: Kanban Card Action Row Reflects Worktree State
The Kanban `ChangeCard` component SHALL suppress the `Start` button on
any card whose latest job entry exists (implying an on-disk worktree
in some state), so users are never invited to spawn a fresh agent
against a change whose `.worktrees/<id>/` would immediately conflict
with the server's fresh-worktree assertion.

#### Scenario: No worktree — Start still appears
- **WHEN** a change has no job entry (no `.worktrees/<id>/` on disk)
- **THEN** the card renders the `Start` button as before, gated only by `hasNonVerifyWork` and the existing `hasAgents` check

#### Scenario: Worktree exists in any state — Start is hidden
- **WHEN** a change has a job entry (status is any of `running`, `completed`, `crashed`, `cancelled`, `orphaned`)
- **THEN** the card does not render a `Start` button

## ADDED Requirements

### Requirement: Orphaned Worktree Card Surfaces Archive as Primary
The Kanban card SHALL render an `Archive` button styled as the row's
primary action when the change's latest job status is `orphaned`, and
its click MUST open the existing CommandModal preloaded with
`/ithy-opsx:archive <change-id>` so the operator can drive the full
commit → merge → archive chain via the ithy-opsx-archive skill without
leaving the Kanban.

#### Scenario: Orphaned card shows Archive as primary
- **WHEN** the card renders for a change whose latest job has `status === "orphaned"`
- **THEN** the action row contains an `Archive` button using the `action-btn primary` class (or equivalent primary variant), positioned before `Merge` and `Discard`

#### Scenario: Archive click opens the CommandModal
- **WHEN** the user clicks the orphaned card's `Archive` button
- **THEN** the existing archive `CommandModal` opens with the preview `/ithy-opsx:archive <change-id>` and submit label `Send /ithy-opsx:archive`, identical to the ChangeDetail archive path

#### Scenario: Non-orphaned states do not gain Archive
- **WHEN** the card renders for a change whose latest job status is `completed`, `crashed`, or `cancelled`
- **THEN** the card action row does NOT gain the new Archive button (Merge / Discard / View diff behavior is unchanged; the DONE column's own Archive path covers the fully-done case)
