## MODIFIED Requirements

### Requirement: Task Toggle Writeback Scope
The dashboard's `POST /api/tasks/toggle` endpoint SHALL accept file
paths inside the main `openspec/` directory AND inside worktree
openspec directories at `<projectRoot>/.worktrees/<safe-id>/openspec/`,
where `<safe-id>` matches `^[A-Za-z0-9._-]+$` and the second path
segment after `.worktrees/` MUST equal `openspec`. All other paths
SHALL be rejected with `400 invalid filePath`.

#### Scenario: Main-tree tasks.md tick succeeds
- **WHEN** the client POSTs to `/api/tasks/toggle` with a `filePath` inside `<projectRoot>/openspec/`
- **THEN** the server writes the tick and responds `200 { status: "ok" }`
- **AND** broadcasts `change-updated` over WebSocket

#### Scenario: Worktree tasks.md tick succeeds
- **WHEN** the client POSTs to `/api/tasks/toggle` with a `filePath` inside `<projectRoot>/.worktrees/<safe-id>/openspec/`
- **THEN** the server writes the tick and responds `200 { status: "ok" }`
- **AND** broadcasts `worktree-change-updated` over WebSocket with the reparsed worktree change payload

#### Scenario: Path escape via `..` is rejected
- **WHEN** the client POSTs with `filePath` = `<projectRoot>/.worktrees/id/../../etc/passwd`
- **THEN** the server responds `400 { error: "invalid filePath" }`
- **AND** no file is written

#### Scenario: Worktree path outside openspec segment is rejected
- **WHEN** the client POSTs with `filePath` = `<projectRoot>/.worktrees/id/README.md`
- **THEN** the server responds `400 { error: "invalid filePath" }`

#### Scenario: Unsafe change id characters are rejected
- **WHEN** the client POSTs with `filePath` = `<projectRoot>/.worktrees/bad id/openspec/tasks.md` (space in id)
- **THEN** the server responds `400 { error: "invalid filePath" }`

### Requirement: ChangeDetail Worktree View Toggle
The ChangeDetail page SHALL provide a bidirectional switch between the
main-tree view and the worktree view whenever a worktree with live
progress exists for the change. On the main-tree view, the switch
takes the form of a Link labelled `worktree · switch to worktree view`
next to the progress bar. On the worktree view, the existing
`viewing worktree · switch to main` pill in the header stays.

#### Scenario: Main view shows switch-to-worktree Link when worktree progress exists
- **WHEN** the user opens `/change/<id>` (no `?tree=worktree`)
- **AND** a job with worktree progress exists for the change
- **THEN** a Link labelled `worktree · switch to worktree view` renders next to the progress bar
- **AND** clicking it navigates to `/change/<id>?tree=worktree`

#### Scenario: Main view without worktree hides the Link
- **WHEN** the user opens `/change/<id>` for a change with no active worktree job
- **THEN** no worktree switch Link is rendered

#### Scenario: Worktree view shows switch-to-main pill only
- **WHEN** the user opens `/change/<id>?tree=worktree`
- **THEN** the h2 renders `viewing worktree · switch to main` as a Link
- **AND** the progress-bar-side worktree Link is NOT rendered (single affordance)

#### Scenario: Bidirectional switching returns to origin
- **WHEN** the user clicks the main-view Link to enter worktree view
- **AND** then clicks the header pill to return to main view
- **THEN** the URL matches the original `/change/<id>` with no query
