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

#### Scenario: Launcher does NOT gate on empty agents.yaml
- **WHEN** `agents.yaml` is empty (`agents: []`) or lacks a code-role entry
- **THEN** the launcher renders enabled if there are startable candidates — the skill falls back to Manager when the user picks one

#### Scenario: Popover lists startable candidates
- **WHEN** the user clicks the launcher and candidates exist
- **THEN** a popover anchored to the button lists each startable change with its id, tags summary, and current progress (`done/total`)

#### Scenario: Startable filter uses shared predicates
- **WHEN** the launcher computes its candidate list
- **THEN** it uses the same `hasNonVerifyWork` and `isRunningOrPending` predicates that the card-level Start button uses; the two agree on what counts as startable

#### Scenario: Pick dispatches through shared start flow
- **WHEN** the user picks a candidate
- **THEN** the launcher calls `useStartFlow().startImplementation(change)` which injects `/opsx:apply <id>` into the embedded terminal via CommandModal — no picker, no agent-selection modal, no worktree spawn from the UI

#### Scenario: Card visibly moves to IN-PROGRESS on skill spawn
- **WHEN** the injected `/opsx:apply` skill causes an agent job to appear (via any means the skill uses internally, e.g. `POST /api/agents/run`)
- **THEN** the card renders in the IN-PROGRESS column via the existing `bucketize` job-aware behavior

#### Scenario: Popover dismissal
- **WHEN** the user clicks outside the popover or presses Escape
- **THEN** the popover closes and no start is triggered

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

### Requirement: Backward Compatibility With Command-Based Agents

The system SHALL normalize pre-existing agent shapes into the new
`mode + roles + prompts` schema at load time so that users are not
required to migrate their `agents.yaml` on this release. The
following normalizations SHALL apply:

- `role: <name>` (scalar) SHALL be treated as `roles: [<name>]`.
- `initialInput: <value>` SHALL be treated as
  `prompts.<sole-role>: <value>`. If the agent has more than one
  role after `role`/`roles` normalization, the load SHALL fail
  with an error naming the ambiguous entry.
- An agent with `role: manager` (or `roles: [manager]`) SHALL be
  normalized to `mode: live-shell`.
- An agent with any other role and a legacy shape SHALL be
  normalized to `mode: single-prompt`.
- An agent with `runtime + prompt` and no explicit `mode` SHALL be
  normalized to `mode: single-prompt` unless its sole role is
  `manager`, in which case it SHALL be normalized to
  `mode: live-shell`; the `prompt` value SHALL be placed at
  `prompts.<sole-role>: <prompt>`.

Each normalization that fires SHALL emit a load-time warning
identifying the entry name, the fields that were rewritten, and a
short link to this change's outcome document as the migration guide.

Agents that already conform to the new schema (declare `mode`,
`roles`, and `prompts` directly) SHALL NOT trigger any warnings.

#### Scenario: legacy scalar role normalized
- **GIVEN** an agent `{ name: claude-code, role: code, command: claude, args: […] }`
- **WHEN** the registry loads
- **THEN** the normalized entry has `roles: [code]` and `mode: single-prompt`, and a warning names `claude-code` as a legacy shape

#### Scenario: legacy initialInput folds into prompts
- **GIVEN** an agent `{ name: claude-code, role: code, command: claude, args: [--dangerously-skip-permissions], initialInput: "/opsx:apply ${change_id}" }`
- **WHEN** the registry loads
- **THEN** the normalized entry has `prompts.code: "/opsx:apply ${change_id}"` and `mode: single-prompt`

#### Scenario: legacy manager normalized to live-shell
- **GIVEN** an agent `{ name: claude-manager, role: manager, command: claude, args: [--continue] }`
- **WHEN** the registry loads
- **THEN** the normalized entry has `roles: [manager]`, `mode: live-shell`, and `prompts.manager` populated from the built-in default when `initialInput` is absent

#### Scenario: legacy runtime-backed worker
- **GIVEN** an agent `{ name: claude-worker, role: code, runtime: claude, prompt: "/opsx:apply ${change_id}" }`
- **WHEN** the registry loads
- **THEN** the normalized entry has `roles: [code]`, `mode: single-prompt`, and `prompts.code: "/opsx:apply ${change_id}"`

#### Scenario: legacy initialInput on multi-role after user manual edit rejected
- **GIVEN** an agent hand-edited to `{ roles: [code, review], initialInput: "…" }`
- **WHEN** the registry loads
- **THEN** the load fails with an error stating `initialInput` cannot be used on a multi-role agent; the user is directed to use `prompts` instead

#### Scenario: new-schema entry loads without warnings
- **GIVEN** an agent that declares `mode`, `roles`, and `prompts` directly
- **WHEN** the registry loads
- **THEN** the load succeeds and no legacy-shape warning is emitted for that entry

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

The `/ithy-opsx:review <change-id>` slash command SHALL exist as a
prompt template at `.claude/commands/ithy-opsx/review.md` that
instructs a Claude Code session (or any CLI invoked as a review
worker) to inspect the change's proposal, tasks, spec deltas, and
worktree diff, then write `openspec/changes/<change-id>/review.md`
conforming to the schema defined by `add-review-artifact` (verdict
enum, findings array, optional summary). The template SHALL define
the `verdict: pass | needs-rework` rubric so the dispatcher can
route on the resulting frontmatter regardless of which CLI executed
the worker.

The template SHALL state explicitly that `review.md` is the **sole
contract**: the dispatcher never reads stdout, only parses the
artifact. Workers that emit the verdict on stdout without writing
`review.md` are treated as contract failures and escalate.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/ithy-opsx/review.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives `<change-id>` as the argument, and follows the instructions to write `review.md`

#### Scenario: verdict rubric documented
- **GIVEN** the template body
- **WHEN** the reviewer reads it
- **THEN** it lists the pass criteria (proposal-aligned, no blockers) and the needs-rework criteria (spec violation, bug, security concern)

#### Scenario: sole-contract clause present
- **GIVEN** the template body
- **WHEN** the reviewer reads the Guardrails section
- **THEN** it states that `review.md` is the sole contract and stdout is ignored by the dispatcher

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

### Requirement: Agent Mode Field

Every agent entry in `agents.yaml` SHALL declare a required `mode`
field with a value of `"single-prompt"` or `"live-shell"`. The
`mode` field SHALL control how the runner spawns the child process,
independent of whether the agent references a `runtime` or specifies
`command` directly.

- `single-prompt` — the runner spawns a headless child, delivers the
  resolved prompt according to the effective `promptStyle` (see
  `Runtime-Backed Agents`), captures stdout, and waits for exit.
- `live-shell` — the delivery channel depends on the agent's role:
  - **Worker** (any `roles` without `manager`) — the runner spawns
    a headless child with **`stdio: [pipe, pipe, pipe]`** (no PTY),
    writes the resolved prompt followed by a newline to
    `child.stdin`, and lets the process run to its own exit. CLIs
    that strictly require a TTY (Claude Code without `-p`, most
    REPLs) SHOULD use `single-prompt` instead — worker
    `live-shell` is intended for CLIs that read prompt input from
    stdin (aider's `--message-stdin`, custom scripts, gh copilot
    with piped stdin, ...).
  - **Manager** (`roles` includes `manager`) — spawned by the
    embedded Terminal panel's WebSocket handler
    (`attachPtyToSocket` in `server/sync/pty.ts`) which allocates
    a real PTY. Runner never dispatches Manager entries directly.

Agents that omit `mode` SHALL be rejected at load time with an error
identifying the missing field. During load-time normalization of
pre-existing entries (see `Backward Compatibility With Command-Based
Agents`), a `mode` value SHALL be synthesized from the legacy shape's
observable behavior.

#### Scenario: mode single-prompt spawns headless
- **GIVEN** an agent with `mode: single-prompt`, `command: claude`, `args: [--dangerously-skip-permissions]`, and a resolved prompt `/opsx:apply add-foo`
- **AND** the effective `promptStyle` is `cli-arg` with `promptFlag: -p`
- **WHEN** the runner spawns the agent for change `add-foo`
- **THEN** the child is spawned with argv `[claude, --dangerously-skip-permissions, -p, /opsx:apply add-foo]` and no PTY is allocated

#### Scenario: worker mode live-shell spawns headless with stdin piped
- **GIVEN** a worker agent with `mode: live-shell`, `roles: [code]`, `command: aider`, `args: [--message-stdin]`, and a resolved prompt `Implement add-foo`
- **WHEN** the runner spawns the agent
- **THEN** the child is spawned with argv `[aider, --message-stdin]`, `stdio: [pipe, pipe, pipe]`, and `Implement add-foo\n` written to `child.stdin`
- **AND** no PTY is allocated

#### Scenario: manager mode live-shell handled by Terminal panel
- **GIVEN** an agent with `roles: [manager]`, `mode: live-shell`, `command: claude`, `args: [--continue]`
- **WHEN** the user opens the embedded Terminal panel
- **THEN** `attachPtyToSocket` spawns a real PTY running `claude --continue` — this path is separate from `runner.run()`

#### Scenario: missing mode rejected
- **GIVEN** an agent that omits the `mode` field entirely and cannot be normalized from a legacy shape
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the missing field

### Requirement: Agent Roles Array

Every agent entry in `agents.yaml` SHALL declare a required
`roles: string[]` field with a non-empty array of role names.
Recognized role names are `code`, `review`, `verify`, `manager`, and
`other`; unknown role names SHALL be rejected at load time.

An agent whose `roles` array contains `manager` SHALL be treated as
the project's Manager and SHALL have `mode: live-shell`. The load
SHALL fail if more than one agent contains `manager` in `roles`
(Manager singleton constraint).

At dispatch time, an agent SHALL be considered a candidate for a
requested role if the request's scalar `role` is contained in the
agent's `roles` array (see `Agent Selection By Role And Specialties`).

#### Scenario: multi-role agent covers three worker roles
- **GIVEN** an agent `claude-worker` with `roles: [code, review, verify]`
- **WHEN** the client dispatches `{ role: "code", changeId: "add-foo" }` and later `{ role: "verify", changeId: "add-foo" }`
- **THEN** both dispatches select `claude-worker` (specialties and runtime filters allowing)

#### Scenario: manager singleton violated
- **GIVEN** an `agents.yaml` with two agents whose `roles` arrays both include `manager`
- **WHEN** the registry loads
- **THEN** the load fails with a "manager singleton violated" error naming both agents

#### Scenario: manager without live-shell rejected
- **GIVEN** an agent with `roles: [manager]` and `mode: single-prompt`
- **WHEN** the registry loads
- **THEN** the load fails with an error stating `mode` must be `live-shell` for manager agents

#### Scenario: unknown role name rejected
- **GIVEN** an agent with `roles: [code, docs]` (where `docs` is not a recognized role)
- **WHEN** the registry loads
- **THEN** the load fails with an error identifying `docs` as the unknown role

### Requirement: Per-Role Prompt Resolution

The system SHALL define per-role prompt resolution at dispatch time.
Both `runtimes:` entries and `agents:` entries MAY declare a
`prompts:` map keyed by role name whose values are prompt template
strings. Resolution order for a given `(agent, role)` pair:

1. `agent.prompts?.[role]` — highest priority
2. `runtimes[agent.runtime].prompts?.[role]` — when `agent.runtime` is set
3. Built-in default template for the role:
   - `code` → `/opsx:apply ${change_id}`
   - `review` → `/opsx:review ${change_id}`
   - `verify` → `/opsx:verify ${change_id}`
   - `manager` → `/opsx:manage`
   - `other` → no default; dispatch SHALL fail with a
     "no prompt configured for role `other`" error

After lookup, template substitution SHALL run on the resolved string
using `${change_id}`, `${worktree_path}`, and `${branch}` (same set
as today's `Runtime-Backed Agents`).

**Prompt injection into `args` (cli-arg mode).** When the effective
`promptStyle` is `cli-arg` and the agent's `mode` is `single-prompt`,
the runner SHALL auto-append `[promptFlag, resolvedPrompt]` to
`args` (or `[resolvedPrompt]` alone when the runtime declares no
`promptFlag`) so a CLI like Claude Code receives its prompt on the
command line. The injection SHALL be gated by two conditions:

- The user's `args` MUST NOT already contain the effective
  `promptFlag` (default `-p`). If it does, the user has hand-inlined
  the prompt and injection is skipped to avoid double-delivery.
- EITHER the prompt was set explicitly at the agent or runtime level
  (via `agent.prompts.<role>` or `runtimes.<name>.prompts.<role>`)
  OR the agent references a runtime (whose `baseArgs` represent an
  incomplete recipe the runner is expected to complete with the
  prompt). Command-only agents with NO explicit `prompts` map and
  no runtime reference are treated as fully hand-authored — the
  runner leaves their `args` alone even when a built-in per-role
  default would resolve to a value.

This gate preserves the pre-reshape "legacy escape hatch" for
agents whose `args` field already contains their complete argv,
while ensuring that migrating an existing agent from
`initialInput: "…"` to `prompts.<role>: "…"` continues to deliver
the prompt through the same `-p` mechanism.

#### Scenario: cli-arg mode auto-injects when prompt is explicit
- **GIVEN** an agent `{ command: claude, args: [--dangerously-skip-permissions], mode: single-prompt, roles: [code], prompts: { code: "/opsx:apply ${change_id}" } }`
- **WHEN** the runner resolves the agent for change `add-foo`
- **THEN** the effective args are `[--dangerously-skip-permissions, -p, /opsx:apply add-foo]`

#### Scenario: cli-arg mode auto-injects for runtime-referenced agents
- **GIVEN** an agent `{ runtime: claude, mode: single-prompt, roles: [code] }` where the runtime declares `baseArgs: [--dangerously-skip-permissions]` and `promptFlag: -p` and no `prompts` map
- **WHEN** the runner resolves the agent for change `add-foo`
- **THEN** the effective args are `[--dangerously-skip-permissions, -p, /opsx:apply add-foo]` (built-in default fires because runtime is the "recipe holder")

#### Scenario: cli-arg mode skips injection when args already inline the prompt
- **GIVEN** an agent `{ command: claude, args: [--dangerously-skip-permissions, -p, /opsx:apply ${change_id}], mode: single-prompt, roles: [code] }` with no `prompts` map
- **WHEN** the runner resolves the agent for change `add-foo`
- **THEN** the effective args are `[--dangerously-skip-permissions, -p, /opsx:apply add-foo]` (no double-injection; user hand-inlined the prompt)

#### Scenario: cli-arg mode skips injection for command-only agents without explicit prompts
- **GIVEN** an agent `{ command: claude, args: [/opsx:apply, ${change_id}], mode: single-prompt, roles: [review] }` with no `prompts` map and no runtime reference
- **WHEN** the runner resolves the agent for change `add-foo`
- **THEN** the effective args are `[/opsx:apply, add-foo]` (built-in default for `review` does NOT auto-inject because the agent is command-only and provides no explicit `prompts`)

#### Scenario: agent-level prompt wins over runtime and default
- **GIVEN** an agent with `runtime: claude` and `prompts.code: "/custom-flow ${change_id}"`
- **AND** the runtime `claude` has `prompts.code: "/opsx:apply ${change_id}"`
- **WHEN** the client dispatches `{ role: "code", changeId: "add-foo" }`
- **THEN** the resolved prompt is `/custom-flow add-foo`

#### Scenario: runtime prompt used when agent omits override
- **GIVEN** an agent with `runtime: claude` and no `prompts` map
- **AND** the runtime `claude` has `prompts.review: "/opsx:review ${change_id}"`
- **WHEN** the client dispatches `{ role: "review", changeId: "add-foo" }`
- **THEN** the resolved prompt is `/opsx:review add-foo`

#### Scenario: built-in default used when no override at any level
- **GIVEN** an agent with no `runtime` reference and no `prompts` map
- **WHEN** the client dispatches `{ role: "verify", changeId: "add-foo" }`
- **THEN** the resolved prompt is `/opsx:verify add-foo`

#### Scenario: role other requires explicit prompt
- **GIVEN** an agent with `roles: [other]` and no `prompts.other`
- **WHEN** the client dispatches `{ role: "other", changeId: "add-foo" }`
- **THEN** the dispatch fails with a "no prompt configured for role other" error

### Requirement: Agents Config Modal Layout Ergonomics

The AgentConfigModal SHALL adapt its layout to the entry being edited
and to the size of the containing viewport so users can complete the
form without hunting for irrelevant controls or scrolling behind the
Save button.

**Name field removed — auto-generated.** The Modal SHALL NOT expose
`name` as a user-editable input, because the value is fixed once
saved (rename is not supported through the UI). Instead:

- **Edit mode** — the modal title reads `Edit agent — <name>`; `name`
  is preserved from the seed and never mutated by the form.
- **Add mode + Manager** — `name` is force-set to the literal `manager`
  on submit (Manager is a singleton; no collision is possible).
- **Add mode + Worker** — `name` is derived from the current form
  state via a client-side auto-namer: base is the `runtime` value
  when set, else the `command` basename (extension stripped, kebab-
  cased), else the sole role, else the literal `agent`. When the
  agent has a single role that differs from the base, `-<role>` is
  appended. Collisions against existing agent names are resolved by
  appending `-2`, `-3`, ... until unique. The modal title displays
  the pending auto-name as `Add agent — <auto-name>` so the user
  sees what will be saved.

**Manager-specific field visibility.** When the entry's `roles`
contains `manager`, the Modal SHALL hide the fields whose values are
fixed for Manager entries and cannot be usefully changed:

- The **Roles** multi-select SHALL be hidden; `roles` is force-set to
  `["manager"]` on submit.
- The **Mode** toggle SHALL be hidden; `mode` is force-set to
  `"live-shell"` on submit.
- The **Runtime** dropdown SHALL be hidden; Manager entries never
  inherit from a `runtimes:` block (the interactive PTY session
  doesn't compose meaningfully with shared-defaults inheritance).
- **Specialties**, **Concurrency**, and **Dedicated** SHALL be hidden;
  they are force-set to `[]`, `1`, and `true` respectively on submit
  because Manager is a singleton PTY that doesn't participate in
  dispatch routing, concurrency limits, or worktree pools.
- A **Manager** tag SHALL appear next to the modal title so the user
  can see at a glance that they're editing the Manager row.
- The Prompts fieldset SHALL render as singular ("Prompt") with a
  Manager-specific hint ("typed into the PTY after Manager boots").

Worker entries (any `roles` without `manager`) SHALL render all
fields normally.

**Advanced options — collapsible.** The Modal SHALL group the
non-essential fields (Runtime, Specialties, Concurrency, Dedicated,
Description) behind a `[▸ Advanced options]` disclosure. The section
SHALL start **collapsed** on Add mode and on Edit-mode entries whose
Advanced fields all hold their defaults. When any of those fields
holds a non-default value at open time, the section SHALL start
**expanded** so the user sees what they're editing. The disclosure
toggle SHALL preserve the current form state across expand / collapse
transitions (no field reset).

**Scroll.** The Modal SHALL cap its height at `90vh` and SHALL make
its form body scrollable. The Modal title and the Cancel / Save
action row SHALL remain pinned (non-scrolling) so the user can
always dismiss or submit without scrolling.

#### Scenario: Edit-mode title shows the fixed name
- **GIVEN** the user clicks Edit on an agent named `claude-worker`
- **WHEN** the Modal renders
- **THEN** the title reads `Edit agent — claude-worker`
- **AND** no editable input for `name` appears in the form

#### Scenario: Manager Add force-sets name to "manager"
- **GIVEN** the Manager section shows `[Declare in agents.yaml]` because no Manager exists
- **WHEN** the user clicks the shortcut and clicks Save on the Modal
- **THEN** the payload sent to `/api/agents/config` has `name: "manager"`

#### Scenario: Worker Add derives name from command + role
- **GIVEN** the user clicks `+ Add agent`, types `claude` into command, and keeps `roles: [code]`
- **WHEN** the Modal renders
- **THEN** the title reads `Add agent — claude-code`
- **AND** clicking Save sends `name: "claude-code"` in the payload

#### Scenario: Worker Add uses runtime when set
- **GIVEN** the user picks runtime `aider` and roles `[code]`
- **WHEN** the Modal renders
- **THEN** the title reads `Add agent — aider-code`

#### Scenario: Worker Add omits role suffix when base equals role
- **GIVEN** the user leaves command empty and picks runtime `code` with roles `[code]`
- **WHEN** the Modal renders
- **THEN** the title reads `Add agent — code` (no `-code` suffix)

#### Scenario: Auto-namer resolves collisions with numeric suffix
- **GIVEN** an agent named `claude-code` already exists
- **AND** the user starts Adding a new agent that would auto-name to `claude-code`
- **WHEN** the Modal renders
- **THEN** the title reads `Add agent — claude-code-2`

#### Scenario: Manager Modal hides worker-only fields
- **GIVEN** the user opens the Modal on the existing Manager entry (or via the Manager section's `[Declare in agents.yaml]` shortcut)
- **WHEN** the Modal renders
- **THEN** the Roles multi-select, Mode toggle, Runtime dropdown, Specialties input, Concurrency input, and Dedicated checkbox are ALL absent from the visible form
- **AND** a "MANAGER" tag appears next to the modal title
- **AND** the Prompts fieldset legend reads "Prompt" (singular) with a manager-specific hint

#### Scenario: Manager Modal submits with fixed values
- **GIVEN** the Manager Modal is open with only Name, Command, Args, and Prompt visible
- **WHEN** the user fills in `name: primary`, `command: claude`, `args: --continue`, `prompt: /opsx:manage`, and clicks Save
- **THEN** the payload sent to `/api/agents/config` includes `roles: ["manager"]`, `mode: "live-shell"`, `specialties: []`, `concurrency: 1`, `dedicated: true`
- **AND** the payload does NOT include a `runtime` field

#### Scenario: Worker Modal shows all fields
- **GIVEN** the user opens the Modal on a worker entry with `roles: [code]`
- **WHEN** the Modal renders
- **THEN** the Roles multi-select, Mode toggle, and (inside the Advanced disclosure) Runtime, Specialties, Concurrency, Dedicated, and Description are all present

#### Scenario: Advanced options start collapsed on Add mode
- **GIVEN** the user clicks `+ Add agent` (no existing agent seed)
- **WHEN** the Modal renders
- **THEN** the Advanced options section is collapsed; only its `[▸ Advanced options]` toggle is visible

#### Scenario: Advanced options auto-expand for non-default edits
- **GIVEN** an existing agent has `specialties: [area/web]` (a non-default value)
- **WHEN** the user opens the Modal via Edit on that row
- **THEN** the Advanced options section renders expanded so the specialties field is visible on open

#### Scenario: Advanced options toggle preserves state
- **GIVEN** the Advanced options section is expanded and the user has typed `concurrency: 3`
- **WHEN** the user clicks the toggle to collapse, then clicks it again to expand
- **THEN** the concurrency input still reads `3` (state is not reset by the toggle)

#### Scenario: Modal scrolls when content exceeds viewport
- **GIVEN** the user opens the Modal on a tall viewport where all fields fit at once
- **WHEN** the viewport is resized short enough that the fields would overflow
- **THEN** the Modal title stays pinned at the top and the Cancel / Save row stays pinned at the bottom
- **AND** the middle form section becomes scrollable so every field remains reachable

### Requirement: Agents Config Live Updates

The server SHALL broadcast an `agents-updated` WebSocket event
whenever the agent registry reloads due to a file-system change to
`agents.yaml`. The event payload SHALL carry the fresh
`publicConfig()` result (agents list, runtimes map, load-time
warnings) so subscribed clients can update their store without
issuing a separate `GET /api/agents/config` request.

Event shape:

```
{ type: "agents-updated",
  agents: AgentPublic[],
  runtimes: Record<string, RuntimeDef>,
  warnings: string[] }
```

The broadcast SHALL be debounced by at least 100 ms so an atomic
`.tmp → rename` write from an external editor (which can fire
multiple `fs.watch` events per save) produces exactly one broadcast.

The `POST /api/agents/config` handler's existing synchronous
`agentRegistry.load()` (added by `fix: reload agent registry
synchronously after config write`) SHALL be preserved. It handles
the UI-driven Save flow where the client's immediate `loadAgents()`
after Save must see the fresh state via the HTTP round-trip. The
new broadcast fires additionally when `fs.watch` picks up the write
moments later; the redundant client update is idempotent.

The client (`web/src/store.ts`) SHALL subscribe to the new event
and apply the payload to the store's `agents`, `runtimes`, and
`agentConfigError` fields directly. No separate refetch is
required.

#### Scenario: External editor edit triggers broadcast
- **GIVEN** a client has an open WebSocket subscription and is showing the Agents tab
- **WHEN** a user edits `agents.yaml` in an external editor and saves
- **THEN** within 200 ms the client receives an `agents-updated` event with the fresh `agents` list
- **AND** the Agents tab (and Manager section) re-renders with the new state without a page reload

#### Scenario: Modal Save triggers both the HTTP reload and the broadcast
- **GIVEN** a client has an open WebSocket subscription
- **WHEN** the user Saves the Agent config Modal
- **THEN** the `POST /api/agents/config` response contains the fresh state (via `agentRegistry.load()` in the handler)
- **AND** the client's `handleSave` calls `loadAgents()`, which sees the fresh state on the immediate `GET`
- **AND** the client ALSO receives an `agents-updated` broadcast within ~100–200 ms as `fs.watch` fires — the second update is idempotent

#### Scenario: Debounce collapses multiple fs.watch events into one broadcast
- **GIVEN** an atomic write pattern (`.tmp` then `rename`) that fires two `fs.watch` events in quick succession
- **WHEN** both events arrive within the 100 ms debounce window
- **THEN** exactly one `agents-updated` broadcast is sent

#### Scenario: Malformed edit still broadcasts with error state
- **GIVEN** a user hand-edits `agents.yaml` into invalid YAML
- **WHEN** the reload attempts and fails
- **THEN** an `agents-updated` broadcast is sent with the last-known-good `agents` / `runtimes` PLUS the parse error surfaced in the `warnings` array (or via the existing `ok: false / error` shape from `publicConfig`)
- **AND** the client sees the error banner without needing to remount the tab

### Requirement: Manager Agent Listed With Other Agents

The Agents tab SHALL treat an agent with `roles: [manager]` as a
regular Configured row (same rendering as workers). The tab SHALL NOT
render a dedicated Manager section, and the server SHALL NOT expose
`GET /api/manager-status`.

The Terminal panel's PTY-startup routing (per
`add-manager-agent-config`) SHALL remain — the Manager agent
declaration in `agents.yaml` still drives what Terminal auto-launches
— only the visual special-casing on the Agents tab is removed.

#### Scenario: Manager appears in the Configured list
- **GIVEN** `agents.yaml` declares an agent with `roles: [manager]` (e.g., `pptr`)
- **WHEN** the user opens the Agents tab
- **THEN** the Manager agent renders as a row in the Configured (idle) section, indistinguishable from worker agents apart from its `mode: live-shell` badge and `manager` role badge

#### Scenario: `/api/manager-status` returns 404
- **WHEN** a client GETs `/api/manager-status`
- **THEN** the server responds 404 (route is not registered)

### Requirement: Parallel Execution Config Flag

The system SHALL accept an optional top-level `parallelExecution:
boolean` field in `agents.yaml` (default `false` when absent). The
value SHALL be exposed to clients via the existing `GET
/api/agents/config` response payload.

#### Scenario: absent flag defaults to false
- **GIVEN** an `agents.yaml` without a `parallelExecution` key
- **WHEN** `GET /api/agents/config` responds
- **THEN** the response includes `parallelExecution: false`

#### Scenario: true is round-tripped
- **GIVEN** an `agents.yaml` containing `parallelExecution: true`
- **WHEN** the registry loads
- **THEN** `GET /api/agents/config` returns `parallelExecution: true`

#### Scenario: non-boolean value rejected
- **GIVEN** an `agents.yaml` with `parallelExecution: "maybe"`
- **WHEN** the registry loads
- **THEN** the load reports `parallelExecution must be a boolean` in the config error banner

### Requirement: Settings Tab

The dashboard SHALL expose a `Settings` tab in the top navigation,
routed at `/settings`, that renders a small form for user-editable
config. The form SHALL include, at minimum, a `Parallel execution`
checkbox bound to the `parallelExecution` config value. Toggling the
checkbox SHALL persist through `POST /api/config/parallel-execution`
and broadcast an `agents-updated` event so other tabs see the fresh
value.

#### Scenario: toggle persists
- **GIVEN** `parallelExecution: false` in `agents.yaml`
- **WHEN** the user opens `/settings` and toggles Parallel execution to on
- **THEN** `agents.yaml` on disk contains `parallelExecution: true` and other keys are unchanged

#### Scenario: broadcast propagates
- **WHEN** a client posts `/api/config/parallel-execution` with `{ value: true }`
- **THEN** the server writes the file AND emits an `agents-updated` WS event carrying the new config

#### Scenario: non-local origin rejected
- **WHEN** a non-local address posts `/api/config/parallel-execution`
- **THEN** the server responds 403

### Requirement: Start Flow Delegates Execution To Skill Layer

The Kanban Start button and the ChangeDetail Start button SHALL
inject `/ithy-opsx:dispatch <change-id>` into the embedded terminal
without opening any picker, agent-selection modal, or worktree spawn
from the UI. The UI SHALL NOT read `parallelExecution` to make its
own execution-mode decision — that lives in the skill layer.

**Lock-based gate** (new): the UI SHALL read `state.lock`
(broadcast by the server) and, when `parallelExecution === false`
AND the lock is held by a different change than the one being
started, gate the Start button:

- The Start button is disabled with tooltip `Change <held-change> is
  currently running. Merge or discard it first.`
- No inject happens on click.

When the lock is held by the same change being started, the Start
button acts as an **Attach**: it re-injects `/ithy-opsx:dispatch
<change-id>` (the dispatcher is idempotent — it re-enters at the
current phase per its restart-recovery guarantee).

The UI SHALL NOT gate on `agents.yaml` contents beyond the lock.
Empty agents.yaml is handled by the dispatcher's Manager fallback
(no UI gate needed).

Only one prerequisite failure SHALL surface as a toast notification
from the UI: embedded terminal unavailable → `No embedded terminal
— open a change view to spawn one`.

#### Scenario: Start injects dispatch invocation
- **GIVEN** the embedded terminal is available, `parallelExecution: true`, and no lock held
- **WHEN** the user clicks Start on `change-A`
- **THEN** the flow injects `/ithy-opsx:dispatch change-A` into the terminal

#### Scenario: parallelExecution false, no lock — normal dispatch
- **GIVEN** `parallelExecution: false` and no lock held
- **WHEN** the user clicks Start on `change-A`
- **THEN** the flow injects normally; the dispatcher will acquire the lock during its own execution

#### Scenario: parallelExecution false, lock held by another change — Start disabled
- **GIVEN** `parallelExecution: false` and `state.lock: { change: "change-A" }`
- **WHEN** the user views `change-B`'s Start button
- **THEN** the button is disabled with tooltip `Change change-A is currently running. Merge or discard it first.`

#### Scenario: parallelExecution false, lock held by same change — Attach
- **GIVEN** `parallelExecution: false` and `state.lock: { change: "change-A" }`
- **WHEN** the user clicks Start on `change-A` again (e.g., after PTY died)
- **THEN** the flow re-injects `/ithy-opsx:dispatch change-A`; the dispatcher's restart-recovery detects the current phase and continues from there

#### Scenario: no embedded terminal surfaces as toast
- **GIVEN** the embedded terminal is unavailable
- **WHEN** the user clicks Start
- **THEN** a toast reports "No embedded terminal — open a change view to spawn one" and no injection occurs

#### Scenario: empty agents.yaml does not gate UI
- **GIVEN** `agents.yaml` empty (`agents: []`)
- **WHEN** the user clicks Start
- **THEN** the UI still injects `/ithy-opsx:dispatch <id>` — the dispatcher resolves the fallback to Manager self-dispatch

### Requirement: Repo-Level Agent Instructions Files

The repository SHALL contain two instructions files at the repository
root so non-Claude CLIs invoked as workers receive the same project
contract that Claude Code receives via `CLAUDE.md`:

- `.github/copilot-instructions.md` — automatically loaded by Copilot
  CLI when it starts in the repo.
- `AGENTS.md` — read by Antigravity (`agy`) and any future
  CLI-agnostic agent runner that scans repo-root instruction files.

Each file SHALL document the code / review / verify worker contracts:

- Location of change files (`openspec/changes/<change-id>/`).
- **Code role**: implement outstanding tasks in the current worktree,
  commit on the agent branch, do NOT touch files outside the change's
  scope, do NOT modify `main` directly.
- **Review role**: write `openspec/changes/<change-id>/review.md` with
  frontmatter `verdict: pass | needs-rework` and `findings: [...]`.
  Do NOT emit the verdict on stdout; the file is the sole contract.
- **Verify role**: same output contract as review (updates
  `review.md`).

`CLAUDE.md` already covers Claude behavior and SHALL NOT be duplicated
into these files — the two new files exist to bridge the vendor gap
Claude does not have.

> **Phase 2 requirement** — captured here as future contract; impl
> lands in a follow-up change together with the Manager loop and
> `/opsx:apply` skill rewrites.

#### Scenario: copilot-instructions file present
- **GIVEN** the file `.github/copilot-instructions.md`
- **WHEN** Copilot CLI starts in the repo root
- **THEN** it reads the file and adopts the code / review / verify worker contract described therein

#### Scenario: AGENTS.md present
- **GIVEN** the file `AGENTS.md` at the repository root
- **WHEN** Antigravity or another CLI-agnostic agent runner reads it
- **THEN** the same contract is available under the agent-runner-neutral filename

#### Scenario: review.md is the sole contract
- **GIVEN** a non-Claude CLI invoked for the review role
- **WHEN** the CLI completes with any stdout output
- **THEN** the Manager ignores stdout and reads only `openspec/changes/<change-id>/review.md`, escalating when the file is absent or unparseable

### Requirement: Dispatch Slash Command

The `/ithy-opsx:dispatch <change-id>` slash command SHALL exist as a
prompt template at `.claude/commands/ithy-opsx/dispatch.md`. It is
evaluated by the persistent Manager (a `claude` live-shell session
declared in `agents.yaml` with `roles: [manager]`) when the Kanban
Start button injects the string into the terminal PTY.

> ⚠️ **PENDING MODIFIED** by [thread-model-arg-through-agmsg-spawn](../../changes/thread-model-arg-through-agmsg-spawn/): agmsg branch を修正し `entry.args` から `--model <id>` を抽出して spawn CLI に thread する。

The skill SHALL:

1. Read `agents.yaml` top-level `parallelExecution: boolean` (default
   `false`) and the change's `proposal.md` frontmatter `execution:`
   override (`worktree` / `terminal`). Priority: per-change override
   > `parallelExecution` config > default `false`.
2. When the resolved mode is worktree: ensure `.worktrees/<change-id>/`
   exists (`git worktree add -b agent/<change-id>
   .worktrees/<change-id> HEAD`, guarded by `if [ ! -d ]` for
   idempotence). All subsequent worker invocations run with that
   worktree as `cwd`.
3. **When `parallelExecution === false`, before creating the worktree
   in step 2 above, acquire the `.worktrees/.lock` semaphore per the
   `Worktree Concurrency Semaphore` requirement.** If the lock is
   held by another change whose worktree still exists, escalate
   without creating a worktree.
4. Advance the change through `proposed → coded → reviewed → done`
   by dispatching workers in stages (code → review → verify), using
   the Dispatch helper protocol below and the 3-stage success
   contract for review/verify.
5. On verify `pass` (phase → done), release the `.worktrees/.lock`
   semaphore.
6. On any escalate path, release the `.worktrees/.lock` semaphore
   before exiting.

**Dispatch helper protocol** SHALL branch on the resolved worker
entry in the following priority order:

1. **`entry.mode == "live-shell"` AND `agents.yaml` contains a valid
   `agmsg` block** (see `Agmsg Config Block In agents.yaml`) — invoke:

   ```
   /agmsg spawn <agmsg-type> <entry.name> --boot-prompt "<resolved-prompt>"
   ```

   Where `<agmsg-type>` is derived from `entry.command` via this
   fixed mapping: `claude → claude-code`, `codex → codex`,
   `copilot → copilot`, `gemini → gemini`,
   `antigravity → antigravity`, `opencode → opencode`,
   `cursor → cursor`. Any other `entry.command` SHALL escalate with
   `agmsg-type unknown for command: <cmd>` without dispatching.

   Before entering this branch, the skill SHALL verify agmsg's
   scripts exist at `~/.agents/skills/agmsg/scripts/send.sh`
   (presence check only). When absent, it SHALL fall through to
   the branches below and note "agmsg configured but not installed
   locally; falling back to non-agmsg dispatch" in its stdout so
   the user can install agmsg if desired.

2. **`entry.command == "claude"`** (Manager self-dispatch or a
   `mode: single-prompt` claude worker) — invoke the **Task tool**
   with the resolved prompt.

3. **Otherwise** — run as a **subprocess** using Bash with
   `<entry.command> <entry.args...> -p "<resolved-prompt>"` from the
   worker's `cwd` (worktree root when applicable).

**3-stage success contract** SHALL be applied per branch:

- The **agmsg branch** returns as soon as the peer is listening.
  Success is judged by artifact only:
  - `code` stage: poll `git log agent/<change-id>` for a new commit
    (5s interval, 15 min ceiling). Timeout → escalate `code stage
    agmsg worker did not commit within timeout`.
  - `review` / `verify` stages: poll `openspec/changes/<change-id>/
    review.md` for existence + parseable `verdict:` frontmatter (5s
    interval, 5 min ceiling). Timeout → escalate `<stage> agmsg
    worker did not produce review.md within timeout`.
- The **Task tool** and **subprocess** branches retain the current
  contract: subprocess non-zero exit → subprocess failure;
  subprocess exit 0 + review.md absent → contract failure;
  review.md present with parseable `verdict:` → route on
  `pass` / `needs-rework`.

Manager (`roles` includes `manager`) is never dispatched through
the agmsg branch — the Manager runs in tmux pane 0 (per `Embedded
PTY Uses tmux When Agmsg Is Configured`); its `/agmsg spawn` calls
are what land workers in adjacent panes.

MAX_ITERATIONS remains 5 for the code↔review loop. All other
existing behavior is retained.

#### Scenario: parallelExecution false — lock acquired before worktree
- **GIVEN** `parallelExecution: false` and no `.worktrees/.lock`
- **WHEN** the dispatcher runs for `change-A`
- **THEN** it writes the lock first, then creates `.worktrees/change-A/`

#### Scenario: parallelExecution false — lock held blocks dispatch
- **GIVEN** `parallelExecution: false` and `.worktrees/.lock` held by `change-A` with `.worktrees/change-A/` present
- **WHEN** the dispatcher runs for `change-B`
- **THEN** the dispatcher escalates with `Another change (change-A) is currently running.` and no `.worktrees/change-B/` is created

#### Scenario: verify pass releases lock
- **GIVEN** the dispatcher completes verify with `verdict: pass` under `parallelExecution: false`
- **WHEN** phase transitions to done
- **THEN** `.worktrees/.lock` is deleted

#### Scenario: escalation releases lock
- **GIVEN** the dispatcher escalates for any reason under `parallelExecution: false`
- **WHEN** the escalation runs
- **THEN** `.worktrees/.lock` is deleted before exit

#### Scenario: agmsg branch takes priority for live-shell workers
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND a worker entry `{ name: peer, mode: live-shell, command: codex, roles: [review] }`
- **AND** agmsg scripts exist at `~/.agents/skills/agmsg/scripts/send.sh`
- **WHEN** the dispatcher runs the review stage
- **THEN** it invokes `/agmsg spawn codex peer --boot-prompt "/ithy-opsx:review <change-id>"` (not the subprocess branch, not the Task tool)

#### Scenario: agmsg branch skipped for single-prompt workers
- **GIVEN** `agents.yaml` has an `agmsg:` block AND a worker entry `{ name: coder, mode: single-prompt, command: claude, roles: [code] }`
- **WHEN** the dispatcher runs the code stage
- **THEN** it takes the Task tool branch (mode is single-prompt, not live-shell); no `/agmsg spawn` is invoked

#### Scenario: agmsg branch escalates on unknown command
- **GIVEN** `agents.yaml` has an `agmsg:` block AND a worker entry `{ name: custom, mode: live-shell, command: my-wrapper, roles: [review] }`
- **WHEN** the dispatcher reaches the review stage
- **THEN** it escalates with `agmsg-type unknown for command: my-wrapper` and does NOT dispatch

#### Scenario: agmsg missing locally falls through
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND a live-shell worker
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` does NOT exist (agmsg not installed)
- **WHEN** the dispatcher reaches the stage
- **THEN** it logs "agmsg configured but not installed locally; falling back to non-agmsg dispatch" and takes the Task tool or subprocess branch as if no `agmsg:` block were present

#### Scenario: agmsg branch code stage waits for commit
- **GIVEN** an agmsg-routed code dispatch has been sent via `/agmsg spawn --boot-prompt`
- **WHEN** the dispatcher polls
- **THEN** it checks `git log agent/<change-id>` every 5 seconds; a new commit signals stage success and phase advances to `coded`

#### Scenario: agmsg branch review stage waits for review.md
- **GIVEN** an agmsg-routed review or verify dispatch has been sent via `/agmsg spawn --boot-prompt`
- **WHEN** the dispatcher polls
- **THEN** it checks `openspec/changes/<change-id>/review.md` every 5 seconds; presence + parseable `verdict:` frontmatter signals stage completion and routes on `pass`/`needs-rework`

#### Scenario: agmsg branch escalates on code timeout
- **GIVEN** an agmsg-routed code dispatch that has not produced a new commit on `agent/<change-id>` after 15 minutes
- **WHEN** the ceiling elapses
- **THEN** the dispatcher escalates with `code stage agmsg worker did not commit within timeout`

#### Scenario: agmsg branch escalates on review timeout
- **GIVEN** an agmsg-routed review or verify dispatch that has not produced `review.md` after 5 minutes
- **WHEN** the ceiling elapses
- **THEN** the dispatcher escalates with `<stage> agmsg worker did not produce review.md within timeout`

### Requirement: Kanban Placement Is Folder-Driven

The Kanban `bucketize` algorithm SHALL classify each change into
TODO / IN-PROGRESS / DONE using **filesystem state only**, without
consulting the in-memory job registry. Placement order (first match
wins):

1. If `openspec/changes/archive/*-<change-id>/` exists → **DONE**.
2. If `.worktrees/<change-id>/openspec/changes/<change-id>/tasks.md`
   exists AND all its checkboxes are ticked → **DONE**.
3. If `.worktrees/<change-id>/` exists → **IN-PROGRESS**.
4. If main-tree `openspec/changes/<change-id>/tasks.md` exists AND
   all checkboxes are ticked → **DONE**.
5. If main-tree progress `done > 0` → **IN-PROGRESS**.
6. Else → **TODO**.

The dashboard SHALL read a change `X`'s progress from
`.worktrees/X/openspec/changes/X/tasks.md` when the worktree exists,
otherwise from main-tree `openspec/changes/X/tasks.md`. The
dashboard SHALL NOT read change `X`'s tasks.md from a different
change's worktree (`.worktrees/Y/openspec/changes/X/tasks.md`) —
that copy is frozen at the time `Y`'s worktree was created and does
not reflect `X`'s live state.

Placement decisions SHALL use `fs.stat` and `fs.readFile` only —
NOT `git status`, `git log`, or any other subprocess-git call —
because git subprocess overhead compounds across cards on every
render.

Live updates SHALL propagate via a chokidar watcher over the
`.worktrees/*/openspec/changes/*/tasks.md` glob. On tasks.md
change, the server SHALL emit a `worktree-progress-updated` WS
event carrying the new progress; the store applies it to the
matching `Change`'s `worktree.tasksProgress`.

#### Scenario: worktree exists → IN-PROGRESS
- **GIVEN** `.worktrees/add-dummy-tab/` exists but not all tasks are ticked in its tasks.md
- **WHEN** the Kanban renders
- **THEN** the `add-dummy-tab` card appears in the IN-PROGRESS column

#### Scenario: worktree all-done → DONE
- **GIVEN** `.worktrees/add-dummy-tab/openspec/changes/add-dummy-tab/tasks.md` has every checkbox ticked
- **WHEN** the Kanban renders
- **THEN** the card appears in the DONE column

#### Scenario: worktree missing, main-tree partial → IN-PROGRESS
- **GIVEN** no `.worktrees/add-dummy-tab/`, main-tree tasks.md has 5/10 ticked
- **WHEN** the Kanban renders
- **THEN** the card appears in the IN-PROGRESS column

#### Scenario: no worktree, main-tree untouched → TODO
- **GIVEN** no `.worktrees/add-dummy-tab/`, main-tree tasks.md has 0/10 ticked
- **WHEN** the Kanban renders
- **THEN** the card appears in the TODO column

#### Scenario: archived → DONE
- **GIVEN** `openspec/changes/archive/2026-07-17-add-dummy-tab/` exists
- **WHEN** the Kanban renders
- **THEN** the card appears in the DONE column (archive short-circuits earlier checks)

#### Scenario: X's progress not read from Y's worktree
- **GIVEN** a change X with no worktree, and a different change Y whose worktree at `.worktrees/Y/openspec/changes/X/tasks.md` contains stale X data
- **WHEN** the dashboard resolves X's progress
- **THEN** it reads main-tree `openspec/changes/X/tasks.md` — not the frozen copy inside Y's worktree

#### Scenario: chokidar-driven live progress updates
- **GIVEN** the server is watching `.worktrees/*/openspec/changes/*/tasks.md`
- **WHEN** a task checkbox is flipped in `.worktrees/add-dummy-tab/openspec/changes/add-dummy-tab/tasks.md`
- **THEN** the server emits a `worktree-progress-updated` WS event; the client's `Change.worktree.tasksProgress` updates without a full state refetch

#### Scenario: no git subprocess in bucketize
- **GIVEN** N changes rendered in Kanban
- **WHEN** bucketize runs on each
- **THEN** no `git status`, `git log`, or other git subprocess is invoked; only `fs.stat` and (cached) tasks.md reads happen

### Requirement: Worktree Concurrency Semaphore

The system SHALL maintain a semaphore file at `.worktrees/.lock`
that gates concurrent dispatch when `agents.yaml.parallelExecution
=== false`. When `parallelExecution` is `true` (or absent, treated
as `false` per `add-parallel-execution-config`), the lock still
exists conceptually but does not prevent dispatch.

Wait — actually the lock's role is exclusively for the
`parallelExecution: false` case (single-tenant). When
`parallelExecution: true`, no lock is acquired or checked. This
requirement documents the `false` case.

**File format** (YAML):
```yaml
change: <change-id>
acquiredAt: <ISO-8601 timestamp>
pid: null | <process-id>
```

`pid` is `null` when the dispatcher spawned workers via Task tool
(no owning process), populated with the dispatcher's own PID when
the dispatcher runs as a subprocess (future-proof).

**Acquire** (dispatcher's step 4 worktree bootstrap, only when
`parallelExecution: false`):

1. Read `.worktrees/.lock`. If it does not exist → write the lock
   (change = current change id, acquiredAt = now, pid = null) and
   proceed to worktree setup.
2. If it exists:
   - Read its `change` field. If `.worktrees/<change>/` exists →
     escalate: `Another change (<held-change>) is currently
     running. Merge or discard it before starting another.`. Do NOT
     proceed with worktree setup.
   - If `.worktrees/<held-change>/` is missing → treat as **stale**,
     delete the lock, then write a fresh lock for the current
     change and proceed.

**Release** — three paths:

1. Dispatcher step 7 verify pass (phase → done) — delete the lock.
2. Any dispatcher escalate path — delete the lock (the dispatcher
   is done with this change, regardless of outcome).
3. Kanban's Merge / Discard action — after `git worktree remove` +
   `git branch -D` succeeds, if `.worktrees/.lock`'s `change` field
   matches the change being merged/discarded, delete the lock.

**Startup cleanup**: on server boot, read `.worktrees/.lock`. If it
exists but `.worktrees/<lock.change>/` does not, delete the lock
(stale from a previous crash).

The server SHALL expose the lock state via workspace state (`state.
lock: { change, acquiredAt } | null`) and broadcast a `lock-updated`
WS event when it changes.

#### Scenario: parallelExecution false, first dispatch acquires lock
- **GIVEN** `parallelExecution: false` and no `.worktrees/.lock`
- **WHEN** the dispatcher runs for `change-A`
- **THEN** the dispatcher writes `.worktrees/.lock` with `change: change-A` and proceeds to worktree setup

#### Scenario: parallelExecution false, second dispatch blocked
- **GIVEN** `parallelExecution: false` and `.worktrees/.lock` exists with `change: change-A`, `.worktrees/change-A/` exists
- **WHEN** the dispatcher runs for `change-B`
- **THEN** the dispatcher escalates with `Another change (change-A) is currently running. Merge or discard it before starting another.` and does NOT create `.worktrees/change-B/`

#### Scenario: stale lock (worktree missing) auto-cleared
- **GIVEN** `.worktrees/.lock` exists with `change: change-A` but `.worktrees/change-A/` does not exist
- **WHEN** the dispatcher runs for `change-B` (or any change)
- **THEN** the dispatcher deletes the stale lock, writes a fresh lock for the current change, and proceeds

#### Scenario: dispatch complete releases lock
- **GIVEN** the dispatcher is at step 7 with verify verdict `pass`
- **WHEN** the dispatcher posts `phase: done`
- **THEN** it deletes `.worktrees/.lock` before exiting

#### Scenario: dispatch escalation releases lock
- **GIVEN** the dispatcher escalates (any reason: worker failure, missing artifact, MAX_ITERATIONS)
- **WHEN** the escalation completes
- **THEN** `.worktrees/.lock` is deleted before the dispatcher exits

#### Scenario: Kanban merge/discard releases lock
- **GIVEN** `.worktrees/.lock` holds `change: change-A` and the user clicks Merge or Discard on change-A's card
- **WHEN** the merge/discard action completes (`git worktree remove` + `git branch -D`)
- **THEN** `.worktrees/.lock` is deleted

#### Scenario: server startup clears stale lock
- **GIVEN** server crashes with `.worktrees/.lock` set to `change: change-A` but `.worktrees/change-A/` was manually deleted
- **WHEN** the server restarts
- **THEN** startup routine detects the missing worktree and deletes the lock; `state.lock` broadcasts as `null`

#### Scenario: parallelExecution true — lock ignored
- **GIVEN** `parallelExecution: true`
- **WHEN** the dispatcher runs for any change
- **THEN** the lock file is not consulted (may or may not exist; irrelevant); multiple worktrees may exist concurrently

### Requirement: Error Display Convention

The dashboard SHALL surface errors through exactly three visual
categories, each with a dedicated CSS class:

1. **Async-action errors** — transient toasts anchored bottom-right.
   Displayed via `pushToast("error", <message>)`. Rendered as
   `.toast.error` (already exists; no rename). Auto-dismissed on
   click. Used for: Start button prerequisites, inject failures,
   lock-held gates, per-action failure messages.

2. **Load-time / server errors** — persistent inline banners.
   Rendered as `<div className="parse-error">⚠ <message></div>`.
   Used for: initial state load failure, `agents.yaml` parse
   error, `spec.md` parse error, diff-view load failure,
   modal-level server-returned errors. The markup convention
   (`<div>`, leading `⚠`, single class) SHALL be uniform — no
   `<p>` variants, no bare non-icon banners.

3. **Form-field validation** — inline text under the invalid
   input. Rendered as `.form-field-error`. Used for: any form
   input that fails client-side validation. All modals SHALL
   share this class — no per-modal variants like `.field-error`
   or `.agent-config-error`.

Any error message that appears at 2+ call sites SHALL be exported
as a constant from `web/src/lib/errorMessages.ts` (the `ERR`
object). Call sites SHALL reference the constant rather than
hard-coding the string, to prevent wording drift.

#### Scenario: async failure uses toast
- **GIVEN** a Start button click when the lock is held by another change
- **WHEN** the failure surfaces
- **THEN** a `.toast.error` appears bottom-right with the shared `ERR.LOCK_HELD(<change>)` message; the underlying flow does not open a modal

#### Scenario: load error uses parse-error banner
- **GIVEN** `agents.yaml` fails to parse
- **WHEN** the Agents tab renders
- **THEN** a `<div class="parse-error">⚠ agents.yaml: <details></div>` appears inline; no toast is used for the load-time error

#### Scenario: form validation uses form-field-error
- **GIVEN** the user submits AgentConfigModal with a blank `command` field
- **WHEN** the modal renders validation feedback
- **THEN** a `.form-field-error` element appears under the `command` input; `.field-error` and `.agent-config-error` classes are NOT used

#### Scenario: duplicated message uses ERR constant
- **GIVEN** two or more call sites need the same error text
- **WHEN** both refer to the message
- **THEN** they import the same constant from `web/src/lib/errorMessages.ts`; neither hard-codes the string

#### Scenario: modal server error banner
- **GIVEN** AgentConfigModal receives a server-side error on save
- **WHEN** the modal renders the failure
- **THEN** a `<div class="parse-error">⚠ <error></div>` appears; the deprecated `.agent-config-server-error` class is NOT used

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

### Requirement: Agmsg Config Block In agents.yaml

The `agents.yaml` top-level schema SHALL accept an optional `agmsg`
block. Absence of the block means agmsg is not configured (the
default; existing agents.yaml files are unaffected). When the block
is present, its shape SHALL be:

```yaml
agmsg:
  team: string       # required; non-empty
  storage: string    # optional; path to SQLite messages DB
```

Field rules:

- `team` — required whenever the block is present. Non-empty string.
  Names the agmsg team room that agents in this workspace join.
- `storage` — optional. Path to the SQLite messages DB, overriding
  agmsg's default (`~/.agents/skills/agmsg/db/messages.db`). Users
  wanting workspace-local isolation typically set this to something
  under `.worktrees/`.

The parsed block SHALL be exposed via `GET /api/agents/config` response's
`agmsg` field and mirrored to clients via the `agents-updated` WS event
payload. When the block is absent, both surface `null`. (The block is NOT
mirrored onto `WorkspaceState`; it stays on the AgentConfig surface,
mirroring how `parallelExecution` is exposed.)

An `agmsg` block whose `team` is missing or empty SHALL cause the
registry to return `ok: false` with a config error stating
`agmsg.team is required when the agmsg block is present`. The
existing agents-config error banner surfaces this message so users
see it in the dashboard.

This requirement establishes the config surface only. It does NOT
start any runtime (no tmux, no `agmsg` binary invocation), and does
NOT change `mode` values or dispatcher routing. Those are landed by
follow-up changes.

#### Scenario: block absent → state.agmsg is null
- **GIVEN** an `agents.yaml` without an `agmsg:` block
- **WHEN** the registry loads
- **THEN** `GET /api/agents/config` returns `agmsg: null` and the `agents-updated` WS payload also carries `agmsg: null`

#### Scenario: block present with team → populated
- **GIVEN** an `agents.yaml` with `agmsg: { team: "alpha" }`
- **WHEN** the registry loads
- **THEN** `GET /api/agents/config` returns `agmsg: { team: "alpha" }` (storage omitted) and the store client mirrors the same shape

#### Scenario: block present with team + storage → both populated
- **GIVEN** an `agents.yaml` with `agmsg: { team: "alpha", storage: ".worktrees/.agmsg.sqlite" }`
- **WHEN** the registry loads
- **THEN** `GET /api/agents/config` returns `agmsg: { team: "alpha", storage: ".worktrees/.agmsg.sqlite" }`

#### Scenario: block present without team → validation error
- **GIVEN** an `agents.yaml` with `agmsg: { storage: "..." }` and no `team` key
- **WHEN** the registry loads
- **THEN** the load returns `ok: false` with `error: "agmsg.team is required when the agmsg block is present"`; the dashboard renders the agents-config error banner with that message

#### Scenario: block present with empty team → validation error
- **GIVEN** an `agents.yaml` with `agmsg: { team: "" }`
- **WHEN** the registry loads
- **THEN** the load returns `ok: false` with the same `agmsg.team is required...` message

#### Scenario: agents.yaml config upsert preserves the block
- **GIVEN** an existing `agents.yaml` containing `agmsg: { team: "alpha" }` and an `agents:` list
- **WHEN** the user upserts an agent via `POST /api/agents/config`
- **THEN** the file is rewritten with the same `agmsg:` block intact — the writer preserves top-level keys it doesn't manage

#### Scenario: this change does not spawn any runtime
- **GIVEN** an `agents.yaml` with a valid `agmsg` block
- **WHEN** the workspace loads
- **THEN** no tmux process is started, no `agmsg` binary is invoked, and no message-routing behavior changes — the block is metadata only in this change

### Requirement: Embedded PTY Uses tmux When Agmsg Is Configured

The embedded PTY session SHALL wrap the resolved manager startup
command in a `tmux new-session` invocation whenever `agents.yaml`
includes a valid top-level `agmsg` block, and SHALL spawn the manager
command directly (pre-P2 behavior) when the block is absent.

The tmux-wrapped startup command SHALL take the shape:

```
tmux new-session -A -s <session-name> -- <managerCommand> <managerArgs...>
```

The `-A` flag SHALL cause tmux to attach to an existing session with
the given name if one is running (idempotent re-attach on WS
reconnect / dev reload). The session name SHALL default to `ithyno`;
when `ITHYNO_TMUX_SESSION` is set to a non-empty string in the
environment, that value SHALL be used instead. The `--` separator
SHALL be emitted between tmux's own flags and the wrapped command so
manager flags (`--continue`, `--resume`, etc.) are not misinterpreted
as tmux options.

The `initialInput` string (the Manager's declared first-message line
from `agents.yaml`) SHALL continue to be written to the PTY's stdin
after the startup command settles — tmux forwards stdin into pane 0's
foreground command so no extra plumbing is added.

When the `agmsg` block is present and the `tmux` binary is not on
`PATH`, the PTY SHALL open a raw shell that prints a banner naming
the missing dependency, the platform install hint, and a note that
removing the `agmsg:` block reverts to the direct-spawn path. The
WebSocket connection SHALL NOT close in this fallback — the user
retains a usable shell.

This requirement establishes tmux hosting only. It does NOT invoke
any `agmsg` binary, does NOT change dispatcher routing, and does NOT
open additional tmux panes for workers — those are landed by
follow-up changes P2b and P2c.

#### Scenario: agmsg block absent → direct spawn unchanged
- **GIVEN** an `agents.yaml` without an `agmsg:` block and a `role: manager` agent declared
- **WHEN** the Terminal panel opens a PTY
- **THEN** the PTY spawns the manager command directly (no tmux wrap), matching pre-P2 behavior
- **AND** the process tree does NOT contain `tmux`

#### Scenario: agmsg block present with tmux installed → tmux wrap
- **GIVEN** an `agents.yaml` containing `agmsg: { team: alpha }` and a `role: manager` agent whose command is `claude` and args are `[--continue]`
- **AND** the `tmux` binary is on `PATH`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line is `tmux new-session -A -s ithyno -- claude --continue`
- **AND** the manager's `initialInput` is written to the PTY after the tmux session bootstraps

#### Scenario: agmsg block present with tmux missing → fallback banner
- **GIVEN** an `agents.yaml` containing an `agmsg:` block
- **AND** the `tmux` binary is NOT on `PATH`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the PTY opens a raw shell that prints a banner including "tmux was not found on PATH", the platform install hint, and the "remove the agmsg: block to fall back" note
- **AND** the WS connection stays open (the user can Ctrl-C / type commands as normal)

#### Scenario: ITHYNO_TMUX_SESSION overrides the session name
- **GIVEN** `agents.yaml` contains an `agmsg:` block, `tmux` is installed, and the environment sets `ITHYNO_TMUX_SESSION=proj-a`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line uses `-s proj-a` (not `-s ithyno`)

#### Scenario: re-attach idempotence via `-A`
- **GIVEN** an `agmsg:`-configured workspace whose tmux session `ithyno` is already running (previous PTY closed but session was detached, not killed)
- **WHEN** the Terminal panel opens a new PTY
- **THEN** `tmux new-session -A -s ithyno` attaches to the existing session (does NOT error, does NOT create a duplicate); the user sees the same tmux state as before the disconnect

### Requirement: Electron First-Launch Auto-Installs Agmsg

The Electron shell SHALL vendor fujibee/agmsg (MIT-licensed shell
scripts) under `vendor/agmsg/` in the repository and package that
directory into `resources/app/vendor/agmsg/` via
`electron-builder`'s `extraResources`. On each launch, before the
main window is created, the shell SHALL run an `ensureAgmsgInstalled()`
step that checks for `$HOME/.agents/skills/agmsg/scripts/send.sh`.

When the file is absent AND the "never ask" marker
`$HOME/.ithyno-config/skip-agmsg-install` does NOT exist, the shell
SHALL display a modal dialog with three buttons:

- **Install** — copy the vendored tree from
  `resources/app/vendor/agmsg/` to `$HOME/.agents/skills/agmsg/`,
  preserving executable bits on `scripts/*.sh`. Log the copy result
  to stdout. Do NOT overwrite an existing target — the copy is only
  taken when the target directory is absent or empty.
- **Skip** — take no action this launch. The dialog reappears next
  launch until the user chooses Install or Never ask.
- **Never ask** — create `$HOME/.ithyno-config/skip-agmsg-install`
  (a zero-byte marker file); do NOT install. Subsequent launches
  SHALL skip the dialog and take no action.

When the file is present OR the "never ask" marker exists, the
shell SHALL take no action and proceed to `createWindowForProject`.
The dialog SHALL NOT block window creation on user hesitation for
more than the modal's own display time — after the user chooses a
button, the launch continues normally.

The CLI entry point (`bin/ithyno.js`) SHALL NOT run this step —
it is Electron-only. CLI users install agmsg manually via
`/plugin marketplace add fujibee/agmsg` in their Claude session.

The install path SHALL match the location the dispatcher skill's
presence check inspects (`~/.agents/skills/agmsg/scripts/send.sh`),
so a successful auto-install immediately makes the agmsg branch of
`Dispatch Slash Command` available without further configuration.

#### Scenario: fresh install → prompt appears, Install copies files
- **GIVEN** a fresh Electron install with no `~/.agents/skills/agmsg/` and no `~/.ithyno-config/skip-agmsg-install`
- **WHEN** the app launches
- **THEN** a modal dialog with Install / Skip / Never ask buttons appears BEFORE the main window
- **AND** clicking Install copies `resources/app/vendor/agmsg/` to `~/.agents/skills/agmsg/`
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` exists with executable bits set after the copy

#### Scenario: already installed → no prompt
- **GIVEN** an Electron install where `~/.agents/skills/agmsg/scripts/send.sh` already exists (installed via marketplace, or by a previous first-launch)
- **WHEN** the app launches
- **THEN** no dialog appears and the main window opens as usual

#### Scenario: never ask marker → no prompt on subsequent launches
- **GIVEN** the user previously clicked "Never ask" and `~/.ithyno-config/skip-agmsg-install` was created
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` is still absent
- **WHEN** the app launches
- **THEN** no dialog appears and no copy is taken; the main window opens as usual

#### Scenario: Skip → dialog appears again next launch
- **GIVEN** the user clicked "Skip" on a launch
- **WHEN** the app launches again with agmsg still not installed
- **THEN** the dialog reappears (Skip is a one-launch dismissal, not a persistent decline)

#### Scenario: CLI entry point does NOT auto-install
- **GIVEN** the user starts ithyno via `bin/ithyno.js` (CLI, not Electron)
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` is absent
- **WHEN** the server starts up
- **THEN** no dialog is shown, no copy is taken, and the CLI stdout does NOT mention agmsg install

#### Scenario: install preserves executable bits on scripts
- **GIVEN** the user clicks Install
- **WHEN** the copy from `resources/app/vendor/agmsg/scripts/` completes
- **THEN** every `.sh` file in `~/.agents/skills/agmsg/scripts/` has its executable bit set (`chmod 755` or equivalent)

#### Scenario: Windows launch skips the install step
- **GIVEN** the Electron app running on Windows
- **WHEN** the app launches
- **THEN** `ensureAgmsgInstalled()` returns early without displaying the dialog (the tmux/agmsg pipeline is not supported on Windows in this iteration)

