# dashboard Specification

## Purpose
Render the OpenSpec project as a local browser dashboard: progress at a glance,
per-change detail, and a read-only specs browser, all driven from the parsed
Markdown.
## Requirements
### Requirement: Change Overview
The system SHALL list active changes as cards, each showing the change id, an
intent summary, and a progress bar derived from its tasks.md checklist.

#### Scenario: Partial completion
- **WHEN** a change has 2 of 6 tasks checked
- **THEN** its card shows a 33% progress bar and "2/6"

### Requirement: Change Detail
The system SHALL present each change with Tasks, Proposal, Design, and Delta
Specs views.

#### Scenario: Toggle from the Tasks view
- **WHEN** the user clicks a task checkbox in the Tasks view
- **THEN** the checkbox updates immediately and the underlying tasks.md is edited

### Requirement: Specs Browser
The system SHALL render the current specs under `openspec/specs/` as read-only
requirements with their Given/When/Then scenarios.

#### Scenario: View a capability spec
- **WHEN** the user opens the Specs page
- **THEN** each capability's requirements and scenarios are displayed

### Requirement: Live Connection Indicator
The system SHALL show whether the live WebSocket connection is active and SHALL
apply pushed updates without a manual refresh.

#### Scenario: External update arrives
- **WHEN** a change is edited outside the UI
- **THEN** the affected card or task list updates in place

### Requirement: Archived Change Detail Fallback
The system SHALL recognize when a Change Detail URL refers to an archived change
id and SHALL render an "Archived" panel instead of the generic not-found
message, so users who just archived a change are not shown a misleading error.

#### Scenario: Land on an archived id
- **WHEN** the user navigates to /change/<id> where <id> is present in the archive
- **THEN** the page shows an "Archived" panel with the archive date and final task progress

#### Scenario: Live transition after archiving the current change
- **WHEN** the user archives the change they are currently viewing and the watcher pushes the new state
- **THEN** the page swaps to the "Archived" panel without requiring a manual navigation

#### Scenario: Land on an unknown id
- **WHEN** the user navigates to /change/<id> where <id> is neither active nor archived
- **THEN** the existing "Change not found" message is shown unchanged

### Requirement: Back to Overview From Archived State
The system SHALL show a prominent "Back to Overview" link from the archived
panel so the user always has an obvious next step.

#### Scenario: Return to Overview
- **WHEN** the user is on the Archived panel
- **THEN** a link back to / is visible and operates a standard client-side navigation

### Requirement: Tags Top-Nav Entry
The system SHALL include a "Tags" entry in the top navigation between Specs
and Docs, so the cross-cutting view of artifacts is one click away from any
page.

#### Scenario: Tags link visible
- **WHEN** the dashboard is open
- **THEN** the top navigation shows Overview, Specs, Tags, Docs in that order

### Requirement: Clickable Tag Chips on Change Surfaces
The system SHALL render any tags declared on a change (in the proposal's
frontmatter, when present) as clickable chips on the change card on Overview
and on the change detail header, navigating to the corresponding tag page.

#### Scenario: Tag chips on Overview cards
- **WHEN** a change proposal declares tags
- **THEN** the change card on Overview shows them as chips that link to /tags/<ns>/<name>

#### Scenario: Tag chips on change detail
- **WHEN** the user opens a change detail page whose proposal declares tags
- **THEN** the detail header shows the tag chips next to the progress bar

### Requirement: Outcome on the Archived Panel
The system SHALL render an archived change's `outcome.md` (when present) on
the Archived panel of the Change Detail page, below the existing summary, so
the lessons learned from a completed change are visible to anyone revisiting
it.

#### Scenario: Outcome present
- **WHEN** the user views /change/<id> for an archived change whose archive directory contains outcome.md
- **THEN** the page renders the outcome body below the archive metadata, as rendered markdown

#### Scenario: No outcome
- **WHEN** the archived change has no outcome.md
- **THEN** the Archived panel renders as before with no outcome section

### Requirement: Outcome Indicator on Archive List
The system SHALL display an "outcome" indicator next to each Archive list
entry on Overview whose archive directory contains outcome.md, so users can
see at a glance which completed changes have written reflections.

#### Scenario: Archive entry has an outcome
- **WHEN** the Overview Archive list shows an entry that has outcome.md
- **THEN** the entry shows an outcome indicator alongside the date and progress

#### Scenario: Archive entry has no outcome
- **WHEN** the Overview Archive list shows an entry that has no outcome.md
- **THEN** no outcome indicator is shown for that entry

### Requirement: Run Button Suppressed When Only Verification Remains
The system SHALL suppress the Kanban Run button on a card when every
remaining unchecked task lives under a section whose title contains
"verif" (case-insensitive), so the agent is not invited to act on work
that requires human judgment.

#### Scenario: Only verification tasks remain
- **WHEN** a change in TODO or IN-PROGRESS has unchecked tasks ONLY in sections whose titles contain "verif"
- **THEN** the Run button is hidden and the card shows the muted text "verify only" in its place

#### Scenario: Non-verify work remains
- **WHEN** a change has at least one unchecked task in a section whose title does not contain "verif"
- **THEN** the Run button is shown as before

#### Scenario: No tasks parsed
- **WHEN** a change has no `tasks.md` or its tasks failed to parse
- **THEN** the Run button is shown (we cannot prove there is no actionable work)

#### Scenario: All tasks checked
- **WHEN** every task is checked and the change is in DONE
- **THEN** the card behaves as today (Archive button, no Run); this requirement does not affect DONE

### Requirement: IN-PROGRESS Column Start Launcher
The Kanban IN-PROGRESS column SHALL expose a header-level Start launcher
button — visually and semantically parallel to the TODO column's
`+ New Change` button — that opens a popover listing every change ready to
run and dispatches the shared start flow when one is picked, so users can
kick off parallel implementations without leaving the column they are
watching progress in.

#### Scenario: Launcher renders with count
- **WHEN** the IN-PROGRESS column mounts and there is at least one startable candidate
- **THEN** the header shows `Start ▾` with a candidate-count badge and the button is enabled

#### Scenario: Launcher renders disabled when there are no candidates
- **WHEN** every change is already running, completed, or has only verify-only work left
- **THEN** the launcher button is disabled with the reason `"Nothing startable — all changes are already running or have verify-only work left."`

#### Scenario: Launcher renders disabled when agents.yaml is empty
- **WHEN** `agents.length === 0`
- **THEN** the launcher button is disabled with the reason `"No agents in agents.yaml."`

#### Scenario: Popover lists startable candidates
- **WHEN** the user clicks the launcher and candidates exist
- **THEN** a popover anchored to the button lists each startable change with its id, tags summary, and current progress (`done/total`)

#### Scenario: Startable filter uses shared predicates
- **WHEN** the launcher computes its candidate list
- **THEN** it uses the same `hasNonVerifyWork` and `isRunningOrPending` predicates that the card-level Start button uses; the two agree on what counts as startable

#### Scenario: Pick dispatches through shared start flow
- **WHEN** the user picks a candidate
- **THEN** the launcher calls `useStartFlow().startImplementation(change)` — reading `proposal.execution` and either dispatching directly (worktree/terminal) or opening the ExecutionPicker — exactly as the card-level Start would

#### Scenario: Card visibly moves to IN-PROGRESS
- **WHEN** the picked change starts and the resulting job is running
- **THEN** the card renders in the IN-PROGRESS column (existing `bucketize` job-aware behavior) alongside any peers already running

#### Scenario: Popover dismissal
- **WHEN** the user clicks outside the popover or presses Escape
- **THEN** the popover closes and no start is triggered

#### Scenario: Parallel spawn permitted
- **WHEN** the user picks a candidate while another change already has a running job
- **THEN** the new change spawns its own worktree + agent process; both jobs run concurrently (no queueing or global lock)

### Requirement: Electron Channel Documented
The system documentation SHALL list the Electron desktop app alongside the
CLI and the VS Code extension as a supported distribution channel, so users
on any editor / no editor can find an entry point.

#### Scenario: README mentions Electron
- **WHEN** a user reads the project README
- **THEN** they see the Electron app described next to the CLI and VS Code extension, with a link to install instructions

#### Scenario: Migration guide includes Electron path
- **WHEN** a user follows the migration guide
- **THEN** "Install the Electron app" is offered as a Stage-2 alternative alongside the CLI invocation

### Requirement: Runtime Detection
The system SHALL detect at load time whether it is running inside a VS Code
webview (via `acquireVsCodeApi` availability) and expose that as a single
shared flag used by the orchestration and terminal capabilities.

#### Scenario: Detection in webview
- **WHEN** the dashboard loads inside a VS Code webview
- **THEN** the runtime flag is set to "vscode" for the duration of the page

#### Scenario: Detection outside VS Code
- **WHEN** the dashboard loads in a regular browser
- **THEN** the runtime flag is set to "standalone"

### Requirement: Token Bootstrap From Launch URL
The dashboard web UI SHALL read the session token from the launch URL
query parameter on first load, persist it in `sessionStorage`, and rewrite
the visible URL to drop the token so it does not linger in the browser
address bar.

#### Scenario: Bootstrap from URL
- **WHEN** the UI loads with `?token=<token>` in the URL
- **THEN** it stores the token in sessionStorage and removes `?token=` from the visible URL via `history.replaceState`

#### Scenario: Reload preserves the token
- **WHEN** the UI reloads in the same browser session after bootstrap
- **THEN** the token is read from sessionStorage and used unchanged

#### Scenario: New tab without token
- **WHEN** the user opens a new tab pointing directly at the dashboard with no `?token=`
- **THEN** the UI shows the "session expired" banner and links to the launch URL

### Requirement: Token Sent on Every Mutating Request
The dashboard web UI SHALL include the session token on every mutating API
call as the `X-Session-Token` header and on every WebSocket upgrade as a
`?token=` query parameter.

#### Scenario: Mutating fetch
- **WHEN** the UI calls `POST /api/pty/inject`, `POST /api/tasks/toggle`, `POST /api/agents/run`, or any other mutating endpoint
- **THEN** the request carries `X-Session-Token` and `Content-Type: application/json`

#### Scenario: WebSocket connect
- **WHEN** the UI opens `/ws` or `/pty`
- **THEN** the URL includes `?token=<token>`

### Requirement: Session Expired Recovery
The dashboard SHALL surface authentication failures as a single full-page
banner with a clear path back to a working session.

#### Scenario: 401 or 403 from the server
- **WHEN** a mutating call returns 401 or 403 with an auth-related reason
- **THEN** the UI shows a "Session expired — reload the dashboard" banner that points at the freshly-printed launch URL

### Requirement: Stale Token Detection on Load
The dashboard SHALL validate the stored session token against the server on
first load via a dedicated lightweight check endpoint, and SHALL surface
the "Session expired" banner immediately if the token is no longer valid,
so users do not have to perform a mutating action to discover that their
tab is stale (e.g. after a server restart).

#### Scenario: Stale token on load
- **WHEN** the UI loads with a token in sessionStorage that the server does not recognize (typically after a server restart)
- **THEN** the dashboard shows the "Session expired" banner without waiting for a mutating action

#### Scenario: Valid token on load
- **WHEN** the UI loads with a token the server recognizes
- **THEN** no banner is shown and the dashboard operates normally

#### Scenario: Check endpoint
- **WHEN** the UI calls `GET /api/auth/check` with `X-Session-Token`
- **THEN** the server returns 200 with `{ ok: true }` for a valid token and 401 otherwise

### Requirement: Run Button on Kanban Cards
The system SHALL render a Run action on TODO and IN-PROGRESS kanban cards
when at least one agent is defined in `agents.yaml`, and SHALL hide the
action otherwise.

#### Scenario: Single agent
- **WHEN** the agent registry has exactly one agent
- **THEN** the Run button starts that agent directly through a confirm modal

#### Scenario: Multiple agents
- **WHEN** the agent registry has more than one agent
- **THEN** the Run button opens a picker listing the agents by name and description; selecting one proceeds to the confirm modal

#### Scenario: Empty registry
- **WHEN** no agents are configured
- **THEN** no Run button is shown on cards and the kanban behaves exactly as before

### Requirement: Agent Status Badge
The system SHALL display the running state of the latest agent job on each
change card.

#### Scenario: Job running
- **WHEN** a change has an active agent job
- **THEN** the card shows a pulsing indicator with the agent name

#### Scenario: Job finished
- **WHEN** a change's latest job has finished
- **THEN** the card shows "✓ ready to merge" on success or "✗ failed" on a non-zero exit, until the user merges or discards

#### Scenario: Multiple runs over time
- **WHEN** the user has run the same change multiple times
- **THEN** the badge reflects the most recent job only

### Requirement: Agents Page
The system SHALL provide an Agents page at `/agents` accessible from the top
navigation, listing active jobs and recent finished jobs with per-job
output tails.

#### Scenario: Open the page
- **WHEN** the user clicks "Agents" in the top navigation
- **THEN** the dashboard navigates to `/agents` and shows active jobs first, then recent finished jobs

#### Scenario: Inspect a job
- **WHEN** the user opens a job
- **THEN** the dashboard shows its full output (live for running jobs, retained buffer for finished ones), the agent name, the change link, and Cancel / Merge / Discard actions as appropriate

### Requirement: Task Filtering
The system SHALL provide a control in the Change Detail Tasks view to show only
incomplete tasks, and SHALL remember the choice per change across reloads.

#### Scenario: Hide completed tasks
- **WHEN** the user enables "show incomplete only"
- **THEN** checked tasks and sections with no remaining tasks are hidden

#### Scenario: Filter persists per change
- **WHEN** the user enabled the filter on a change and reloads the dashboard
- **THEN** that change's Tasks view opens with the filter still enabled

### Requirement: App Identity is "ithyno"
The app's user-visible identity SHALL be "ithyno". The workflow it
operates on SHALL continue to be referred to as "OpenSpec"
(directory `openspec/`, upstream CLI `openspec`, skills under
`.claude/skills/openspec-*`). The `ITHYNO_*` env-var namespace SHALL
supersede every `OPENSPEC_UI_*` / app-owned `OPENSPEC_*` variable
the app previously read.

#### Scenario: CLI banner names the app "ithyno"
- **WHEN** `bin/ithyno.js` starts the server successfully
- **THEN** stdout contains `✔  ithyno on http://localhost:<port>/?token=<hex>`
- **AND** no line refers to the app as "OpenSpec UI"
- **AND** upstream OpenSpec CLI references (`openspec archive` etc. in help text) remain intact

#### Scenario: Electron window and menu name "ithyno"
- **WHEN** the Electron shell opens a project
- **THEN** the window title is "ithyno"
- **AND** on macOS the App menu label reads "ithyno"
- **AND** the About dialog identifies the app as "ithyno"

#### Scenario: VS Code extension palette entries prefix "ithyno:"
- **WHEN** the packaged VSIX is installed and the user opens the command palette
- **THEN** the extension's commands appear as `ithyno: <action>` (e.g. `ithyno: Show Dashboard`)
- **AND** the extension's displayName in the Extensions view reads "ithyno"

#### Scenario: `ITHYNO_*` env vars override defaults
- **GIVEN** the environment contains `ITHYNO_SHELL=/usr/bin/fish` and `ITHYNO_TERMINAL_STARTUP=""`
- **WHEN** the embedded terminal opens
- **THEN** the PTY spawns `/usr/bin/fish`
- **AND** no auto-launch command runs (empty override)

#### Scenario: Legacy `OPENSPEC_UI_*` vars are NOT read
- **GIVEN** the environment contains `OPENSPEC_UI_SHELL=/usr/bin/fish` and nothing under `ITHYNO_*`
- **WHEN** the embedded terminal opens
- **THEN** the PTY spawns the platform default shell (as if no override existed)
- **AND** no compatibility shim reads the old variable

#### Scenario: Workflow terms remain unchanged
- **THEN** the `openspec/` directory name, `openspec` upstream CLI, and `.claude/skills/openspec-*` skill paths retain their OpenSpec-flavored names
- **AND** `/opsx:*` slash commands are unchanged (they are upstream)
- **AND** `/ithy-opsx:*` slash commands are unchanged (they were already ithyno-flavored)

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

### Requirement: External Worktree Discard Detection
The dashboard SHALL detect worktree removals performed outside the UI
(terminal `git worktree remove`, editor git panels, cleanup scripts)
and update the Kanban card state accordingly, without requiring a
server restart. Detection is driven by the existing per-job
`worktree-progress` watcher's `unlink` event on `tasks.md`.

#### Scenario: Terminal-driven discard clears the job
- **GIVEN** an agent job in `running` / `completed` / `crashed` / `cancelled` / `orphaned` state whose worktree exists at `.worktrees/<id>/`
- **WHEN** the user runs `git worktree remove .worktrees/<id>` (or `git worktree remove --force …`, or any operation that unlinks the worktree's `tasks.md`) from a terminal outside the dashboard
- **THEN** within the watcher's debounce window (< 1s) the server broadcasts a WS event `{ type: "agent-job-removed", jobId, changeId }`
- **AND** the client's store deletes `jobs[jobId]`, `jobOutputs[jobId]`, and the matching `worktreeProgress[changeId]` entry
- **AND** on the next render, the Kanban card for `changeId` returns to the TODO column (its `change.progress` is used; no ghost `hasActiveJob`)

#### Scenario: External discard on a running agent
- **GIVEN** an agent process is currently running and its worktree is externally removed
- **THEN** the runner emits `agent-job-removed` for the job but does NOT explicitly kill the process
- **AND** the runner logs a warning that a live agent had its worktree removed out from under it
- **AND** the process, whose cwd is gone, will detect the missing directory itself and exit shortly after

#### Scenario: UI-driven Discard is unchanged
- **WHEN** the user clicks the Kanban card's Discard button (which routes through the existing Discard flow)
- **THEN** the runner's normal Discard path fires (kill process if running → remove worktree → delete branch → broadcast `agent-job-finished` or the current UI-driven event)
- **AND** the new `agent-job-removed` event is NOT broadcast for this case (the UI-driven path disposes its own watcher before removing, so the watcher's `unlink` handler doesn't fire — see `add-worktree-external-discard-detection`'s watcher-guard note)

#### Scenario: Unlink-only trigger, no directory
- **GIVEN** the enclosing `.worktrees/<id>/` directory is intact but only `tasks.md` was deleted (edge case: someone `rm`'d the file directly)
- **THEN** the runner still cleans up the job — the trigger is the watched file's `unlink`, not the containing directory's existence
- **AND** this is documented behavior; the runner's contract is "the tasks.md file is the source of truth for the worktree's aliveness"

### Requirement: Start (Worktree) Uncommitted-Proposal Guard
The dashboard SHALL check the target change's `openspec/changes/<id>/`
for uncommitted files before dispatching the Start-Worktree action.
When the check reports any untracked or modified file, the dashboard
SHALL surface an `UncommittedProposalModal` and defer the agent
spawn; the user may either commit the proposal (via a new
`/api/changes/:id/commit-proposal` endpoint) and then start, or
cancel. The Terminal branch of Start is unaffected.

#### Scenario: Uncommitted proposal opens modal
- **GIVEN** a change `X` whose `openspec/changes/X/` contains untracked files (e.g. a freshly-run `/opsx:propose` that has not been committed)
- **WHEN** the user clicks Start on X's Kanban card and the Worktree branch is selected
- **THEN** the dashboard fetches `GET /api/changes/X/git-state` and receives non-empty `untracked` (or `modified`) arrays
- **AND** the dashboard renders an `UncommittedProposalModal` listing those files
- **AND** the agent is NOT spawned yet

#### Scenario: Commit & Start proceeds normally
- **GIVEN** the modal from the previous scenario is open
- **WHEN** the user clicks `Commit & Start`
- **THEN** the dashboard POSTs to `/api/changes/X/commit-proposal`, which runs `git add openspec/changes/X/` + `git commit -m "propose: X"` in the main tree
- **AND** on 2xx response, the modal closes
- **AND** the original `runAgent` call fires; the worktree created from the fresh HEAD carries the committed proposal so the agent's preflight passes

#### Scenario: Cancel restores control
- **GIVEN** the modal is open
- **WHEN** the user clicks `Cancel` (or presses Escape, or clicks the backdrop)
- **THEN** the modal closes
- **AND** no agent is spawned
- **AND** no toast is shown (this is a deliberate user action, not an error)

#### Scenario: Clean proposal skips the modal
- **GIVEN** a change `Y` whose `openspec/changes/Y/` is fully committed to HEAD
- **WHEN** the user clicks Start on Y's Kanban card and the Worktree branch is selected
- **THEN** the `/api/changes/Y/git-state` check returns empty `untracked` and `modified` arrays
- **AND** the modal does NOT appear
- **AND** `runAgent` fires immediately, as before

#### Scenario: Terminal branch is unaffected
- **WHEN** the user selects the Terminal branch of Start for any change (committed or not)
- **THEN** the dashboard does NOT perform the git-state check
- **AND** does NOT render the modal
- **AND** the `/opsx:apply` inject into the embedded terminal proceeds unchanged; the terminal reads main tree files directly, so uncommitted proposals are visible there

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

### Requirement: Merge Action Command
The dashboard's Kanban Merge action SHALL inject
`/ithy-opsx:merge <change-id>` into the embedded terminal when
`commandStyle === "claude"`, so the Claude-driven flow runs the full
auto-stash + merge + auto-pop + optional-cleanup sequence via the
ithy-opsx-merge skill instead of the raw `git merge --no-ff
agent/<id>` (which aborts whenever the main tree is dirty). The
CLI-mode branch continues to inject the raw `git merge --no-ff
agent/<id>` unchanged.

#### Scenario: Claude-mode Merge uses ithy-opsx
- **WHEN** the user confirms a Merge action on a Kanban card while `commandStyle === "claude"`
- **THEN** the exact byte sequence `/ithy-opsx:merge <change-id>` is written to the embedded terminal

#### Scenario: CLI-mode Merge is unchanged
- **WHEN** the user confirms a Merge action while `commandStyle === "cli"`
- **THEN** the exact byte sequence `git merge --no-ff agent/<change-id>` is written to the embedded terminal

#### Scenario: Command modal preview reflects the switch
- **WHEN** the Merge command modal renders with `commandStyle === "claude"`
- **THEN** the preview shows `/ithy-opsx:merge <change-id>` and the submit label reads accordingly (e.g. `Send /ithy-opsx:merge`)

#### Scenario: Command modal preview for CLI mode
- **WHEN** the Merge command modal renders with `commandStyle === "cli"`
- **THEN** the preview shows `git merge --no-ff agent/<change-id>` (unchanged)

#### Scenario: Skill auto-stashes when main tree is dirty
- **GIVEN** the main tree has uncommitted files
- **WHEN** the user sends `/ithy-opsx:merge <id>` via the modal
- **THEN** the skill runs `git stash push -u -m "wip pre-merge <id>"` before the merge
- **AND** after a successful merge, the skill runs `git stash pop`
- **AND** the user's WIP files are back on the working tree

#### Scenario: Skill pauses on merge conflict without popping the stash
- **GIVEN** the main tree was dirty and got auto-stashed
- **WHEN** `git merge --no-ff agent/<id>` reports conflicts
- **THEN** the skill pauses with instructions to resolve in the editor and re-run
- **AND** the stash entry remains present in `git stash list` (the user's WIP is not lost even if they abandon the merge)

### Requirement: Revert Workflow
ithyno's spec-driven workflow SHALL support a documented "revert"
variant for changes that undo prior work. Every revert change SHALL
classify each of its target(s) as Case α (target already archived
before the revert lands) or Case β (target still in-flight when
the revert lands) and apply the appropriate disposition path.

#### Scenario: Revert change is named after its scope
- **GIVEN** a new revert change is being proposed
- **THEN** its id has the form `revert-<scope>` (scope may aggregate multiple targets under a single readable name)
- **AND** its frontmatter `tags:` includes `feature/revert`
- **AND** its proposal's Why section lists each reverted change id and classifies it as Case α or Case β

#### Scenario: Case α — archived target
- **GIVEN** the reverted target was archived before this revert lands
- **THEN** the target's ADDED spec deltas have already reached `openspec/specs/<capability>/spec.md`
- **AND** the revert change's own spec delta uses `MODIFIED` and/or `REMOVED` to undo those requirements
- **AND** the target's archive directory stays put; the revert's outcome links back to it

#### Scenario: Case β — in-flight target
- **GIVEN** the reverted target was still in `openspec/changes/` when this revert lands
- **THEN** the target's ADDED spec deltas never reached the specs
- **AND** the revert change's spec delta uses `ADDED` only, describing the post-revert baseline directly
- **AND** the target itself is archived alongside the revert, following the reverted-target archive procedure

#### Scenario: Reverted-target archive (Case β)
- **GIVEN** an in-flight target being archived as part of a revert
- **WHEN** the archive is prepared
- **THEN** the target's `specs/` subdirectory is deleted (its ADDED deltas would collide with the revert's new baseline)
- **AND** an `outcome.md` is written with title `# Outcome: <target-id> (reverted)`
- **AND** the outcome preserves ✅ Worked and ⚠️ Surprises sections from the actual implementation
- **AND** 🔁 Differently and 🌱 Follow-ups are replaced with a single bold pointer to the reverting change id
- **AND** the reverted-target archives complete BEFORE the reverting change's own archive

#### Scenario: Documentation lives in openspec-flow skill
- **THEN** the Revert section is documented in `.claude/skills/openspec-flow/SKILL.md` (and its `templates/` mirror)
- **AND** `CLAUDE.md` (and its templates mirror) cross-references the Revert section from the Standard order block

### Requirement: CommandModal Copy Button
The dashboard's `CommandModal` SHALL expose an explicit "Copy
command" affordance that writes the current preview string to the
system clipboard via `navigator.clipboard.writeText`. The affordance
SHALL be operable via mouse click on a top-right button and via
`Cmd+C` / `Ctrl+C` when no text is selected inside the modal. The
copied string SHALL be exactly what the Send button would inject
into the embedded terminal (mode-aware for archive / merge).

#### Scenario: Click copy writes preview to clipboard
- **GIVEN** a CommandModal is open with a preview command (e.g. `/ithy-opsx:archive add-foo`)
- **WHEN** the user clicks the copy button in the modal's top-right corner
- **THEN** `navigator.clipboard.writeText` is called with the exact preview string
- **AND** the button icon flips to a checkmark for ~1.2s then reverts

#### Scenario: Cmd+C copies when no selection
- **GIVEN** the modal is focused with no text selected
- **WHEN** the user presses `Cmd+C` (or `Ctrl+C`)
- **THEN** the copy flow fires as if the button were clicked
- **AND** the preview text lands in the clipboard

#### Scenario: Cmd+C with active selection defers to browser
- **GIVEN** the user has selected part of the preview text
- **WHEN** they press `Cmd+C`
- **THEN** the browser's default copy handling runs (copies the selection, not the whole preview)
- **AND** our handler does NOT override that behavior

#### Scenario: Clipboard permission denied surfaces toast
- **GIVEN** the browser has denied clipboard write permission
- **WHEN** the user clicks the copy button
- **THEN** the promise rejects
- **AND** an error toast appears: "Copy failed — clipboard permission not granted"
- **AND** the modal state is unchanged (icon does not flip)

#### Scenario: Mode-aware preview is copied verbatim
- **GIVEN** the modal's mode selector is on `cli` for an Archive action
- **WHEN** the user clicks copy
- **THEN** the clipboard contains `npx openspec archive <id>` (the `cli`-mode preview)
- **AND** flipping the mode selector to `claude` before clicking copies `/ithy-opsx:archive <id>` instead

### Requirement: Phase Persistence In Change Sidecar
The system SHALL persist a change's workflow phase as a `phase:` key
in the per-change sidecar file
`openspec/changes/<id>/.openspec.yaml`, accepting only the values
`proposed`, `coded`, `reviewed`, and `done` (plus `needs-human`,
governed by a separate capability), so that manual phase
assignments survive server restart without modifying `proposal.md`.

#### Scenario: phase survives restart
- **GIVEN** a change whose sidecar contains `phase: coded`
- **WHEN** the server restarts and rescans `openspec/changes/`
- **THEN** the change is reported with phase `coded` in `GET /api/state`

#### Scenario: absent key means unphased
- **GIVEN** a change whose sidecar has no `phase:` key (or no sidecar at all)
- **WHEN** the server loads the change
- **THEN** the change is reported with a null phase and no sidecar is created

#### Scenario: invalid or reserved value tolerated
- **GIVEN** a sidecar hand-edited to `phase: verified`
- **WHEN** the server loads the change
- **THEN** the value is treated as absent, a warning is logged, and the server does not crash

#### Scenario: sidecar write preserves other keys
- **GIVEN** a sidecar containing unrelated existing keys (e.g. `schema:`)
- **WHEN** the server writes a new phase value
- **THEN** the unrelated keys are preserved byte-for-byte in intent (same values after reparse)

### Requirement: Phase Transition API
The server SHALL expose `GET /api/changes/:id/phase` and a
CSRF-guarded `POST /api/changes/:id/phase` that validates the
requested phase against the active enum, rejects the reserved
values `validated` and `verified` with an error message pointing at
the phase-gates idea note, persists accepted transitions to the
sidecar, and broadcasts the updated state over the existing
`state-updated` WebSocket event without introducing a new event
variant.

#### Scenario: successful manual transition
- **GIVEN** a change with phase `proposed`
- **WHEN** a client POSTs `{ "phase": "coded" }` with a valid CSRF token
- **THEN** the sidecar is updated, the response succeeds, and connected clients receive a `state-updated` event carrying the new phase

#### Scenario: reserved value rejected with pointer
- **WHEN** a client POSTs `{ "phase": "validated" }`
- **THEN** the server responds 400 with a message stating the value is reserved for Phase 4 and referencing `docs/ideas/2026-07-04-phase-gates-and-putback.md`
- **AND** no sidecar write occurs

#### Scenario: CSRF required
- **WHEN** a client POSTs a phase without a valid CSRF token
- **THEN** the request is rejected by the `requireCsrfBase` guard and no sidecar write occurs

#### Scenario: unknown change
- **WHEN** a client POSTs a phase for a change id that does not exist on disk
- **THEN** the server responds 404

### Requirement: Needs-Human Escalation State
The system SHALL support a phase-agnostic `needs-human` state that
any change can enter from any phase (or from the unphased state),
recording the change's prior phase as `priorPhase` and the
escalation time as `escalatedAt` in the change sidecar so that
resolution returns the change to where it came from and wait-time
ordering survives server restart.

#### Scenario: escalation records prior phase
- **GIVEN** a change with phase `coded`
- **WHEN** it is escalated
- **THEN** its phase becomes `needs-human`, its `priorPhase` is `coded`, and `escalatedAt` is set to the escalation time

#### Scenario: escalating an unphased change
- **GIVEN** a change with no phase
- **WHEN** it is escalated
- **THEN** its `priorPhase` defaults to `proposed`

#### Scenario: escalation state survives restart
- **GIVEN** an escalated change
- **WHEN** the server restarts
- **THEN** the change is reported in `needs-human` with its original `priorPhase` and `escalatedAt`

#### Scenario: only one open escalation
- **GIVEN** a change already in `needs-human`
- **WHEN** a second escalation is requested
- **THEN** the server responds 409 and the existing escalation is untouched

### Requirement: Needs-Human Artifact
Escalations SHALL be captured in a human-readable markdown file
`openspec/changes/<id>/needs-human.md` consisting of a mandatory H1
stating the single question, an optional `## Context` section, an
`## Answer` section present once answered, and a mandatory footer
line `answered: false` that is flipped to `answered: true` on
resolution.

#### Scenario: artifact written on escalation
- **WHEN** a change is escalated with a question and context
- **THEN** `needs-human.md` is created with the question as its H1, the context under `## Context`, and the footer `answered: false`

#### Scenario: artifact completed on answer
- **GIVEN** an open escalation
- **WHEN** the escalation is answered
- **THEN** the answer is appended under `## Answer` and the footer reads `answered: true`

#### Scenario: hand-edited artifact tolerated
- **GIVEN** a `needs-human.md` edited by hand with a missing footer
- **WHEN** the server parses it
- **THEN** it is treated as unanswered, a warning is logged, and the server does not crash

#### Scenario: artifact preserved through archive
- **GIVEN** a change with an answered `needs-human.md` present in its dir
- **WHEN** the change is archived via `openspec archive <id>`
- **THEN** the file moves along with the rest of the change dir to `openspec/changes/archive/<id>/needs-human.md`
- **AND** its contents (question, context, answer, `answered: true` footer) are preserved verbatim

### Requirement: Escalation And Answer API
The server SHALL expose CSRF-guarded endpoints
`POST /api/changes/:id/needs-human` (body `{ question, context? }`)
to create an escalation and
`POST /api/changes/:id/needs-human/answer` (body `{ answer }`) to
resolve one; answering SHALL restore the change's phase to its
`priorPhase`, clear `priorPhase` and `escalatedAt`, and broadcast
the updated state. The server SHALL additionally detect an
artifact whose footer was flipped to `answered: true` by an
external editor and perform the same restoration exactly once
(guarded by the change's current `phase === "needs-human"` check
so duplicate file-watch fires are no-ops).

#### Scenario: escalation via API
- **WHEN** a client POSTs a non-empty question with a valid CSRF token
- **THEN** the artifact is written, the change enters `needs-human`, and connected clients receive a `state-updated` event

#### Scenario: empty question rejected
- **WHEN** a client POSTs an escalation with an empty question
- **THEN** the server responds 400 and nothing is written

#### Scenario: answer via API restores phase
- **GIVEN** a change in `needs-human` with `priorPhase: reviewed`
- **WHEN** a client POSTs an answer with a valid CSRF token
- **THEN** the artifact is completed, the change's phase returns to `reviewed`, and `priorPhase`/`escalatedAt` are cleared

#### Scenario: answer via editor restores phase
- **GIVEN** a change in `needs-human`
- **WHEN** the user edits `needs-human.md` on disk so the footer reads `answered: true`
- **THEN** the watcher triggers the same restoration path (guarded on `phase === "needs-human"`) exactly once

#### Scenario: duplicate file-watch fires are no-ops
- **GIVEN** a change that just returned to `priorPhase` via editor fallback
- **WHEN** chokidar fires a second event for the same edit (a known behavior on some editors)
- **THEN** the server observes `phase !== "needs-human"` and skips the restore path without side effects

#### Scenario: answer without escalation rejected
- **GIVEN** a change not in `needs-human`
- **WHEN** a client POSTs to the answer endpoint
- **THEN** the server responds 409

### Requirement: Runtime Definitions In agents.yaml

The system SHALL accept a `runtimes:` section in `agents.yaml` that
declares reusable runtime configurations. Each entry SHALL define
`command`, `baseArgs`, `promptStyle`, optional `promptFlag`, and a
`supports` object describing runtime capabilities. Unknown fields or
unknown enum values SHALL be rejected at load time with an error
banner in the dashboard.

#### Scenario: valid runtime section parsed
- **GIVEN** `agents.yaml` contains a `runtimes:` entry `claude` with `command`, `baseArgs`, `promptStyle: cli-arg`, `promptFlag: -p`, and `supports: { interactive: true, artifactOutput: true, diff: git }`
- **WHEN** the registry loads
- **THEN** the resolved config contains `runtimes.claude` with those exact values

#### Scenario: unknown promptStyle rejected
- **GIVEN** a `runtimes:` entry with `promptStyle: elsewhere`
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the invalid enum value and the dashboard surfaces the error banner while retaining the last-known-good agents list

#### Scenario: unknown supports.diff rejected
- **GIVEN** a `runtimes:` entry with `supports.diff: unknown-strategy`
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the invalid enum value

#### Scenario: missing command rejected
- **GIVEN** a `runtimes:` entry without a `command` field
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the missing field

#### Scenario: agents.yaml without a runtimes section
- **GIVEN** an `agents.yaml` that has no `runtimes:` key
- **WHEN** the registry loads
- **THEN** the load succeeds and `runtimes` is an empty object; legacy agents continue to function

### Requirement: Runtime-Backed Agents

The system SHALL support runtime-backed agent definitions that use
`runtime` + `prompt` fields as an alternative to `command` + `args`.
When a runtime-backed agent is spawned, the system SHALL look up the
referenced runtime, apply template substitution to the prompt
(`${change_id}`, `${worktree_path}`, `${branch}`), and construct the
effective command line according to the runtime's `promptStyle`:

- `promptStyle: cli-arg`: `[...runtime.baseArgs, ...(promptFlag ? [promptFlag] : []), resolvedPrompt]`
- `promptStyle: stdin`: `[...runtime.baseArgs]` with the resolved prompt delivered via the spawn's stdin (as `initialInput`)
- `promptStyle: file`: reserved for a future change; the runner SHALL throw a clear "not yet supported" error

Each agent SHALL provide EXACTLY ONE of `runtime`+`prompt` or
`command`+`args`; providing both or providing partial combinations
SHALL be rejected at load time.

#### Scenario: runtime-backed agent resolves via cli-arg with promptFlag
- **GIVEN** an agent `{ runtime: claude, prompt: "/opsx:apply add-foo" }` and a runtime `claude` with `baseArgs: [--dangerously-skip-permissions]`, `promptStyle: cli-arg`, `promptFlag: -p`
- **WHEN** the runner resolves the agent for change `add-foo`
- **THEN** the resolved command is `claude` with args `[--dangerously-skip-permissions, -p, /opsx:apply add-foo]`

#### Scenario: runtime-backed agent resolves via stdin
- **GIVEN** an agent `{ runtime: copilot, prompt: "review this diff" }` and a runtime `copilot` with `baseArgs: [copilot, suggest]`, `promptStyle: stdin`
- **WHEN** the runner resolves the agent
- **THEN** the resolved command is `gh` with args `[copilot, suggest]` and the resolved `initialInput` equals `"review this diff"`

#### Scenario: template substitution inside prompt
- **GIVEN** an agent with `prompt: "Implement ${change_id} in ${worktree_path}"`
- **WHEN** the runner resolves the agent for change `add-foo` with worktree `.worktrees/pool-2`
- **THEN** the resolved prompt reads `Implement add-foo in .worktrees/pool-2`

#### Scenario: mutual exclusion — runtime plus command rejected
- **GIVEN** an agent that declares both `runtime: claude` and `command: aider`
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the mutually exclusive fields

#### Scenario: mutual exclusion — runtime without prompt rejected
- **GIVEN** an agent that declares `runtime: claude` but no `prompt`
- **WHEN** the registry loads
- **THEN** the load fails with an error requiring `prompt` alongside `runtime`

#### Scenario: unknown runtime reference
- **GIVEN** an agent that declares `runtime: nowhere` and `runtimes:` has no entry named `nowhere`
- **WHEN** the runner attempts to resolve the agent
- **THEN** an error is raised naming the unknown runtime and no child process is spawned

### Requirement: Backward Compatibility With Command-Based Agents

Agents that use the pre-Phase-3 `command` + `args` shape SHALL continue
to spawn and resolve identically to their behavior before this change.
The registry SHALL treat `command` + `args` agents and `runtime` +
`prompt` agents as coexisting first-class citizens; adding a
`runtimes:` section SHALL NOT change the behavior of existing agents.

#### Scenario: existing agent still spawns
- **GIVEN** the repo's current `agents.yaml` containing a single agent `claude` with `command: claude` and `args: [--dangerously-skip-permissions, -p, /ithy-opsx:apply ${change_id}]`
- **WHEN** the registry loads
- **THEN** the load succeeds even if `runtimes:` is absent, and the runner resolves the agent to `claude` + `[--dangerously-skip-permissions, -p, /ithy-opsx:apply add-foo]` for change `add-foo`

#### Scenario: mixed agents.yaml
- **GIVEN** an `agents.yaml` with a `runtimes.claude` entry, a legacy agent using `command + args`, and a runtime-backed agent using `runtime + prompt`
- **WHEN** the registry loads
- **THEN** both agents are listed in `publicConfig()` and each resolves independently via its own path

### Requirement: Role-Based Agent Dispatch API

The server SHALL expose `POST /api/agents/dispatch` — a role-driven,
local-only endpoint that selects a matching agent from `agents.yaml`,
runs it against the given change, and (by default) blocks until the
job completes before returning the resolved outcome. The request body
SHALL accept `{ role, changeId }` as required fields and
`{ runtime?, promptSuffix?, wait?, timeoutMs? }` as optional fields.
The response SHALL carry the resolved job id, chosen agent name and
runtime label, terminal status (`completed | failed | cancelled |
timeout`), optional exit code, stdout tail, and a list of artifact
paths generated inside the change directory.

#### Scenario: happy-path dispatch
- **WHEN** a client POSTs `{ role: "code", changeId: "add-foo" }` and an agent with `role: code` exists
- **THEN** the server runs the agent, blocks until completion, and returns `{ jobId, agentName, runtime, status: "completed", exitCode: 0, artifactPaths: [] }`

#### Scenario: role has no matching agent
- **WHEN** a client POSTs `{ role: "unknown-role", changeId: "add-foo" }`
- **THEN** the server responds 404 with a message identifying the role and change id

#### Scenario: unknown change id
- **WHEN** a client POSTs `{ role: "code", changeId: "does-not-exist" }`
- **THEN** the server responds 404 with a "change not found" message

#### Scenario: empty registry
- **WHEN** `agents.yaml` declares no agents at all
- **THEN** the endpoint responds 503 with a "no agents defined" message (matching the pre-existing `/api/agents/run` behavior)

#### Scenario: non-local origin rejected
- **WHEN** a request arrives from a non-local address
- **THEN** the server responds 403 (same guard as `/api/agents/run`)

#### Scenario: wait=false returns immediately
- **WHEN** a client POSTs `{ role: "code", changeId: "add-foo", wait: false }`
- **THEN** the server starts the job and returns immediately with `{ jobId, status: "running" }`; the caller SHALL poll `/api/agents/jobs/:id` for completion

### Requirement: Agent Selection By Role And Specialties

The dispatch selector SHALL filter agents from `agents.yaml` by
matching (a) the request `role`, (b) an intersection between the
change's frontmatter tags and the agent's `specialties`, and (c) the
requested `runtime` when supplied. An agent whose `specialties` is
empty or contains `"any"` SHALL be treated as a wildcard match. When
multiple agents satisfy all filters, the selector SHALL return the
first one in `agents.yaml` declaration order.

#### Scenario: specialty intersection selects the right agent
- **GIVEN** two agents `code-claude` (`specialties: [ts, react]`) and `code-aider` (`specialties: [python]`) both with `role: code`
- **AND** change `add-foo`'s proposal frontmatter has `tags: [python]`
- **WHEN** the client dispatches `{ role: "code", changeId: "add-foo" }`
- **THEN** `code-aider` is selected

#### Scenario: wildcard specialties always match
- **GIVEN** an agent with `role: code` and `specialties: [any]`
- **WHEN** a client dispatches for any change
- **THEN** the agent is a valid candidate regardless of the change's tags

#### Scenario: runtime filter narrows candidates
- **GIVEN** two agents with `role: code` — one `runtime: claude` and one `runtime: aider`, both matching specialties
- **WHEN** a client dispatches `{ role: "code", changeId: "add-foo", runtime: "aider" }`
- **THEN** the aider-backed agent is selected

#### Scenario: deterministic order
- **GIVEN** two agents both match role, specialties, and runtime filters
- **WHEN** the client dispatches
- **THEN** the agent that appears first in `agents.yaml` is selected

### Requirement: Synchronous Dispatch With Timeout

The dispatch endpoint SHALL default to `wait: true`, meaning the HTTP
response is held open until the underlying agent job terminates or a
timeout elapses. The default timeout SHALL be 30 minutes (1,800,000
ms). When `timeoutMs` is supplied it SHALL override the default;
values less than 1000 ms SHALL be rejected as invalid. On timeout the
server SHALL cancel the running job and return `status: "timeout"`
with a non-zero exit code marker.

#### Scenario: wait=true blocks until completion
- **GIVEN** a client dispatches `{ role: "code", changeId: "add-foo" }` (default wait)
- **WHEN** the underlying agent job runs to completion in 90 seconds
- **THEN** the server responds after ~90 seconds with the completed job status

#### Scenario: timeout cancels and reports
- **GIVEN** a client dispatches `{ role: "code", changeId: "add-foo", timeoutMs: 2000 }`
- **WHEN** the job is still running after 2 seconds
- **THEN** the server cancels the underlying job and responds with `status: "timeout"`

#### Scenario: invalid timeout rejected
- **WHEN** a client supplies `timeoutMs: 500`
- **THEN** the server responds 400 with a "timeoutMs must be >= 1000" message

### Requirement: Runtime Installation Detection

The system SHALL detect whether each declared runtime's `command` is
installed on the host machine at the time of query. Detection SHALL
use `which <cmd>` (or the platform equivalent) and report `{ installed:
true, path }` on exit-code-zero success or `{ installed: false, error
}` when the command cannot be found. Detection results MAY be cached
per-command within a single request pass, and multiple runtimes that
share a `command` SHALL be detected once and reuse the same result.

#### Scenario: installed command
- **GIVEN** a runtime with `command: echo` (universally available on POSIX)
- **WHEN** the runtime is detected
- **THEN** the result is `{ installed: true, path: "<absolute path>" }`

#### Scenario: missing command
- **GIVEN** a runtime with `command: this-command-does-not-exist-xyz`
- **WHEN** the runtime is detected
- **THEN** the result is `{ installed: false, error: "<message>" }`

#### Scenario: two runtimes share a command
- **GIVEN** two runtimes both with `command: bash`
- **WHEN** `detectAllRuntimes` is invoked
- **THEN** the underlying `which bash` is executed at most once and both entries carry the same result

#### Scenario: windows platform
- **GIVEN** the server is running on Windows
- **WHEN** any runtime is detected
- **THEN** the result is `{ installed: false, error: "windows detection not supported" }` for every runtime

### Requirement: Runtime Status Endpoint

The server SHALL expose `GET /api/agents/runtimes` — a local-only
endpoint that returns every declared runtime alongside its current
installation status. The response SHALL include, for each runtime,
`name`, `command`, `baseArgs`, `promptStyle`, optional `promptFlag`,
`supports`, `installed`, optional `path`, and optional `error`. The
endpoint SHALL support `?refresh=1` to force re-detection instead of
using any cached results.

#### Scenario: empty runtimes section
- **GIVEN** `agents.yaml` has no `runtimes:` section (or the section is empty)
- **WHEN** a client GETs `/api/agents/runtimes`
- **THEN** the response is `{ runtimes: [] }`

#### Scenario: mixed installed and missing runtimes
- **GIVEN** two runtimes `claude` (command `echo`) and `bogus` (command `this-does-not-exist-xyz`)
- **WHEN** a client GETs `/api/agents/runtimes`
- **THEN** the response contains `claude` with `installed: true` and `bogus` with `installed: false`

#### Scenario: non-local origin rejected
- **WHEN** a non-local address GETs the endpoint
- **THEN** the server responds 403

#### Scenario: refresh bypasses cache
- **GIVEN** a runtime that was previously reported as `installed: false`
- **AND** the user has since installed the command
- **WHEN** a client GETs `/api/agents/runtimes?refresh=1`
- **THEN** the server re-runs detection and reports the current state

### Requirement: Job Model Includes Role And Runtime

Every agent job SHALL carry `role: string` and `runtime: string` fields set at spawn time. The runner SHALL populate `role` from the agent definition's `role` field, `runtime` from the runtime name for runtime-backed agents, and `runtime = "legacy"` for command-based agents. For jobs synthesized by orphan adoption where no agent definition is available, the runner SHALL set `role = "orphan"` and `runtime = "unknown"`. These fields SHALL NOT change during the job's lifetime.

#### Scenario: role and runtime on a runtime-backed spawn
- **GIVEN** an agent defined as `{ runtime: claude, prompt: "…", role: code }`
- **WHEN** the runner starts a job for it
- **THEN** the job's `role` is `"code"` and `runtime` is `"claude"`

#### Scenario: legacy agent gets "legacy" runtime
- **GIVEN** an agent defined as `{ command: claude, args: […], role: apply }`
- **WHEN** the runner starts a job for it
- **THEN** the job's `role` is `"apply"` and `runtime` is `"legacy"`

#### Scenario: orphan adoption gets synthetic labels
- **GIVEN** the server adopts an orphan worktree with no matching agent definition
- **WHEN** the job is registered
- **THEN** the job's `role` is `"orphan"` and `runtime` is `"unknown"`

### Requirement: Job Model Includes Artifact Paths On Finish

When an agent job terminates (completed, cancelled, or crashed) the runner SHALL scan the job's worktree for changed and new files under `openspec/changes/<changeId>/` and SHALL populate the job's `artifactPaths: string[]` field with the discovered paths. While the job is still running, `artifactPaths` MAY be omitted or empty. Adopted orphan jobs SHALL NOT be scanned and their `artifactPaths` SHALL be omitted or empty.

#### Scenario: artifacts appear after completion
- **GIVEN** a job whose agent writes `openspec/changes/add-foo/review.md`
- **WHEN** the job finishes with status `completed`
- **THEN** the job's `artifactPaths` includes `openspec/changes/add-foo/review.md`

#### Scenario: no artifacts produced
- **GIVEN** a job whose agent produces no filesystem changes inside the change directory
- **WHEN** the job finishes
- **THEN** the job's `artifactPaths` is `[]` (or omitted)

#### Scenario: running job has no artifacts field
- **GIVEN** a job that is still `running`
- **WHEN** a client queries `/api/agents/jobs/:id`
- **THEN** the response's `artifactPaths` is either omitted or an empty array

#### Scenario: dispatch reads from Job
- **GIVEN** a wait=true dispatch to a role that produces an artifact
- **WHEN** the endpoint returns after the underlying job completes
- **THEN** the response's `artifactPaths` matches the job's `artifactPaths` field (the runner is the single source of truth; the dispatch endpoint does not re-scan)

### Requirement: Review Artifact Schema

The system SHALL define `openspec/changes/<changeId>/review.md` as the artifact through which a review-role agent reports its verdict. The file's YAML frontmatter SHALL carry a required `verdict` field with a value of `"pass"` or `"needs-rework"`, an optional `findings` array where each entry SHALL declare `severity` (one of `"high" | "medium" | "low"`) and a non-empty `message`, optional per-finding `file` string and `line` positive integer, and an optional top-level `summary` string. The parser SHALL ignore unknown top-level keys to preserve forward compatibility. The body below the frontmatter SHALL be treated as a free-form narrative that the parser preserves but does not schema-validate.

#### Scenario: valid pass verdict parses
- **GIVEN** `review.md` with frontmatter `{ verdict: pass }`
- **WHEN** parseReviewContent runs
- **THEN** the result is `{ verdict: "pass", findings: [] }`

#### Scenario: needs-rework with findings
- **GIVEN** `review.md` with `verdict: needs-rework` and 2 findings each carrying severity + message
- **WHEN** parseReviewContent runs
- **THEN** the result contains `verdict: "needs-rework"` and both findings with their fields preserved

#### Scenario: missing verdict rejected
- **GIVEN** `review.md` with frontmatter that lacks a verdict field
- **WHEN** parseReviewContent runs
- **THEN** the result is `null`

#### Scenario: invalid verdict enum
- **GIVEN** `review.md` with `verdict: maybe`
- **WHEN** parseReviewContent runs
- **THEN** the result is `null`

#### Scenario: invalid finding severity
- **GIVEN** a finding with `severity: critical`
- **WHEN** parseReviewContent runs
- **THEN** the result is `null` (the whole artifact fails validation)

#### Scenario: forward-compatible unknown keys
- **GIVEN** frontmatter that includes future-reserved keys alongside a valid verdict
- **WHEN** parseReviewContent runs
- **THEN** the parse succeeds and the unknown keys are silently dropped

### Requirement: Job Model Includes Verdict

When a job's terminal artifact scan discovers `review.md` inside the change directory, the runner SHALL parse it via `parseReview(worktreePath, changeId)` — reading the review artifact from the job's worktree, NOT from the project root — and populate the job's `verdict?: ReviewArtifact` field before flipping `job.status` to a terminal value. Jobs that do not produce a `review.md` SHALL leave `verdict` undefined. Adopted orphan jobs SHALL NOT be scanned for verdict. The parse SHALL run for every terminal transition regardless of whether the job completed normally, was cancelled, or was killed by a dispatch timeout — the runner MUST NOT gate finalization side-effects on `job.status === "running"` at exit time.

#### Scenario: review job in worktree sets verdict
- **GIVEN** a review-role agent running inside `.worktrees/add-foo/` that writes `openspec/changes/add-foo/review.md` with `verdict: pass`
- **WHEN** the job terminates
- **THEN** the runner reads the file from the worktree and `runner.getJob(id).verdict.verdict` is `"pass"`

#### Scenario: non-review job leaves verdict undefined
- **GIVEN** a code-role agent that touches only `server/foo.ts`
- **WHEN** the job terminates
- **THEN** `runner.getJob(id).verdict` is undefined

#### Scenario: cancelled review job still populates verdict when review.md exists
- **GIVEN** a review-role agent that writes `review.md` inside its worktree, then is cancelled before self-exiting
- **WHEN** `runner.cancel(id)` fires and the child exits
- **THEN** `runner.getJob(id).verdict` reflects the review's parsed content and `runner.getJob(id).artifactPaths` includes `review.md`

#### Scenario: malformed review.md leaves verdict undefined
- **GIVEN** a review-role agent that writes a `review.md` whose frontmatter fails schema validation
- **WHEN** the job terminates
- **THEN** the parse returns null and `runner.getJob(id).verdict` is undefined

### Requirement: DispatchResult Includes Verdict

The dispatch endpoint's response SHALL include `verdict?: ReviewArtifact` populated from the underlying job's `verdict` field on both the completed and timeout branches. Consumers SHALL treat `verdict === undefined` as "no verdict available" without inferring a default.

#### Scenario: sync dispatch surfaces verdict
- **GIVEN** a review dispatch that completes and produces `review.md` with `verdict: needs-rework` and 1 finding
- **WHEN** the endpoint returns
- **THEN** the response `verdict` reflects the parsed content

#### Scenario: timeout branch surfaces last-known verdict
- **GIVEN** a review dispatch that hits the timeout after the runner has already populated the verdict
- **WHEN** the endpoint returns with `status: "timeout"`
- **THEN** the response `verdict` reflects whatever the runner set before cancellation

### Requirement: Review Worker Slash Command

The `/opsx:review <change-id>` slash command SHALL exist as a prompt template that instructs a Claude Code session to inspect the change's proposal, tasks, spec deltas, and worktree diff, then write `openspec/changes/<change-id>/review.md` conforming to the schema defined by `add-review-artifact` (verdict enum, findings array, optional summary). The template SHALL define the `verdict: pass | needs-rework` rubric so a review-role agent invoked via `/opsx:dispatch review <change-id>` returns a structured verdict.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/review.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives `<change-id>` as the argument, and follows the instructions to write `review.md`

#### Scenario: verdict rubric documented
- **GIVEN** the template body
- **WHEN** the reviewer reads it
- **THEN** it lists the pass criteria (proposal-aligned, no blockers) and the needs-rework criteria (spec violation, bug, security concern)

#### Scenario: findings structure
- **GIVEN** the reviewer discovers 2 concerns
- **WHEN** the template's findings guidance is followed
- **THEN** each finding entry conforms to `{severity: high|medium|low, file?: string, line?: positive integer, message: non-empty string}`

### Requirement: Verify Worker Slash Command

The `/opsx:verify <change-id>` slash command SHALL exist as a prompt template that instructs a Claude Code session to run `npm test`, then `npm run typecheck`, then `npm run build` in the worktree (fail-fast — skip remaining steps on any failure), and to write `openspec/changes/<change-id>/review.md` conforming to the review-artifact schema with `verdict: pass` on all-green or `verdict: needs-rework` with findings capturing the failing command name and its error output.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/verify.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads and follows the fail-fast chain

#### Scenario: all-green produces a pass verdict
- **GIVEN** all three commands return exit code 0
- **WHEN** the verifier writes review.md per the template
- **THEN** the frontmatter reads `verdict: pass` with a summary such as "verify pass" and an empty findings list

#### Scenario: test failure produces needs-rework
- **GIVEN** `npm test` exits non-zero
- **WHEN** the verifier writes review.md per the template
- **THEN** the frontmatter reads `verdict: needs-rework` with a summary naming the failing command and a finding whose message contains the error output

#### Scenario: fail-fast skips subsequent commands
- **GIVEN** `npm test` fails
- **WHEN** the verifier follows the template
- **THEN** `npm run typecheck` and `npm run build` are NOT executed

### Requirement: Escalate Command Wrapper

The `/opsx:escalate <change-id> "<question>"` slash command SHALL exist as a prompt template that instructs a Claude Code session to construct a JSON body containing the question and a context string assembled from the change's current state (phase, recent diff summary, prior review verdict) and to invoke `POST /api/changes/<change-id>/needs-human` via a Bash + curl call to `http://localhost:4321`. On HTTP 2xx the template SHALL report success to the caller; on non-2xx it SHALL surface the error body for further handling.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/escalate.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads and follows the curl-based escalation flow

#### Scenario: successful escalation
- **GIVEN** the endpoint returns HTTP 200
- **WHEN** the template's post-flow reporting runs
- **THEN** the caller receives an "escalated" confirmation with the API's returned status snippet

#### Scenario: error surfaced
- **GIVEN** the endpoint returns HTTP 400 (empty question) or 409 (already escalated)
- **WHEN** the template's error-handling runs
- **THEN** the caller receives the endpoint's error message verbatim so it can decide next action

### Requirement: Answer Command Wrapper

The `/opsx:answer <change-id> "<answer>"` slash command SHALL exist as a prompt template that instructs a Claude Code session to invoke `POST /api/changes/<change-id>/needs-human/answer` via Bash + curl to `http://localhost:4321` with the answer text as the JSON body, and to report the endpoint's response back to the caller. The template SHALL be safe to invoke only when the change is currently in `needs-human` state; the endpoint's 409 return is the safety net.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/answer.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads and follows the curl-based answer flow

#### Scenario: successful answer
- **GIVEN** the endpoint returns HTTP 200 (change was in needs-human)
- **WHEN** the template's reporting runs
- **THEN** the caller receives an "answer submitted" confirmation

#### Scenario: 409 when not escalated
- **GIVEN** the endpoint returns HTTP 409 (change is not in needs-human)
- **WHEN** the template's error-handling runs
- **THEN** the caller receives the "change is not in needs-human" error verbatim

### Requirement: Manager Loop Slash Command

The `/opsx:manage <change-id>` slash command SHALL exist as a prompt template that instructs a Claude Code session to run the Manager orchestration loop for the change: read change context, iterate over `dispatch code → dispatch review` pairs until the review verdict is `"pass"`, then `dispatch verify` once, and update the change's phase via `POST /api/changes/:id/phase` on each successful transition (`coded → reviewed → done`). The template SHALL bound iterations at a hard-coded MAX_ITERATIONS constant (default 5) and SHALL escalate the change to `needs-human` when the loop fails to converge, when any worker returns a non-`completed` status, or when a review or verify returns without a structured verdict.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/manage.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives the change id as its argument, and follows the manager-loop instructions

#### Scenario: convergence loop with pass verdict
- **GIVEN** a change whose `dispatch code → dispatch review` cycle produces `verdict: pass` on iteration 1
- **WHEN** the Manager follows the template
- **THEN** it sets phase to `coded`, then `reviewed` after review pass, dispatches verify, then sets phase to `done` on verify pass — all within one iteration

#### Scenario: needs-rework retries with findings
- **GIVEN** a review that returns `verdict: needs-rework` with 2 findings
- **WHEN** the Manager follows the template
- **THEN** it re-dispatches `code` with the findings serialized into `promptSuffix`, then re-dispatches `review` — the loop continues until `pass` or MAX_ITERATIONS is reached

#### Scenario: convergence loop cap
- **GIVEN** a review that keeps returning `verdict: needs-rework` on every iteration
- **WHEN** the Manager reaches MAX_ITERATIONS (default 5) without a pass verdict
- **THEN** the Manager invokes `/opsx:escalate <change-id> "Manager loop did not converge after 5 iterations"` and exits

#### Scenario: worker failure escalates
- **GIVEN** a `dispatch code` that returns `status: failed`
- **WHEN** the Manager follows the template
- **THEN** it escalates via `/opsx:escalate <change-id> "code worker failed: <reason>"` and exits without further dispatches

#### Scenario: missing verdict escalates
- **GIVEN** a review dispatch that returns without a `verdict` field
- **WHEN** the Manager follows the template
- **THEN** it escalates with reason "review returned no verdict" and exits

#### Scenario: already-done change exits early
- **GIVEN** a change whose current phase is already `done`
- **WHEN** the Manager reads the current phase
- **THEN** it exits without any dispatch, reporting "change already at phase: done"

#### Scenario: needs-human change is not restarted
- **GIVEN** a change whose current phase is `needs-human`
- **WHEN** the Manager reads the current phase
- **THEN** it exits without any dispatch, reporting "change is in needs-human — answer required before Manager can proceed"

### Requirement: Code Worker Slash Command

The `/opsx:code <change-id>` slash command SHALL exist as a prompt template that instructs a Claude Code session to read the change's proposal, tasks, and specs, apply the `promptSuffix` provided by the caller (typically the Manager passing review findings), implement or fix the change's outstanding tasks in the worktree, and commit the resulting changes on the agent branch. On any hard failure (schema violation, missing dependency, unsatisfiable requirement) the worker SHALL invoke `/opsx:escalate` and exit rather than committing partial or incorrect work.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/code.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives the change id as its argument, and follows the code-worker instructions

#### Scenario: commits changes on success
- **GIVEN** a change whose tasks the worker can implement
- **WHEN** the worker follows the template
- **THEN** it writes the code and creates a git commit on the agent branch

#### Scenario: promptSuffix findings inform the work
- **GIVEN** a Manager-initiated dispatch that includes a `promptSuffix` listing review findings
- **WHEN** the worker follows the template
- **THEN** the worker's plan incorporates the findings (fixes specific files / lines mentioned) before proceeding

#### Scenario: schema failure escalates instead of committing garbage
- **GIVEN** an unsatisfiable task (missing dependency, invalid spec)
- **WHEN** the worker encounters the failure
- **THEN** it invokes `/opsx:escalate <change-id> "<reason>"` and exits without committing partial changes

### Requirement: Agents Tab Runtimes Section

The Agents tab SHALL render a Runtimes section at the top that lists every runtime declared in `agents.yaml` alongside its installation status obtained from `GET /api/agents/runtimes`. Each row SHALL show the runtime name, an installed / not-installed indicator, and (when installed) the runtime's advertised capabilities (`interactive`, `artifactOutput`, `diff`). The section SHALL provide a Refresh control that re-fetches the endpoint with `?refresh=1` so users can re-check installation status after installing a missing runtime.

#### Scenario: no runtimes declared
- **GIVEN** `agents.yaml` has no `runtimes:` section (or the section is empty)
- **WHEN** the Agents tab renders
- **THEN** the Runtimes section is not displayed

#### Scenario: mix of installed and missing runtimes
- **GIVEN** `agents.yaml` declares `claude` (installed) and `copilot` (not installed)
- **WHEN** the Agents tab renders
- **THEN** the section shows both entries with distinct installed / not-installed styling

#### Scenario: refresh re-fetches
- **GIVEN** a runtime previously reported as not installed has since been installed
- **WHEN** the user clicks Refresh in the Runtimes section
- **THEN** the client calls `GET /api/agents/runtimes?refresh=1` and the row updates to installed without a full page reload

### Requirement: Agents Tab Live Section

The Agents tab SHALL render a Live section listing agent jobs whose `status` is `"running"`. Each row SHALL display the agent name, a role badge (from `job.role`), a runtime badge (from `job.runtime`), the change id as a link to the change detail page, and the elapsed time since `job.startedAt`. The row SHALL retain the existing drill-in behavior (expandable Output / Diff tabs) landed by prior changes. Jobs whose status is not `"running"` SHALL NOT appear in this section.

#### Scenario: running job shows role and runtime badges
- **GIVEN** an agent job with `role: "code"` and `runtime: "aider"`, status `"running"`
- **WHEN** the Agents tab renders
- **THEN** the Live section row displays both `code` and `aider` badges

#### Scenario: no running jobs
- **GIVEN** all jobs are in a terminal state
- **WHEN** the Agents tab renders
- **THEN** the Live section shows an empty-state hint such as "No agents currently running."

#### Scenario: orphan job in live
- **GIVEN** an orphan-adopted job (role `"orphan"`, runtime `"unknown"`) with status `"running"` or `"orphaned"`
- **WHEN** the Agents tab renders
- **THEN** the row appears with the orphan role badge (Phase 3.4 extension is honored)

### Requirement: Agents Tab Verdict Badge On Recent Jobs

Each recent-job row SHALL display a verdict badge when the underlying job's `verdict` field is populated (per Phase 3.5's Job Model Includes Verdict). A `verdict.verdict === "pass"` result SHALL render as a green pass indicator with the optional summary. A `verdict.verdict === "needs-rework"` result SHALL render as an amber indicator including the finding count. Jobs without a `verdict` field SHALL show no badge (the absence itself signals "this was not a review job or the review artifact was malformed").

#### Scenario: pass verdict badge
- **GIVEN** a finished review-role job whose `verdict.verdict` is `"pass"`
- **WHEN** the row renders
- **THEN** a green badge labelled "pass" is shown (optionally with the summary text)

#### Scenario: needs-rework badge with count
- **GIVEN** a finished review-role job whose `verdict.verdict` is `"needs-rework"` and whose `verdict.findings` contains 3 entries
- **WHEN** the row renders
- **THEN** an amber badge labelled "needs-rework (3)" is shown

#### Scenario: no verdict on non-review job
- **GIVEN** a finished code-role job with no `verdict` field
- **WHEN** the row renders
- **THEN** no verdict badge is displayed

### Requirement: Revert Slash Command

The project SHALL provide a `/opsx:revert <scope>` slash command that a
worker or user runs inside Claude Code to open a Case α or Case β
revert change under the naming convention `revert-<scope>`. The
command SHALL enforce the PENDING annotation and (Case α only)
REVERTED annotation conventions documented in `CLAUDE.md` and
`.claude/skills/openspec-flow/SKILL.md`.

Concretely, when invoked, the command SHALL:

1. Take an optional `<scope>` argument (kebab-case). If omitted, the
   command SHALL prompt the user for a scope description and derive
   the kebab-case id from it (same pattern as `/opsx:propose`).
2. Prompt the user for the target requirement(s) to revert. Multiple
   targets per capability are allowed; multiple capabilities are
   allowed.
3. For each target, classify Case α (target's ADDED delta has already
   reached `openspec/specs/<capability>/spec.md`) or Case β (target
   still in-flight in `openspec/changes/<target-id>/`).
4. Run `openspec new change revert-<scope>` and populate:
   - `proposal.md` with a `## Why` narrative and a `## Targets`
     list citing each target by id and its Case α / β classification;
   - `specs/<capability>/spec.md` with `## REMOVED Requirements` or
     `## MODIFIED Requirements` sections (Case α) or
     `## ADDED Requirements` describing the post-revert baseline
     (Case β);
   - `tasks.md` with a checklist of standard revert steps
     (spec deltas, impl reverts, target annotations, verification).
5. Insert `> ⚠️ **PENDING REMOVAL** by [revert-<scope>](path)` (or
   `PENDING MODIFICATION`) directly beneath the affected
   `### Requirement:` heading in the current
   `openspec/specs/<capability>/spec.md` for every target.
6. For Case α only, insert `> **REVERTED** by [revert-<scope>](path)`
   (or `PARTIALLY REVERTED` when only a subset of the target's
   requirements is affected) at the top of every archived target's
   `proposal.md`, immediately after the closing frontmatter delimiter.
7. Run `npm run openspec -- validate revert-<scope>` and report the
   result. If invalid, the command SHALL surface the error and
   stop before any git action.

The command SHALL NOT invoke `git commit`, `openspec archive`, or
any destructive action — the resulting change goes through the
standard `/opsx:apply` → `/ithy-opsx:archive` flow like any other.

#### Scenario: `/opsx:revert kanban-ui-lanes` (Case α, no argument prompt)
- **GIVEN** `openspec/specs/dashboard/spec.md` contains a landed
  requirement `Kanban Phase Swim Lanes`
- **AND** the user has determined they want to revert it
- **WHEN** the user invokes `/opsx:revert kanban-ui-lanes` and confirms
  the target selection
- **THEN** `openspec/changes/revert-kanban-ui-lanes/proposal.md`,
  `specs/dashboard/spec.md`, and `tasks.md` are created;
  a PENDING REMOVAL blockquote is inserted directly under
  `### Requirement: Kanban Phase Swim Lanes` in the current spec;
  the archived target proposal is annotated with a REVERTED blockquote;
  and `openspec validate revert-kanban-ui-lanes` reports VALID.

#### Scenario: Case β target — archived-target archive procedure
- **GIVEN** an in-flight change `openspec/changes/add-foo/` that has
  not yet been archived
- **WHEN** the user invokes `/opsx:revert foo` and picks the in-flight
  change as the target
- **THEN** the command SHALL follow the "Reverted-target archive
  (Case β)" procedure documented in
  `.claude/skills/openspec-flow/SKILL.md` — the target's
  `outcome.md` is rewritten to point at the revert, its
  `specs/` directory is deleted, and the revert's delta uses ADDED
  headers describing the post-revert baseline

#### Scenario: Command aborts on validation failure
- **GIVEN** the user typed an invalid scope containing a slash
- **WHEN** the command runs `openspec new change`
- **THEN** the CLI's error surfaces to the user
- **AND** no PENDING or REVERTED annotations are inserted anywhere

