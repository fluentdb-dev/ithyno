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

