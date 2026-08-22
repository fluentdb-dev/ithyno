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

The dashboard SHALL surface authentication failures as a single full-page banner with a clear path back to a working session. Upon system wake-up or focus restoration (`visibilitychange` / `focus`), the dashboard SHALL automatically attempt session re-authorization (`checkAuth()`) and WebSocket reconnection before showing the fallback banner.

#### Scenario: System wake-up auto-recovery

- **WHEN** the browser window recovers from sleep or gains focus (`visibilitychange` to visible or `focus`)
- **THEN** the dashboard automatically runs `checkAuth()` and reconnects WebSocket connections
- **AND** if auth check succeeds, the workspace state is reloaded without user intervention

#### Scenario: Electron auto-reload on wake-up auth failure

- **GIVEN** the dashboard is running inside an Electron shell
- **WHEN** system wake-up occurs and auth check initially fails
- **THEN** the shell automatically attempts a single window reload to re-evaluate the local server session before showing the fallback banner

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

> ⚠️ **PENDING MODIFIED** by [unify-ithyno-slash-command-surface](../../changes/unify-ithyno-slash-command-surface/): the slash command is renamed `/opsx:escalate` → `/ithy-opsx:escalate` (file moves from `.claude/commands/opsx/escalate.md` → `.claude/commands/ithy-opsx/escalate.md`) as part of consolidating ithyno's slash-command surface under `/ithy-opsx:*`.

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

> ⚠️ **PENDING MODIFIED** by [unify-ithyno-slash-command-surface](../../changes/unify-ithyno-slash-command-surface/): the slash command is renamed `/opsx:answer` → `/ithy-opsx:answer` (file moves from `.claude/commands/opsx/answer.md` → `.claude/commands/ithy-opsx/answer.md`) as part of consolidating ithyno's slash-command surface under `/ithy-opsx:*`.

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
`mode` field SHALL control how the dispatcher routes the worker,
independent of whether the agent references a `runtime` or specifies
`command` directly.

- `single-prompt` — headless dispatch. The dispatcher's Task tool
  branch (for `claude` command) or subprocess branch (for
  everything else) delivers the resolved prompt via the CLI's
  `-p` flag (or equivalent), captures stdout, and waits for exit.
  Exit code plus `review.md` artifact form the completion contract
  (see `Review Artifact Schema`).

- `live-shell` — the routing depends on the agent's role AND on
  whether `agents.yaml` has a top-level `agmsg:` block:

  - **Worker (`roles` without `manager`), agmsg block present** —
    the dispatcher's agmsg branch spawns the worker in a fresh
    tmux pane via `/agmsg spawn`, injects the resolved prompt as
    the CLI's boot-prompt (with artifact + report contracts
    appended per `Dispatch Slash Command`), and waits for a
    `stage:<S> status:done` message from the worker via
    `inbox.sh` polling. Completion is signalled by the message,
    not by a child-process exit. `review.md` at the absolute
    target path names the verdict.

  - **Worker (`roles` without `manager`), agmsg block absent** —
    falls through to the Task tool branch (for `claude` command)
    or subprocess branch (otherwise), same as `single-prompt`.
    The mode value carries no semantic distinction from
    `single-prompt` in this state; it exists for forward
    compatibility with the agmsg-configured case.

  - **Manager (`roles` includes `manager`)** — spawned by the
    embedded Terminal panel's WebSocket handler
    (`attachPtyToSocket` in `server/sync/pty.ts`) which allocates
    a real PTY. When the workspace has an `agmsg:` block, the PTY
    wraps startup in `tmux new-session -A -s <session>` per
    `Embedded PTY Uses tmux When Agmsg Is Configured`. The
    dispatcher never routes to the Manager as a worker; the
    Manager IS the dispatcher.

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

#### Scenario: worker mode live-shell + agmsg block → agmsg spawn
- **GIVEN** `agents.yaml` has an `agmsg:` block AND a worker `{ name: peer, mode: live-shell, command: codex, roles: [review] }`
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` exists (agmsg installed)
- **WHEN** the dispatcher runs the review stage
- **THEN** the dispatcher takes the agmsg branch (per `Dispatch Slash Command`) and invokes `/agmsg spawn codex peer …` in a fresh tmux pane; completion is signalled by a `stage:review status:done` message from `peer`

#### Scenario: worker mode live-shell + no agmsg block → falls through
- **GIVEN** an agents.yaml with NO top-level `agmsg:` block and a worker `{ name: peer, mode: live-shell, command: codex, roles: [review] }`
- **WHEN** the dispatcher runs the review stage
- **THEN** it takes the subprocess branch (per `Dispatch Slash Command`'s fallthrough) — `codex … -p "<resolved-prompt>"` — same as if the entry were `mode: single-prompt`

#### Scenario: manager mode live-shell handled by Terminal panel
- **GIVEN** an agent with `roles: [manager]`, `mode: live-shell`, `command: claude`, `args: [--continue]`
- **WHEN** the user opens the embedded Terminal panel
- **THEN** `attachPtyToSocket` spawns a real PTY running `claude --continue` (wrapped in tmux when agmsg is configured) — separate from `runner.run()` and separate from the dispatcher's worker branches

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
config. The form SHALL include:

- A `Parallel execution` checkbox bound to the `parallelExecution`
  config value. Toggling SHALL persist through
  `POST /api/config/parallel-execution` and broadcast an
  `agents-updated` event so other tabs see the fresh value.
- An `Agmsg` section bound to the top-level `agmsg:` block from
  `agents.yaml`. The section SHALL include:
  - An **Enable** checkbox. When on, the `agmsg` block is present
    in `agents.yaml`. When off, the block is removed.
  - A **Team name** text input (required when Enable is on;
    non-empty).
  - An optional **Storage** text input (path to the SQLite DB;
    empty means "use the agmsg default at
    `~/.agents/skills/agmsg/db/messages.db`").
  - A **Save** button that posts the current form state to
    `POST /api/config/agmsg`.
- All persist paths SHALL broadcast the existing `agents-updated`
  WS event on success so other tabs (Agents, Kanban) see the
  fresh state; no new event type is introduced.

The form's source of truth for the agmsg values SHALL be the
client store's `state.agmsg` (populated by the WS broadcast); the
form draft SHALL reset to that value when the WS event arrives
after a successful Save.

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

#### Scenario: agmsg form enables and saves team
- **GIVEN** `agents.yaml` has no `agmsg:` block
- **WHEN** the user opens `/settings`, ticks Enable in the Agmsg section, enters `openspec-ui` as team, leaves storage empty, and clicks Save
- **THEN** the client calls `POST /api/config/agmsg { enabled: true, team: "openspec-ui" }` and the server writes the block
- **AND** the `agents-updated` WS event arrives with `agmsg: { team: "openspec-ui" }`
- **AND** the form re-reads that value; the Enable checkbox stays on and the team input shows `openspec-ui`

#### Scenario: agmsg form disables and removes block
- **GIVEN** `agents.yaml` currently has `agmsg: { team: openspec-ui }`
- **WHEN** the user unchecks Enable and clicks Save
- **THEN** the client calls `POST /api/config/agmsg { enabled: false }` and the server removes the block
- **AND** the form's team and storage inputs become empty and disabled

#### Scenario: agmsg form validation surfaces empty team
- **GIVEN** the user has Enable on but the team input is empty
- **WHEN** the user clicks Save
- **THEN** the client either disables Save (client-side guard) OR posts and the server responds 400; either way, `agents.yaml` on disk is not modified
- **AND** a toast surfaces the error message

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

> ⚠️ **PENDING MODIFIED** by [split-agent-timeout-semantics](../../changes/split-agent-timeout-semantics/): replace fixed per-stage ceilings with separate startup, first-activity, idle, hard-runtime, native, and artifact-grace timeout semantics.

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
4. **Manager registration guard.** When `agents.yaml` contains a valid
   `agmsg:` block, the skill SHALL idempotently register Manager in
   the team at dispatch start (before any worker spawn).

   The team name SHALL be extracted from `agents.yaml` using a
   POSIX-portable form (BSD sed on macOS rejects GNU sed's
   address-block `{...}` syntax). Recommended: awk.

   ```bash
   AGMSG_TEAM=$(awk '
     /^agmsg:/ { in_block=1; next }
     in_block && /^[^ ]/ { in_block=0 }
     in_block && /^  team:/ { sub(/^  team:[[:space:]]*/, ""); print; exit }
   ' agents.yaml)

   ~/.agents/skills/agmsg/scripts/join.sh "$AGMSG_TEAM" manager \
     claude-code "$(pwd)"
   ```

   `join.sh` is idempotent — safe to invoke when Manager is already
   registered. This closes the class of failure where prior cleanup
   operations dropped Manager's registration silently.

   Additionally, before each stage's spawn (code / review / verify),
   the skill SHALL verify Manager is still a team member via
   `team.sh` and re-invoke `join.sh` when Manager is absent. The
   check is cheap and defends against cross-stage drift.

   Portable extraction is normative: the skill SHALL NOT use GNU-
   only sed syntax (e.g. address-block `{}` in `-n` mode). Any
   `$AGMSG_TEAM` extraction inside the agmsg branch body SHALL
   also follow this rule.

5. Advance the change through `proposed → coded → reviewed → done`
   by dispatching workers in stages (code → review → verify), using
   the Dispatch helper protocol below and the 3-stage success
   contract for review/verify.
6. On verify `pass` (phase → done), release the `.worktrees/.lock`
   semaphore.
7. On any escalate path, release the `.worktrees/.lock` semaphore
   before exiting.

**Target artifact path**. Before dispatching, the skill SHALL
compute an absolute `<TARGET_PATH>` — the directory the worker
resolves `openspec/changes/<change-id>/review.md` inside:

- worktree mode → `<repo>/.worktrees/<change-id>` (absolute)
- main-tree mode → `<repo>` (absolute; the Manager's project root)

`<TARGET_PATH>` is used both in the worker's boot-prompt (artifact
contract, below) and by the Manager's own artifact judgment (below).

**Dispatch helper protocol** SHALL branch on the resolved worker
entry in the following priority order:

1. **`entry.mode == "live-shell"` AND `agents.yaml` contains a valid
   `agmsg` block** (see `Agmsg Config Block In agents.yaml`) — invoke:

   ```
   /agmsg spawn <agmsg-type> <entry.name> [--model <id>] --boot-prompt "<resolved-prompt>"
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

   The skill SHALL scan `entry.args` for a `--model <id>` pair
   (order-agnostic within the args array). When found, the
   `--model <id>` pair SHALL be threaded into the spawn call before
   `--boot-prompt`. When absent, the spawn call omits `--model` and
   `spawn.sh` starts the CLI on its default model. When `--model`
   appears without a following token in `entry.args`, the skill
   SHALL escalate with `agents.yaml agent "<name>" has bare --model
   without a value in args` and NOT dispatch. Errors returned by
   `spawn.sh` (e.g. an agmsg-type whose manifest declares no
   `model_arg`) SHALL surface as-is with no silent fallback.

   Other `entry.args` (e.g. `--dangerously-skip-permissions`) are
   NOT threaded through the CLI here. Their sync into
   `~/.agmsg/config/spawn_options.yaml` is a **server-side**
   concern (config-writer), NOT a dispatcher-skill concern. See
   `sync-agmsg-spawn-options-on-config-write` (follow-up change)
   for that flow.

   **Artifact contract in the boot-prompt** (review / verify stages
   only). The resolved boot-prompt SHALL append an "artifact
   contract" section that names the exact absolute path where the
   worker MUST write `review.md`. The appended text SHALL be:

   ```
   --- artifact contract ---
   Write your review.md to this exact absolute path:
     <TARGET_PATH>/openspec/changes/<change-id>/review.md
   Do NOT rely on your CLI's cwd inference; the dispatcher will
   look at this exact path only. If the path's parent directory
   does not exist, create it first.
   ```

   The artifact contract SHALL NOT be appended for the code stage
   (no review.md write expected).

   **Report contract in the boot-prompt.** The resolved boot-prompt
   for the agmsg branch SHALL append a "report" section that
   instructs the worker to send exactly ONE completion message to
   Manager when it finishes (whether the outcome is pass,
   needs-rework, or a blocker). The appended text SHALL be:

   ```
   --- report contract ---
   When your task completes, send exactly ONE message to Manager via:
     ~/.agents/skills/agmsg/scripts/send.sh <team> <entry.name> manager \
       "stage:<S> status:done"
   This tells Manager to inspect the review.md artifact (or git log
   for code stage) and advance the workflow. Send exactly once.
   ```

   Where `<team>` is the value from `agents.yaml`'s `agmsg.team`
   field, `<entry.name>` is the worker's agent name, and `<S>` is
   the dispatched stage (`code`, `review`, or `verify`).

   Order: the artifact contract SHALL appear before the report
   contract when both are present, so a well-behaved worker writes
   review.md and only then sends the completion message.

   **Worker MUST NOT commit.** The dispatched code worker's role is
   apply-only. The `agents.yaml` example / default code prompt for
   command `claude` SHALL be `/opsx:apply ${change_id}` (apply
   only). The self-committing `/ithy-opsx:apply` variant is NOT
   supported as a dispatched worker prompt — its interactive
   "commit OK?" confirmation cannot be answered from an agmsg
   pane, causing the stage to hang until the ceiling. Manager owns
   the commit (see the code-stage judgment in the 3-stage success
   contract below).

   **Iteration for Copilot workers**. When the review stage returns
   `needs-rework`, the skill iterates. For agmsg workers whose
   agmsg-type has no receive-side Monitor equivalent (currently
   `copilot`), iteration SHALL be a fresh `/agmsg spawn` per
   iteration — the skill MUST NOT use `send.sh` to hand a mid-
   iteration prompt to an already-spawned copilot worker (Copilot
   has no Monitor tool; the message would sit in the inbox unread
   until Copilot's next user-triggered turn, which the dispatcher
   cannot cause). For agmsg types with a receive-side Monitor
   (currently `claude-code`), the skill MAY optionally reuse an
   existing worker via `send.sh` for iteration N+1 instead of
   fresh spawn; that optimization is a follow-up and not
   normative today.

2. **`entry.command == "claude"`** (Manager self-dispatch or a
   `mode: single-prompt` claude worker) — invoke the **Task tool**
   with the resolved prompt.

   For review / verify stages, the resolved prompt SHALL include
   the same absolute-path artifact contract used by the agmsg
   branch (naming `<TARGET_PATH>/openspec/changes/<change-id>/
   review.md`). This gives the Task tool subagent an unambiguous
   write target matching where Manager reads.

3. **Otherwise** — run as a **subprocess** using Bash with
   `<entry.command> <entry.args...> -p "<resolved-prompt>"` from the
   worker's `cwd` (worktree root when applicable).

   For review / verify stages, the resolved prompt SHALL include
   the absolute-path artifact contract (identical wording to the
   agmsg branch's contract). Some CLIs — notably `copilot` — do
   not honor their process cwd for file writes and default to a
   discovered project root; the artifact contract removes that
   ambiguity by naming the exact absolute path. Without the
   contract, a subprocess reviewer may write `review.md` to the
   main tree in worktree mode, causing Manager's post-report
   read to fail with `<stage> returned no artifact`.

**3-stage success contract** SHALL be applied per branch:

- The **agmsg branch** uses a **message-based wait** instead of
  polling. After sending the spawn, Manager waits (via the Monitor
  tool, or via periodic `inbox.sh` at 5-second intervals) for an
  inbox message matching:
  - `from:<entry.name>`
  - body matches regex `^stage:<S> status:done`

  Ceilings match the previous polling model: **15 min for the code
  stage, 5 min for review / verify**. On timeout → escalate
  `<stage> agmsg worker did not report within timeout`.

  On message receipt:
  - **`S = code`** — Manager SHALL check the working tree of
    `agent/<change-id>`. If the tree has uncommitted worker output
    (staged or unstaged), Manager SHALL commit unconditionally on
    `agent/<change-id>` with subject `impl: <change-id>` and then
    advance phase to `coded`. If the tree is clean AND no new
    commit exists on `agent/<change-id>` beyond the pre-spawn
    head, escalate `code stage reported done but produced no
    changes`. Worker-side commits are NOT expected under this
    contract; when the worker does commit (e.g. via a non-default
    self-committing apply variant), Manager's tree check finds a
    clean tree AND a new commit — this counts as success and
    Manager's own commit step is a no-op (nothing to stage). No
    duplicate commits.
  - **`S = review` or `S = verify`** — read
    `<TARGET_PATH>/openspec/changes/<change-id>/review.md` (the
    same absolute path the boot-prompt's artifact contract named).
    Parse the frontmatter `verdict:` value. Route on
    `pass` / `needs-rework` per the unchanged logic. If the file is
    absent AFTER receiving the report message, retry the read once
    with a 1-second delay; if still absent, escalate `<stage>
    reported done but did not write review.md at <TARGET_PATH>/
    openspec/changes/<change-id>/review.md`.

  Duplicate messages from the same worker SHALL be ignored (Manager
  processes only the first matching message per stage).

- The **Task tool** and **subprocess** branches retain their exit-
  code contract but resolve the artifact against the same absolute
  path as the agmsg branch: subprocess non-zero exit (or Task-tool
  subagent failure) → failure; exit 0 + `review.md` absent at
  `<TARGET_PATH>/openspec/changes/<change-id>/review.md` → contract
  failure → escalate `<stage> returned no artifact`; present with
  parseable `verdict:` → route on `pass` / `needs-rework`.

  Manager SHALL read the artifact at `<TARGET_PATH>/openspec/
  changes/<change-id>/review.md` (absolute path, computed in step
  4) for all three branches — agmsg, Task tool, subprocess. The
  older relative form (`openspec/changes/<change-id>/review.md`
  from Manager's cwd) is not compliant in worktree mode because
  Manager's cwd is the project root, not the worktree — a
  well-behaved reviewer honoring its process cwd would write to
  the worktree and Manager's read would miss it.

Manager (`roles` includes `manager`) is never dispatched through
the agmsg branch — the Manager runs in tmux pane 0 (per `Embedded
PTY Uses tmux When Agmsg Is Configured`); its `/agmsg spawn` calls
are what land workers in adjacent panes.

**Failure recovery ladder.** When a stage fails or the dispatch
ends (whether successfully, via escalation, or via a hung worker),
the skill SHALL clean up worker panes and team memberships using
the following ordered ladder. Each step is tried in order; on
failure, fall through to the next step; escalate with a message
naming the leaked resource only after step 3 fails.

1. **Preferred — graceful despawn.**

   ```bash
   ~/.agents/skills/agmsg/scripts/despawn.sh "$AGMSG_TEAM" manager "$entry_name"
   ```

   Releases the tmux pane placement AND the team member entry in
   one atomic operation. This is the correct path when spawn
   recorded a placement (the normal case).

2. **On despawn failure — targeted leave + kill.**

   ```bash
   ~/.agents/skills/agmsg/scripts/leave.sh "$AGMSG_TEAM" "$entry_name"
   tmux kill-pane -t "$WORKER_PANE_ID"
   ```

   Removes the specific agent from the team AND kills the specific
   pane. Used when despawn fails because `spawn.sh` did not
   register a placement (e.g. the known `run/spawn.<team>__<name>`
   first-invocation mkdir gap). Scope is exactly one agent, one
   pane — no collateral damage.

3. **NEVER — bare `reset.sh`.** The skill SHALL NOT invoke
   `reset.sh "$path" <type>` without an `agent_id` argument in any
   recovery path. Without `agent_id`, `reset.sh` clears every
   agent of that type registered under that project path — which
   can include Manager itself, silently taking down the dispatch
   loop's own reply channel. Full-team resets are a manual
   operator escape hatch, not a skill responsibility.

   If step 2 also fails (leave.sh errors AND the pane won't die),
   escalate with `stage <S> cleanup failed — leaked pane
   <pane-id>, leaked team member <entry.name>` so the operator can
   inspect manually. Do NOT silently fall through to a bare
   `reset.sh` as a "just make it go away" catch-all.

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

#### Scenario: Manager registration ensured at dispatch start
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND Manager (`manager`) is NOT currently registered in the team
- **WHEN** the dispatcher starts for change `add-foo`
- **THEN** the skill invokes `join.sh openspec-ui manager claude-code "$(pwd)"` before any worker spawn, and Manager appears in `team.sh openspec-ui` output when the code stage begins

#### Scenario: Manager registration re-verified before each stage
- **GIVEN** dispatch is between stages (code completed, review about to spawn) AND Manager's registration was removed by an external process
- **WHEN** the skill enters the review stage
- **THEN** the pre-spawn `team.sh` check finds Manager absent, `join.sh` is re-invoked, and Manager is registered again before `/agmsg spawn` fires

#### Scenario: agmsg branch takes priority for live-shell workers
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND a worker entry `{ name: peer, mode: live-shell, command: codex, roles: [review] }`
- **AND** agmsg scripts exist at `~/.agents/skills/agmsg/scripts/send.sh`
- **WHEN** the dispatcher runs the review stage
- **THEN** it invokes `/agmsg spawn codex peer --boot-prompt "<resolved-prompt with artifact + report contracts>"` (not the subprocess branch, not the Task tool)

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

#### Scenario: code stage — Manager commits worker's uncommitted output
- **GIVEN** an agmsg-routed code dispatch to worker `claude` with the default `/opsx:apply ${change_id}` prompt (apply only)
- **WHEN** Manager receives `from:claude body:"stage:code status:done"` within the 15-min ceiling
- **AND** the `agent/<change-id>` working tree has uncommitted changes (worker applied but did not commit)
- **THEN** Manager runs `git -C .worktrees/<change-id> add . && git commit -m "impl: <change-id>"`, and phase advances to `coded`

#### Scenario: code stage — worker-committed tree treated as no-op
- **GIVEN** an agmsg-routed code dispatch with a self-committing worker variant
- **WHEN** Manager receives `stage:code status:done` and the `agent/<change-id>` tree is clean AND a new commit exists beyond the pre-spawn head
- **THEN** Manager's commit step is a no-op (nothing to stage), no duplicate commit is created, and phase advances to `coded`

#### Scenario: code stage — escalate when no changes produced
- **GIVEN** an agmsg-routed code dispatch
- **WHEN** Manager receives `stage:code status:done` AND the tree is clean AND no new commit exists beyond the pre-spawn head
- **THEN** Manager escalates with `code stage reported done but produced no changes` and does NOT advance the phase

#### Scenario: agmsg branch review stage advances on report + review.md
- **GIVEN** an agmsg-routed review dispatch to worker `copilot-review`
- **WHEN** Manager receives `from:copilot-review body:"stage:review status:done"` and reads `review.md` at `<TARGET_PATH>/openspec/changes/<change-id>/review.md` with parseable `verdict: pass`
- **THEN** Manager advances the change to `reviewed`

#### Scenario: agmsg branch escalates on missing report message
- **GIVEN** an agmsg-routed dispatch has spawned a worker
- **WHEN** no `stage:<S> status:done` message from that worker arrives within the ceiling (15 min code / 5 min review-verify)
- **THEN** Manager escalates with `<stage> agmsg worker did not report within timeout`

#### Scenario: agmsg branch retries artifact read on race
- **GIVEN** Manager received `stage:review status:done` from the worker
- **AND** `<TARGET_PATH>/openspec/changes/<change-id>/review.md` is temporarily absent when Manager first tries to read it (worker sent the message just before its file was flushed)
- **WHEN** Manager retries the read once after a 1-second delay
- **THEN** the file is now present and Manager parses the verdict as usual

#### Scenario: agmsg branch ignores duplicate report messages
- **GIVEN** Manager already processed `stage:code status:done` from worker `claude`
- **WHEN** a second identical message arrives from the same worker for the same stage
- **THEN** Manager ignores the duplicate and does NOT re-advance the phase

#### Scenario: agmsg branch threads --model from entry.args
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND a live-shell worker entry `{ name: claude, command: claude, args: [--dangerously-skip-permissions, --model, sonnet], roles: [code] }`
- **WHEN** the dispatcher reaches the code stage
- **THEN** it invokes `/agmsg spawn claude-code claude --model sonnet --boot-prompt "<resolved-prompt with report contract>"` (the `--model sonnet` pair is extracted from `args` and threaded before `--boot-prompt`)

#### Scenario: agmsg branch omits --model when absent from args
- **GIVEN** an entry whose `args` does not contain `--model`
- **WHEN** the dispatcher reaches the stage
- **THEN** the spawn call is `/agmsg spawn <type> <name> --boot-prompt "..."` (no `--model` inserted) and the CLI starts on its default model

#### Scenario: agmsg branch escalates on bare --model
- **GIVEN** an entry whose `args` contains `--model` with no following token (e.g. `args: [--model]`)
- **WHEN** the dispatcher reaches the stage
- **THEN** it escalates with `agents.yaml agent "<name>" has bare --model without a value in args` and does NOT dispatch

#### Scenario: worktree mode → boot-prompt names the worktree absolute path
- **GIVEN** worktree mode with `<repo>/.worktrees/<change-id>/` created
- **WHEN** the dispatcher builds the boot-prompt for the review stage
- **THEN** the artifact contract section names `<repo-absolute>/.worktrees/<change-id>/openspec/changes/<change-id>/review.md` as the target path

#### Scenario: main-tree mode → boot-prompt names the repo root path
- **GIVEN** main-tree mode (no worktree)
- **WHEN** the dispatcher builds the boot-prompt for the review stage
- **THEN** the artifact contract section names `<repo-absolute>/openspec/changes/<change-id>/review.md` as the target path

#### Scenario: worker writes review.md to the wrong path → escalate
- **GIVEN** worktree mode; the worker completed and sent `stage:review status:done`
- **AND** review.md is not present at `<TARGET_PATH>/openspec/changes/<change-id>/review.md` (worker ignored the artifact contract and wrote elsewhere)
- **WHEN** Manager checks the artifact after the 1-second retry
- **THEN** Manager escalates with `review reported done but did not write review.md at <TARGET_PATH>/openspec/changes/<change-id>/review.md`

#### Scenario: code stage boot-prompt has NO artifact contract
- **GIVEN** the code stage boot-prompt is built
- **WHEN** the resolved-prompt is assembled
- **THEN** it contains the report contract but NOT the artifact contract (no review.md write expected in the code stage)

#### Scenario: Copilot worker iteration means fresh spawn
- **GIVEN** an agmsg-routed review with worker `{ name: copilot-review, command: copilot, mode: live-shell }` that returned `verdict: needs-rework`
- **WHEN** the dispatcher runs the next iteration
- **THEN** it invokes `/agmsg spawn copilot copilot-review --boot-prompt "<new resolved-prompt with priorFindings + artifact + report contracts>"` — a FRESH spawn creating a new tmux pane; it does NOT call `send.sh` to hand the new prompt to an existing copilot session

#### Scenario: Claude worker iteration MAY reuse (informative)
- **GIVEN** an agmsg-routed dispatch with worker `{ name: coder, command: claude, mode: live-shell }` that returned `verdict: needs-rework`
- **WHEN** the dispatcher decides on the next iteration
- **THEN** the skill MAY either fresh-spawn a new worker OR send the new prompt to the existing worker (Claude Code has Monitor, so send-based iteration is technically supported); either choice is compliant with this requirement in the current version

#### Scenario: cleanup prefers despawn
- **GIVEN** the review stage completes (pass or needs-rework) and the copilot-review worker's pane is still open
- **WHEN** the skill runs its post-stage cleanup
- **THEN** it invokes `despawn.sh openspec-ui manager copilot-review` FIRST; the pane closes and copilot-review is removed from the team in one operation

#### Scenario: cleanup falls back to leave + kill when despawn fails
- **GIVEN** `despawn.sh` fails because `spawn.sh` did not record a placement (first-invocation `run/` dir gap)
- **WHEN** the skill runs its post-stage cleanup
- **THEN** it invokes `leave.sh openspec-ui copilot-review` AND `tmux kill-pane -t <worker-pane-id>` — one specific agent, one specific pane — and Manager's registration is unaffected

#### Scenario: cleanup never invokes bare reset.sh
- **GIVEN** dispatch has escalated and is about to exit
- **WHEN** the skill runs its final cleanup pass
- **THEN** it does NOT invoke `reset.sh "$path" claude-code` (missing `agent_id`); if steps 1 and 2 of the recovery ladder both fail, the skill escalates with a message naming the leaked pane and team member, but does not attempt to clear the whole `(project, type)` slice

#### Scenario: portable AGMSG_TEAM extraction on BSD sed
- **GIVEN** `agents.yaml` has an `agmsg:` block with `team: openspec-ui`
- **AND** the running shell is macOS bash 3.2 with BSD sed
- **WHEN** the skill extracts `$AGMSG_TEAM`
- **THEN** the value is `openspec-ui` (extraction uses awk or another POSIX-portable form; no GNU-only sed address-block syntax)

#### Scenario: subprocess review branch names absolute artifact path
- **GIVEN** worktree mode with `copilot-review` (`mode: single-prompt`, `command: copilot`)
- **WHEN** the dispatcher enters the review stage
- **THEN** the `-p` prompt handed to `copilot` contains the artifact contract block naming `<TARGET_PATH>/openspec/changes/<change-id>/review.md` as the absolute write target

#### Scenario: Task tool review branch names absolute artifact path
- **GIVEN** worktree mode with a `mode: single-prompt` claude review worker
- **WHEN** the dispatcher enters the review stage
- **THEN** the Task tool prompt contains the same artifact contract block, naming the absolute path

#### Scenario: Manager reads review.md from TARGET_PATH not cwd
- **GIVEN** worktree mode; the review worker (any branch) wrote `review.md` at `<TARGET_PATH>/openspec/changes/<change-id>/review.md`
- **WHEN** Manager reads the artifact after the report / subprocess completion
- **THEN** Manager reads exactly that absolute path — NOT the relative `openspec/changes/<change-id>/review.md` under Manager's cwd (project root, main tree)

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

The embedded PTY session SHALL wrap the resolved manager startup command in a `tmux new-session` invocation whenever tmux is *enabled*, and SHALL spawn the manager command directly (pre-P2 behavior) when it is not. Tmux is enabled when EITHER `agents.yaml` sets a top-level `tmux: true`, OR `agents.yaml` includes a valid top-level `agmsg` block (agmsg configuration continues to imply tmux ON unconditionally — there is no way to configure agmsg without tmux). Both signals are read via `AgentRegistry`: `tmux()` returns the raw parsed boolean (default `false` when the field is absent), `agmsg()` returns the parsed block or `null`. `tmux: false` (or omission) alongside a present `agmsg:` block does NOT disable tmux — agmsg's implication is unconditional, not an independent vote.

The tmux-wrapped startup command SHALL take the shape:

```
tmux new-session -A -s <session-name> -- <managerCommand> <managerArgs...>
```

The `-A` flag SHALL cause tmux to attach to an existing session with the given name if one is running (idempotent re-attach on WS reconnect / dev reload). The session name SHALL default to `ithyno-<hash>` where `<hash>` is a stable, project-scoped digest — SHA-256 of the resolved project root path, first 12 hex characters. When `ITHYNO_TMUX_SESSION` is set to a non-empty string in the environment, that literal value SHALL be used instead (backward compat; opt-in cross-project sharing). The `--` separator SHALL be emitted between tmux's own flags and the wrapped command so manager flags (`--resume`, `--session-id`, etc.) are not misinterpreted as tmux options.

The `initialInput` string (the Manager's declared first-message line from `agents.yaml`) SHALL continue to be written to the PTY's stdin after the startup command settles — tmux forwards stdin into pane 0's foreground command so no extra plumbing is added.

When tmux is enabled (by either signal) and the `tmux` binary is not on `PATH`, the PTY SHALL open a raw shell that prints a banner naming the missing dependency, the platform install hint, and a note that removing the `agmsg:` block / `tmux: true` reverts to the direct-spawn path. The WebSocket connection SHALL NOT close in this fallback — the user retains a usable shell.

The manager startup command SHALL be resolved via a three-tier priority:

1. `registry.managerAgent()` — the first `agents.yaml` entry whose `roles` array contains `manager`. Its `command` + `args` form the startup line; its `initialInput` (if set) is auto-injected after.
2. `ITHYNO_TERMINAL_STARTUP` env var — treated as a single shell string. Backward compat with the pre-manager-config setup.
3. **Fallback: per-project Claude Code session id**. When neither priority 1 nor 2 supplies a command, ithyno SHALL manage a persistent UUID at `<project-root>/.ithyno/session-id` and choose between `claude --session-id <uuid>` (first launch) and `claude --resume <uuid>` (subsequent launches):

   - Read `<project-root>/.ithyno/session-id`. Trim whitespace.
   - **File missing OR empty** → mint a new UUID v4, ensure `<project-root>/.ithyno/` exists (`mkdir -p`), write `<uuid>\n` to the file, then set the startup command to `claude --session-id <uuid>` (Claude Code creates a fresh conversation with that specific id).
   - **File present, non-empty** → set the startup command to `claude --resume <uuid>` (Claude Code resumes the previously-minted session).

   `--continue` MUST NOT be used at this tier — its "most recent" picking is opaque and it errors on a truly fresh project. Users who want a different startup command declare a manager entry (tier 1) or set `ITHYNO_TERMINAL_STARTUP` (tier 2).

This requirement establishes tmux hosting only. It does NOT invoke any `agmsg` binary, does NOT change dispatcher routing, and does NOT open additional tmux panes for workers — those are landed by follow-up changes P2b and P2c.

Runtime project switch (`POST /api/project/switch` from `respawn-manager-pty-on-project-switch`) SHALL, in addition to terminating live PTYs, best-effort `tmux kill-session -t <old-session-name>` for the previous project's session so the pane does not linger and get re-attached by an unrelated future invocation. Failure to kill the session (session not found, tmux missing, etc.) SHALL be logged and swallowed — the switch itself proceeds.

#### Scenario: Neither tmux nor agmsg configured → direct spawn unchanged
- **GIVEN** an `agents.yaml` without a `tmux: true` field and without an `agmsg:` block, and a `role: manager` agent declared
- **WHEN** the Terminal panel opens a PTY
- **THEN** the PTY spawns the manager command directly (no tmux wrap), matching pre-P2 behavior
- **AND** the process tree does NOT contain `tmux`

#### Scenario: tmux: true enables tmux without agmsg configured
- **GIVEN** an `agents.yaml` containing `tmux: true`, no `agmsg:` block, and a `role: manager` agent whose command is `claude` and args are `[--resume, <id>]`
- **AND** the `tmux` binary is on `PATH`
- **AND** the project root resolves to `/path/to/project`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line is `tmux new-session -A -s ithyno-<12-hex-of-sha256("/path/to/project")> -- claude --resume <id>`
- **AND** the manager's `initialInput` is written to the PTY after the tmux session bootstraps

#### Scenario: agmsg block present with tmux installed → tmux wrap regardless of the tmux field
- **GIVEN** an `agents.yaml` containing `agmsg: { team: alpha }`, no explicit `tmux` field, and a `role: manager` agent whose command is `claude` and args are `[--resume, <id>]`
- **AND** the `tmux` binary is on `PATH`
- **AND** the project root resolves to `/path/to/project`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line is `tmux new-session -A -s ithyno-<12-hex-of-sha256("/path/to/project")> -- claude --resume <id>`
- **AND** the manager's `initialInput` is written to the PTY after the tmux session bootstraps

#### Scenario: tmux: false does not defeat an agmsg-implied tmux wrap
- **GIVEN** an `agents.yaml` containing both `tmux: false` and `agmsg: { team: alpha }`
- **AND** the `tmux` binary is on `PATH`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the PTY still wraps the startup command in `tmux new-session -A -s ...` (agmsg's implication is unconditional)

#### Scenario: Different project roots produce distinct tmux sessions
- **GIVEN** two ithyno instances running against project roots `/path/A` and `/path/B` (both with tmux enabled, via either signal, and tmux installed)
- **WHEN** each opens its embedded PTY
- **THEN** the two `tmux new-session -s ...` invocations use DIFFERENT session names (`ithyno-<hashA>` vs `ithyno-<hashB>`)
- **AND** `tmux ls` shows two distinct sessions
- **AND** each dashboard's Manager Claude sits at its own project's cwd

#### Scenario: tmux enabled with tmux missing → fallback banner
- **GIVEN** an `agents.yaml` with tmux enabled (via `tmux: true` or an `agmsg:` block)
- **AND** the `tmux` binary is NOT on `PATH`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the PTY opens a raw shell that prints a banner including "tmux was not found on PATH", the platform install hint, and the "remove the agmsg: block / tmux: true to fall back" note
- **AND** the WS connection stays open (the user can Ctrl-C / type commands as normal)

#### Scenario: ITHYNO_TMUX_SESSION overrides the session name
- **GIVEN** `agents.yaml` has tmux enabled (via either signal), `tmux` is installed, and the environment sets `ITHYNO_TMUX_SESSION=proj-a`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line uses `-s proj-a` (not the `ithyno-<hash>` default)
- **AND** a second ithyno instance with the same env var and any project root shares the same session (opt-in cross-project sharing)

#### Scenario: re-attach idempotence via `-A`
- **GIVEN** a tmux-enabled workspace whose tmux session `ithyno-<hash>` is already running (previous PTY closed but session was detached, not killed)
- **WHEN** the Terminal panel opens a new PTY for the same project
- **THEN** `tmux new-session -A -s ithyno-<hash>` attaches to the existing session (does NOT error, does NOT create a duplicate); the user sees the same tmux state as before the disconnect

#### Scenario: Runtime project switch kills the old project's tmux session
- **GIVEN** ithyno is running at project A with its tmux session `ithyno-<hashA>` alive
- **WHEN** a client sends `POST /api/project/switch` with `{ projectRoot: "/path/to/B" }`
- **THEN** `terminateAllLivePtys()` closes the live WS
- **AND** the server best-effort invokes `tmux kill-session -t ithyno-<hashA>` before returning 200
- **AND** the next `/pty` reconnect creates a fresh `ithyno-<hashB>` at cwd=B (no attach to the old A pane)

#### Scenario: fallback first launch mints a session id
- **GIVEN** a project whose `agents.yaml` has NO entry with `roles: [manager]`
- **AND** the environment has no `ITHYNO_TERMINAL_STARTUP`
- **AND** `<project-root>/.ithyno/session-id` does NOT exist
- **WHEN** the Terminal panel opens a PTY
- **THEN** ithyno mints a fresh UUID v4, creates `<project-root>/.ithyno/session-id` containing that UUID, and the resolved startup line is `claude --session-id <uuid>` (or the tmux-wrapped variant when tmux is enabled)
- **AND** the terminal does NOT print "No conversation found" — Claude Code starts a fresh conversation bound to the newly-minted id

#### Scenario: fallback subsequent launch resumes
- **GIVEN** a project with no manager and no env override
- **AND** `<project-root>/.ithyno/session-id` already exists containing UUID `f0e1d2c3-...`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line is `claude --resume f0e1d2c3-...` (or the tmux-wrapped variant)
- **AND** the Claude Code conversation from the previous PTY is resumed with its history intact
- **AND** no new UUID is minted; `.ithyno/session-id` is unchanged

#### Scenario: fallback with empty or whitespace session-id file → fresh mint
- **GIVEN** `<project-root>/.ithyno/session-id` exists but is empty or contains only whitespace
- **WHEN** the Terminal panel opens a PTY
- **THEN** ithyno treats it as "missing", mints a new UUID, overwrites the file, and starts `claude --session-id <new-uuid>` — no broken `claude --resume ` line is emitted

#### Scenario: user deletes ~/.claude session externally → --resume errors
- **GIVEN** `<project-root>/.ithyno/session-id` contains a UUID
- **AND** the user has deleted the corresponding `~/.claude/projects/<encoded>/<uuid>.jsonl`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the startup line is `claude --resume <uuid>` and Claude Code emits "No conversation found with session ID: <uuid>" — the user recovers by deleting `<project-root>/.ithyno/session-id` and re-opening the Terminal (which mints a fresh id per the first-launch scenario above)

#### Scenario: manager entry overrides the fallback
- **GIVEN** a project whose `agents.yaml` declares a `roles: [manager]` entry with `command: claude` and `args: [--resume, my-fixed-uuid]`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the manager entry (priority 1) wins; ithyno does NOT read or write `.ithyno/session-id` and the startup line uses the manager's declared args verbatim

### Requirement: Electron First-Launch Auto-Installs Agmsg

The Electron shell SHALL vendor fujibee/agmsg (MIT-licensed shell
scripts) under `vendor/agmsg/` in the repository and package that
directory into `resources/app/vendor/agmsg/` via
`electron-builder`'s `extraResources`. On each launch, before the
main window is created, the shell SHALL run an `ensureAgmsgInstalled()`
step that checks for `$HOME/.agents/skills/agmsg/scripts/send.sh`.

> ⚠️ **PENDING MODIFIED** by [add-windows-agmsg-support](../../changes/add-windows-agmsg-support/): the "Windows launch skips the install step" scenario is replaced — Windows gets the same install-prompt flow as macOS/Linux, gated on Git Bash + sqlite3 detection instead of an unconditional platform skip.

> ⚠️ **PENDING REMOVED** by [limit-agmsg-install-prompt-triggers](../../changes/limit-agmsg-install-prompt-triggers/): this whole requirement is removed — no automatic install prompt on launch. Replaced by "Agmsg Install Is Explicitly Triggered (Settings Or New Project Onboarding)" and "Agmsg Team Config Is A Shared Dialog (Settings And New Project Onboarding)".

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

### Requirement: Auto-Sync Agmsg Spawn Options

The server SHALL auto-sync non-`--model` CLI flags from live-shell
worker `entry.args` in `agents.yaml` into agmsg's
`~/.agmsg/config/spawn_options.yaml` so the user only touches the
Agents Config Modal, never the agmsg config file directly.

The sync SHALL run at two trigger points:

1. **Server boot**, after `registry.load()` returns and the initial
   AgentConfig is populated.
2. **On `POST /api/agents/config`**, after `applyAgentConfigPayload`
   finishes writing `agents.yaml`, using the reloaded config.

The sync SHALL:

- Be a no-op when `cfg.agmsg === null` (agmsg not configured).
- Consider only entries where `mode === "live-shell"` AND `roles`
  does NOT include `"manager"`. Manager entries never spawn via
  agmsg and MUST NOT appear in `spawn_options.yaml`.
- Derive `<agmsg-type>` from `entry.command` via the same fixed
  mapping the dispatcher uses (`claude→claude-code`, `codex→codex`,
  `copilot→copilot`, `gemini→gemini`, `antigravity→antigravity`,
  `opencode→opencode`, `cursor→cursor`). Entries whose command has
  no mapping SHALL be silently skipped (not an error — surfaces at
  dispatch time).
- Parse `entry.args` left-to-right: a token starting with `--`
  becomes a flag. If the next token exists AND does NOT start with
  `--`, it is the flag's value (pair); otherwise the flag is
  boolean (emitted as `<flag>: true`).
- Skip `--model` and its value entirely (the dispatcher CLI threads
  it per `Dispatch Slash Command`'s agmsg branch).
- Emit each type's section authoritatively — the sync REPLACES the
  full contents of that type's section. Flags previously present in
  `spawn_options.yaml` under a type ithyno now manages, but NOT in
  the current `entry.args`, SHALL be removed.
- Preserve type sections in `spawn_options.yaml` that do NOT appear
  in the current sync (e.g. a `codex:` section left over from a
  different tool). Only the ithyno-declared types are rewritten.
- Create `~/.agmsg/config/` when missing (`mkdir -p`) and use an
  atomic write (temp file + rename) for durability.
- Emit values matching agmsg's spawn-options YAML dialect exactly:
  a flat `<type>:` header followed by 2-space-indented
  `<flag>: <value>` lines; no nesting, no quoting.

The sync SHALL NOT display any UI notification or dialog — it is
silent auto-management.

#### Scenario: no agmsg block — sync is a no-op
- **GIVEN** `agents.yaml` has no top-level `agmsg:` block
- **WHEN** the server boots OR the UI saves the Agents Config
- **THEN** no read or write to `~/.agmsg/config/spawn_options.yaml` occurs

#### Scenario: live-shell worker → spawn_options.yaml populated
- **GIVEN** `agents.yaml` has `agmsg: { team: alpha }` AND a worker `{ name: claude, mode: live-shell, command: claude, args: [--dangerously-skip-permissions, --model, sonnet, --verbose, 2], roles: [code] }`
- **WHEN** the sync runs
- **THEN** `~/.agmsg/config/spawn_options.yaml` contains a `claude-code:` section with `--dangerously-skip-permissions: true` and `--verbose: 2`
- **AND** `--model` is NOT in `spawn_options.yaml`

#### Scenario: sync removes stale entries under a type ithyno manages
- **GIVEN** `spawn_options.yaml` currently has `claude-code:\n  --dangerously-skip-permissions: true\n  --old-flag: true`
- **AND** the current worker's `args` is `[--dangerously-skip-permissions]` only
- **WHEN** the sync runs
- **THEN** `spawn_options.yaml`'s `claude-code:` section contains only `--dangerously-skip-permissions: true` (the stale `--old-flag: true` is removed)

#### Scenario: sync preserves unrelated type sections
- **GIVEN** `spawn_options.yaml` currently has both `claude-code:` (managed by ithyno) and `grok-build:` (NOT declared in current `agents.yaml`)
- **WHEN** the sync runs against the current `agents.yaml`
- **THEN** only the `claude-code:` section is rewritten; `grok-build:` is left byte-identical

#### Scenario: manager entry is NOT synced
- **GIVEN** an entry `{ name: pptr, mode: live-shell, command: claude, roles: [manager] }`
- **WHEN** the sync runs
- **THEN** the manager entry contributes nothing to `spawn_options.yaml`; if only manager entries exist for the `claude-code` type, that section SHALL be removed rather than left empty

#### Scenario: unknown command silently skipped
- **GIVEN** a live-shell worker `{ command: my-wrapper, args: [--foo, true] }`
- **WHEN** the sync runs
- **THEN** no error, no escalation — the entry contributes nothing to `spawn_options.yaml` (dispatcher's agmsg branch would escalate at dispatch time on unknown command; the sync itself is silent)

#### Scenario: missing directory created on write
- **GIVEN** `~/.agmsg/config/` does NOT exist
- **WHEN** the sync runs and needs to write
- **THEN** `mkdir -p ~/.agmsg/config` is called first, then `spawn_options.yaml` is written atomically (temp file + rename)

#### Scenario: sync runs on server boot
- **GIVEN** `agents.yaml` has a valid `agmsg:` block and one or more live-shell workers
- **WHEN** the server starts and completes `registry.load()`
- **THEN** the sync runs once as part of the boot sequence, ensuring `spawn_options.yaml` matches `agents.yaml` before the first dispatch

#### Scenario: sync runs on POST /api/agents/config
- **GIVEN** the UI's Agents Config Modal writes a new agent entry via `POST /api/agents/config`
- **WHEN** the server completes `applyAgentConfigPayload` and reloads the registry
- **THEN** the sync runs immediately after, reflecting the just-saved args in `spawn_options.yaml`

#### Scenario: --model without a following token — sync treats it as boolean and skips
- **GIVEN** a worker entry whose `args` contains `--model` with no following token
- **WHEN** the sync runs
- **THEN** the sync does NOT emit `--model: true` (the flag and its intended value are the dispatcher's concern; the sync is inert for `--model` regardless of shape)
- **AND** the dispatcher will separately escalate on the bare `--model` per `Dispatch Slash Command`

### Requirement: Agmsg Config Write Endpoint

The server SHALL expose `POST /api/config/agmsg` for creating,
updating, or removing the top-level `agmsg:` block in `agents.yaml`.
The endpoint SHALL accept a JSON body of one of the following two
shapes:

```jsonc
// Enable / upsert:
{ "enabled": true, "team": "<non-empty string>", "storage": "<optional string>" }

// Disable / remove:
{ "enabled": false }
```

The server SHALL:

- Reject non-local origins with `403` (matching the guard on
  `POST /api/config/parallel-execution`).
- When `enabled: true` and `team` is missing or an empty string,
  respond `400` with error message
  `agmsg.team is required when the agmsg block is present`.
- When `enabled: true`, atomically write the `agmsg:` block into
  `agents.yaml` preserving every other top-level key (`agents:`,
  `parallelExecution:`, etc.) and preserving the `agents:` list.
- When `enabled: false`, remove the `agmsg:` key from
  `agents.yaml` if present; no-op if already absent. The
  `agents:` list SHALL remain untouched.
- Broadcast the existing `agents-updated` WS event with the
  refreshed `agmsg` field after a successful write.

#### Scenario: enable + team persists to agents.yaml
- **GIVEN** an `agents.yaml` with no `agmsg:` block and an `agents:` list of length 2
- **WHEN** the UI posts `{ enabled: true, team: "alpha" }` to `/api/config/agmsg`
- **THEN** the response is 200 OK
- **AND** the file on disk contains `agmsg:\n  team: alpha` (or equivalent YAML) at the top level
- **AND** the two existing agents in the list are untouched

#### Scenario: enable with storage
- **GIVEN** the UI posts `{ enabled: true, team: "alpha", storage: ".worktrees/.agmsg.sqlite" }`
- **WHEN** the write completes
- **THEN** `agents.yaml` contains `agmsg: { team: alpha, storage: .worktrees/.agmsg.sqlite }` (equivalent YAML)

#### Scenario: disable removes the block
- **GIVEN** an `agents.yaml` that currently contains `agmsg: { team: alpha }`
- **WHEN** the UI posts `{ enabled: false }` to `/api/config/agmsg`
- **THEN** the response is 200 OK
- **AND** the file on disk no longer contains any top-level `agmsg:` key
- **AND** every other top-level key (agents, parallelExecution, ...) is preserved

#### Scenario: enable without team → 400
- **WHEN** the UI posts `{ enabled: true }` (no team) OR `{ enabled: true, team: "" }`
- **THEN** the server responds `400` with error `agmsg.team is required when the agmsg block is present`
- **AND** `agents.yaml` on disk is unchanged

#### Scenario: non-local origin → 403
- **WHEN** a non-loopback client posts `/api/config/agmsg`
- **THEN** the server responds `403` and does not touch `agents.yaml`

#### Scenario: agents-updated broadcast on successful write
- **WHEN** the write succeeds
- **THEN** the server emits an `agents-updated` WS event whose payload's `agmsg` field reflects the just-written block

### Requirement: Onboarding Project Page

The dashboard SHALL expose a React route at `/onboarding` that renders
a shared "new project initialization" experience consumed by all three
channels (Electron via a child BrowserWindow, browser via in-app
navigation, VS Code via a webview panel in a future follow-up).

The route SHALL accept these query parameters:

- **`target`** — required. The absolute path where the new project is
  being created. The page reads it verbatim and passes it to the
  streaming endpoint.
- **`channel`** — optional. One of `electron`, `browser`, `vscode`.
  When absent, the page infers the channel at runtime (checks
  `window.electronAPI` first, then `window.acquireVsCodeApi`, else
  falls through to `browser`). Determines close/open handler routing.

On mount the page SHALL:

1. Read the query params; if `target` is missing or not absolute,
   render an error state ("target required") with a Close button
   only.
2. Open a `fetch` POST against `/api/init/stream` with body
   `{ dir: target, autoCreateDir: true, autoGitInit: true }` and
   `Accept: text/event-stream`. Consume the response body reader
   frame-by-frame and dispatch each parsed `ChainEvent` into local
   state.
3. Render the layout:
   - Header: "Setting up ithyno project" plus the target path (with
     word-wrap for long paths).
   - Step list: `scaffold` (label "Scaffold ithyno files") and
     `openspec-init` (label "Install OpenSpec"). Each step shows an
     icon: `pending` (○), `in-progress` (⏵ animated), `done` (✓),
     `failed` (✗ in red).
   - Log pane: a monospace scrollable region, auto-scrolls to bottom
     on each new line, ring buffer capped at 500 lines. Each line
     shows its `stream` prefix subtly (stderr styled distinctly).
   - Buttons row:
     - **Close** — always enabled. Behavior depends on channel:
       - `electron`: send `onboarding-close` IPC to main; the
         BrowserWindow closes and the main window is untouched.
       - `browser`: `history.back()` OR `router.navigate('/')`
         depending on how the page was reached.
       - `vscode`: post message `{ type: 'onboarding-close' }` to
         the extension host; the webview panel is disposed.
     - **Open Project** — disabled until `complete` arrives.
       Behavior depends on channel:
       - `electron`: send `onboarding-open` IPC with the target; the
         main process closes the window and calls `switchProject`.
       - `browser`: navigate to `/` with `?dir=<target>` so the
         store re-scans and the Kanban shows the new project (the
         server also picks up the new PROJECT_ROOT via a page
         reload or a store-refresh cascade — this detail is
         implementation but the observable behavior is "the main
         app now shows the new project").
       - `vscode`: post message `{ type: 'onboarding-open',
         target }` to the extension host; the extension calls
         `vscode.commands.executeCommand('vscode.openFolder',
         Uri.file(target))`.

The page SHALL NOT block on `runInit` succeeding to render the shell
— the layout appears immediately with all steps in `pending`, then
transitions as SSE events arrive. This prevents a blank window
during the ~200ms `fetch` open time.

The page SHALL be resilient to a mid-stream connection loss (e.g.
server restart, network hiccup): if the reader throws, the current
step's icon transitions to `failed` with an inline message
("Connection lost — try again"), Open Project stays disabled, and
Close remains available. No auto-retry in this iteration.

Log lines flagged `stream: 'stderr'` SHALL be visually distinct
(e.g. red-tinted prefix) without breaking the ring-buffer behavior.

The page has NO ability to cancel the underlying chain — the
subprocess runs to completion server-side regardless of what the
page does. Close simply detaches the page's subscription; the target
directory reflects whatever the chain wrote before or after the
disconnect.

#### Scenario: route mounted with a valid target
- **GIVEN** the user navigates to `/onboarding?target=/tmp/new-proj&channel=electron`
- **WHEN** the page mounts
- **THEN** it fetches `POST /api/init/stream` with `{ dir: "/tmp/new-proj", autoCreateDir: true, autoGitInit: true }` and renders the header, both steps as `pending`, an empty log pane, and both buttons (Close enabled, Open Project disabled)

#### Scenario: SSE events transition step icons
- **GIVEN** the page is subscribed to the stream
- **WHEN** the server emits `step-start scaffold`, then several `log scaffold`, then `step-done scaffold`
- **THEN** the `scaffold` step icon transitions `pending` → `in-progress` → `done` and each log line appears in the log pane in order

#### Scenario: complete event enables Open Project
- **GIVEN** both steps have completed successfully
- **WHEN** the server emits `type: complete` with the target path
- **THEN** the Open Project button becomes enabled; clicking it invokes the channel-specific handler and closes/navigates as documented

#### Scenario: error event disables Open Project
- **GIVEN** the chain fails during `openspec-init`
- **WHEN** the server emits `type: error step: openspec-init message: ...`
- **THEN** the `openspec-init` step icon shows `failed` in red, the error message appears in the log pane, Open Project remains disabled, Close remains enabled

#### Scenario: missing target renders error state
- **GIVEN** the user navigates to `/onboarding` with no `target` query param
- **WHEN** the page mounts
- **THEN** it renders "target required" and a Close button only, and does NOT open a stream

#### Scenario: connection loss transitions to failed
- **GIVEN** the page is mid-stream on `openspec-init`
- **WHEN** the `fetch` reader throws (server restart, network drop)
- **THEN** the current step icon transitions to `failed`, an inline "Connection lost" message shows in the log pane, Open Project stays disabled, Close is the only usable button

#### Scenario: channel inference when query param absent
- **GIVEN** the page mounts at `/onboarding?target=/tmp/foo` with no `channel` param
- **AND** `window.electronAPI` is defined
- **WHEN** the page evaluates channel routing
- **THEN** it treats the channel as `electron` for Close and Open Project handlers

#### Scenario: browser-mode Open Project navigates
- **GIVEN** the page loaded with `?channel=browser` (or inferred it)
- **WHEN** the user clicks Open Project
- **THEN** the app navigates to `/?dir=<target>` and the store re-fetches such that the Kanban shows the new project

### Requirement: Manager Agent Server-Side Singleton Guard

The `POST /api/agents/config` endpoint SHALL enforce two server-
side guardrails around manager-role agents, independent of any
client-side dropdown or chip filter. These guards MUST NOT be
weakened when the Modal UI evolves.

- **Delete guard**: an `action: "delete"` payload whose target
  entry has `roles` containing `manager` MUST return `400` with
  `{ error: "manager agents cannot be deleted from the UI; edit
  agents.yaml directly to remove" }`. `agents.yaml` MUST be
  byte-identical to before.
- **Second-manager guard**: an `action: "upsert"` payload with
  `roles` containing `manager` AND whose `name` differs from any
  existing manager entry MUST return `400` with
  `{ error: "only one agent may include 'manager' in roles" }`.
  `agents.yaml` MUST be byte-identical to before.

Editing the existing manager (same `name`, `roles` still contains
`manager`) MUST succeed — the guard identifies the "second manager"
case by name comparison, not by role alone.

#### Scenario: Delete on the manager entry is rejected

- **GIVEN** `agents.yaml` contains an entry with `roles: [manager]`, name `primary`
- **WHEN** a client POSTs `{ action: "delete", name: "primary" }` to `/api/agents/config`
- **THEN** the response is `400` with `{ error: "manager agents cannot be deleted from the UI; edit agents.yaml directly to remove" }`
- **AND** `agents.yaml` is byte-identical to before

#### Scenario: Upsert that would create a second manager is rejected

- **GIVEN** `agents.yaml` contains an entry with `roles: [manager]`, name `primary`
- **WHEN** a client POSTs `{ action: "upsert", name: "ghost-mgr", roles: ["manager"], mode: "live-shell", command: "claude", args: [] }`
- **THEN** the response is `400` with `{ error: "only one agent may include 'manager' in roles" }`
- **AND** `agents.yaml` is byte-identical to before

#### Scenario: Upsert on the existing manager (same name) is accepted

- **GIVEN** `agents.yaml` contains an entry with `roles: [manager]`, name `primary`, command `claude`
- **WHEN** a client POSTs `{ action: "upsert", name: "primary", roles: ["manager"], mode: "live-shell", command: "aider", args: [] }`
- **THEN** the response is `200` with `{ ok: true }`
- **AND** the manager entry in `agents.yaml` has `command: aider`

#### Scenario: Delete on a non-manager entry is unaffected

- **GIVEN** `agents.yaml` contains an entry with `roles: [code]`, name `coder`
- **WHEN** a client POSTs `{ action: "delete", name: "coder" }`
- **THEN** the response is `200` with `{ ok: true }`
- **AND** the entry is removed from `agents.yaml`

### Requirement: Manager Entry Drives Fresh PTY Startup

The server SHALL resolve the embedded PTY session's startup command via a three-tier priority chain whenever a fresh child is about to be spawned (initial connection or reconnect that spawns a new process). This resolution is independent of any tmux wrapping applied later:

1. **`registry.managerAgent()`** — the first `agents.yaml` entry whose `roles` array contains `manager`. Its `command` + `args` form the startup line. When `args` is EMPTY, the server SHALL defer to the per-CLI Manager-startup dispatch (see the "Manager PTY startup dispatches per CLI when args are empty" requirement); when `args` is non-empty, those args are used verbatim (explicit override). If the entry defines `initialInput` (either as a top-level field pre-reshape or as `prompts.manager` post-reshape), that string SHALL be written to the child's stdin after the startup command settles.
2. **`ITHYNO_TERMINAL_STARTUP` env var** — treated as a single shell string, tokenised on whitespace with standard shell quoting.
3. **Per-project Claude Code session file fallback** — the server SHALL read / mint a UUID at `<projectRoot>/.ithyno/session-claude` and pick `claude --session-id <uuid>` on first launch (file missing or empty), `claude --resume <uuid>` on subsequent launches. The legacy path `<projectRoot>/.ithyno/session-id` SHALL be read as a fallback for existing dev environments but MUST NOT be written (fresh mints go to `session-claude`). `--continue` MUST NOT be used at this tier.

The chain SHALL be evaluated identically whether or not `agents.yaml` declares an `agmsg:` block.

Live PTY sessions SHALL NOT be restarted on `agents.yaml` reload — only the NEXT fresh spawn picks up a changed manager entry.

#### Scenario: Manager entry with explicit non-empty args wins over dispatch
- **GIVEN** `agents.yaml` has a manager entry `command: claude, args: [--dangerously-skip-permissions]`
- **WHEN** a fresh PTY session opens
- **THEN** the child startup line is `claude --dangerously-skip-permissions`
- **AND** the per-CLI dispatch is NOT consulted

#### Scenario: Manager entry with empty args defers to per-CLI dispatch
- **GIVEN** `agents.yaml` has a manager entry `command: claude, args: []`
- **WHEN** a fresh PTY session opens with a `projectRoot` known
- **THEN** the startup line matches `claude --session-id <uuid>` on first launch (mints `<projectRoot>/.ithyno/session-claude`)
- **OR** matches `claude --resume <uuid>` on subsequent launches (reads that file)
- **AND** the value is NOT `claude --continue`

#### Scenario: Legacy `.ithyno/session-id` is honored as fallback read
- **GIVEN** an existing dev environment where `<projectRoot>/.ithyno/session-id` contains a UUID and `session-claude` does NOT exist
- **WHEN** a fresh PTY session opens for a Claude manager with empty args (or no manager entry at all — priority 3)
- **THEN** the startup line is `claude --resume <legacy-uuid>` (legacy file read)
- **AND** no rewrite of the legacy file occurs (it stays as-is)
- **AND** subsequent runs continue to read the legacy file until a fresh mint writes to `session-claude`

#### Scenario: Env var priority preserved
- **GIVEN** no manager entry AND `ITHYNO_TERMINAL_STARTUP=claude` is set AND `.ithyno/session-claude` exists with a UUID
- **WHEN** a fresh PTY session opens
- **THEN** the child startup line is `claude` (from env var)
- **AND** the session-claude file is NOT consulted

### Requirement: Agents Config Delete Confirmation And Add Button

The Agents tab SHALL surface two entry points that are not
covered by `Agents Config Modal Layout Ergonomics`:

- **Delete confirmation dialog** — clicking `[Delete]` on a
  worker agent row (Manager rows have no Delete button per
  `Manager Agent Listed With Other Agents`) MUST NOT immediately
  fire the destructive `POST /api/agents/config { action:
  "delete" }` request. Instead, the tab SHALL render an inline
  confirmation dialog reading `Delete agent <name>?`. Only when
  the user clicks the dialog's Confirm button SHALL the delete
  request be sent. Cancel SHALL dismiss the dialog and keep the
  row intact.
- **`[+ Add agent]` button** — the Agents tab SHALL render a
  `[+ Add agent]` button below the Configured (idle) section
  when the agents registry is loaded. Clicking the button SHALL
  open the AgentConfigModal in Add mode (per
  `Agents Config Modal Layout Ergonomics`'s Add-mode behavior).
  The button SHALL be hidden when the registry could not be
  loaded (`agentConfigError` is set), so the user doesn't
  attempt to add against a broken config file.

Both entry points are Modal-adjacent scaffolding — the Modal's
internal shape is specified by `Agents Config Modal Layout
Ergonomics`. This requirement covers only the row-level and
section-level UI that lives outside the Modal itself.

#### Scenario: Delete on a worker row surfaces confirmation

- **GIVEN** the Agents tab shows a worker agent row named `claude-code`
- **WHEN** the user clicks the row's `[Delete]` button
- **THEN** an inline confirmation dialog appears reading `Delete agent claude-code?`
- **AND** no `POST /api/agents/config` request has fired yet

#### Scenario: Confirm sends the delete request

- **GIVEN** the Delete confirmation dialog is open for `claude-code`
- **WHEN** the user clicks the dialog's Confirm button
- **THEN** the client posts `{ action: "delete", name: "claude-code" }` to `/api/agents/config`
- **AND** on success the row disappears from the Configured list

#### Scenario: Cancel dismisses the dialog without firing

- **GIVEN** the Delete confirmation dialog is open for `claude-code`
- **WHEN** the user clicks the dialog's Cancel button
- **THEN** the dialog closes
- **AND** the row remains in the Configured list
- **AND** no `POST /api/agents/config` request is fired

#### Scenario: `[+ Add agent]` button opens the modal

- **GIVEN** the agents registry is loaded successfully
- **WHEN** the Agents tab renders
- **THEN** a `[+ Add agent]` button appears below the Configured (idle) section
- **AND** clicking it opens the AgentConfigModal in Add mode

#### Scenario: `[+ Add agent]` button hidden on registry error

- **GIVEN** the agents registry failed to load (`agentConfigError` is set on the store)
- **WHEN** the Agents tab renders
- **THEN** the `[+ Add agent]` button is NOT rendered
- **AND** the error banner explains the config problem instead

### Requirement: Agents Config Write Endpoint

The system SHALL expose `POST /api/agents/config` accepting a
JSON body that is either an upsert or a delete. The payload shape
matches the post-reshape `agents.yaml` schema (`mode` + `roles[]`
+ `prompts` map, per `reshape-agents-yaml-mode-roles`):

```json
{ "action": "upsert",
  "name": "<kebab-case>",
  "roles": ["<one or more of the accepted role values>"],
  "mode": "single-prompt" | "live-shell",
  "command": "<string; required>",
  "args": ["<string>", ...],
  "prompts": { "<role>": "<string>", ... },
  "specialties": ["<string>", ...],
  "concurrency": <integer ≥ 1>,
  "dedicated": <boolean>,
  "description": "<optional string>"
}
```

or

```json
{ "action": "delete", "name": "<kebab-case>" }
```

The handler SHALL:

- gate on `isLocal(req.socket.remoteAddress)` and the existing
  CSRF hook (return `403` when either fails);
- validate the payload against the same `AgentDef` shape rules
  the loader uses (name is kebab-case; `roles` non-empty;
  `mode` one of the accepted values; `concurrency` ≥ 1) and
  return `400` with an informative error message if the payload
  is malformed;
- atomically write the modified `agents.yaml` — write to a
  sibling `.tmp` file first, then rename over the original in a
  single syscall so a crash mid-write leaves either the old
  file or the new file, never partial YAML;
- preserve unrelated top-level keys (`parallelExecution:`,
  `agmsg:`, and any unknown keys) byte-intent via a parse →
  merge → serialize round-trip;
- return `{ "ok": true }` on success (`200`);
- rely on the existing agents.yaml file watcher to trigger the
  registry reload; the handler MAY additionally invoke
  `agentRegistry.load()` synchronously to close the race between
  the write and the client's follow-up `GET /api/agents/config`.

Manager-specific guardrails (delete rejection + singleton) are
described by `Manager Agent Server-Side Singleton Guard`
(landed via `revert-refine-agents-config-modal`, 2026-07-19)
and take precedence over this requirement's generic
validate → write path.

#### Scenario: Upsert on existing agent overwrites in place

- **GIVEN** `agents.yaml` contains an agent `claude-code` with `roles: [code]`
- **WHEN** a client POSTs `{ action: "upsert", name: "claude-code", roles: ["review"], mode: "single-prompt", command: "claude", args: [], prompts: { review: "/opsx:review ${change_id}" }, specialties: [], concurrency: 1, dedicated: false }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list contains one entry named `claude-code`
  with `roles: [review]` and no duplicate `claude-code` entry
- **AND** the top-level `parallelExecution:` key and any other unrelated keys
  survive byte-intent

#### Scenario: Upsert on missing name creates a new agent

- **GIVEN** `agents.yaml` does not contain any agent named `reviewer`
- **WHEN** a client POSTs `{ action: "upsert", name: "reviewer", roles: ["review"], mode: "single-prompt", command: "claude", args: [], prompts: {}, specialties: [], concurrency: 1, dedicated: false }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list has a new entry named `reviewer`
  at the end

#### Scenario: Delete removes the entry

- **GIVEN** `agents.yaml` contains `claude-code` and `reviewer`
- **WHEN** a client POSTs `{ action: "delete", name: "reviewer" }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list contains only `claude-code`

#### Scenario: Delete on missing name returns 404

- **GIVEN** `agents.yaml` contains only `claude-code`
- **WHEN** a client POSTs `{ action: "delete", name: "nonexistent" }`
- **THEN** the response is `404` with `{ error: "agent 'nonexistent' not found" }`
- **AND** the file is unchanged

#### Scenario: Malformed payload rejected without writing

- **GIVEN** a POST body missing the `action` discriminator, or with
  `concurrency: 0`, or with `roles: []`, or with an unknown `mode`
- **WHEN** the handler processes it
- **THEN** the response is `400` with an error message naming the
  first-failed field
- **AND** `agents.yaml` is byte-identical to before the request

#### Scenario: Non-local request rejected

- **GIVEN** a POST from a non-loopback source
- **WHEN** the handler is invoked
- **THEN** the response is `403` with `{ error: "local only" }`
- **AND** `agents.yaml` is byte-identical to before the request

#### Scenario: Missing session token rejected

- **GIVEN** a POST from a loopback source with no `x-session-token` header and no `?token=` query parameter
- **WHEN** the handler is invoked
- **THEN** the CSRF hook responds `401` with `{ error: "auth required" }` before the endpoint runs
- **AND** `agents.yaml` is byte-identical to before the request

### Requirement: Revert Slash Command

The project SHALL provide a `/opsx:revert <scope>` slash command that a
worker or user runs inside Claude Code to open a Case α or Case β
revert change under the naming convention `revert-<scope>`. The
command SHALL enforce the PENDING annotation and (Case α only)
REVERTED annotation conventions documented in `CLAUDE.md` and
`.claude/skills/openspec-flow/SKILL.md`.

> ⚠️ **PENDING MODIFIED** by [unify-ithyno-slash-command-surface](../../changes/unify-ithyno-slash-command-surface/): the slash command is renamed `/opsx:revert` → `/ithy-opsx:revert` and the skill id `opsx-revert` → `ithy-opsx-revert` as part of consolidating ithyno's slash-command surface under `/ithy-opsx:*`.

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

### Requirement: Serve Worktree Version of a Change
`GET /api/changes/:id` SHALL accept an optional `tree=worktree` query
parameter that, when present, causes the server to read the change from
`.worktrees/<change-id>/openspec/changes/<change-id>/` instead of the
main-tree openspec directory — so the dashboard can render whatever
the running agent has produced without having to wait for the branch
to be merged.

#### Scenario: Worktree exists
- **WHEN** the client requests `/api/changes/foo?tree=worktree` and `.worktrees/foo/openspec/changes/foo/` exists
- **THEN** the server returns the parsed `Change` shape (same schema as the main-tree endpoint) with the worktree's proposal, tasks, design, and delta specs

#### Scenario: Worktree missing
- **WHEN** the client requests `/api/changes/foo?tree=worktree` but no `.worktrees/foo/` directory exists
- **THEN** the server returns 404 with a body explaining the fallback: `{ "error": "no worktree at .worktrees/foo. The plain URL /change/foo shows the main-tree view." }`

#### Scenario: No query param preserves existing behavior
- **WHEN** the client requests `/api/changes/foo` without the `tree` param
- **THEN** the server returns the main-tree change exactly as today (no regression)

### Requirement: ChangeDetail URL-Driven Tree Switch
The ChangeDetail route SHALL read the `tree` URL search param and
render the worktree version of the change when `tree=worktree` is
present, so the URL is the single source of truth for which tree is
being viewed.

#### Scenario: URL with `?tree=worktree` renders worktree content
- **WHEN** the user navigates to `/change/foo?tree=worktree`
- **THEN** the page fetches from `/api/changes/foo?tree=worktree` and displays that change (tasks, proposal, delta specs) instead of the store's main-tree copy

#### Scenario: Plain URL renders main-tree content
- **WHEN** the user navigates to `/change/foo`
- **THEN** the page renders `state.changes.find(c => c.id === "foo")` as today; no new fetch is performed for the main-tree case

#### Scenario: 404 falls back to main tree
- **WHEN** the worktree fetch returns 404 (worktree gone / never existed)
- **THEN** the page renders the main-tree change with a non-blocking notice `"worktree gone — showing main tree"`; the URL is not rewritten so a page refresh retries

### Requirement: Kanban Card Link Uses Worktree URL When Appropriate
The Kanban `ChangeCard` component SHALL append `?tree=worktree` to its
navigation link when the change has an active worktree, so clicking a
running / mergeable card lands the user on the state they were watching
on the board.

#### Scenario: Active worktree → worktree URL
- **WHEN** the card renders for a change whose latest job is `running`, or whose worktree is awaiting merge/discard
- **THEN** the card's `<Link>` `to` prop is `/change/<id>?tree=worktree`

#### Scenario: No active worktree → plain URL
- **WHEN** the card renders for a TODO change, a DONE change, or one whose worktree has been merged/discarded
- **THEN** the card's `<Link>` `to` prop is `/change/<id>` (no query param)

### Requirement: Switch-to-Main Affordance in ChangeDetail Head
When ChangeDetail is rendering the worktree view, the page head SHALL
show a pill labelled `viewing worktree` that links to the same change
without the `tree` query param, so the user can toggle between the
worktree and the main-tree view.

#### Scenario: Worktree view shows the pill
- **WHEN** the URL contains `tree=worktree`
- **THEN** the pill renders with the label `viewing worktree` and clicking it navigates to `/change/<id>`

#### Scenario: Main view hides the pill
- **WHEN** the URL has no `tree` param
- **THEN** the pill does not render; there is no toggle-to-worktree affordance from this page (the Kanban card is the entry point)

### Requirement: Selectable Theme (Light / Dark / System)

The dashboard SHALL support a user-selectable theme with three
values: `system` (follow OS preference via
`prefers-color-scheme`), `light`, and `dark`. Selection SHALL
persist per browser via `localStorage["ithyno.theme"]`. The
applied theme SHALL cascade to every UI surface including the
embedded xterm.js terminal.

The theme toggle SHALL live in the Settings tab (alongside
`parallelExecution`) as a tri-state segmented control. The header
SHALL NOT surface the toggle — theme is set-once configuration,
not a frequently-flipped control.

The applied theme SHALL be represented by a `data-theme` attribute
on `<html>` (`data-theme="dark"` or `data-theme="light"`). CSS
declares palettes as `:root[data-theme="dark"] { ... }` and
`:root[data-theme="light"] { ... }`.

To prevent flash-of-unstyled-content (FOUC), an inline `<script>`
in `web/index.html` SHALL read `localStorage["ithyno.theme"]` and
resolve the applied `data-theme` value BEFORE any React code
runs.

#### Scenario: System theme follows OS preference

- **GIVEN** the theme setting is `system` (default on first load)
- **AND** the OS is in dark mode
- **THEN** the dashboard renders using the dark palette
- **WHEN** the OS switches to light mode while the dashboard is open
- **THEN** the dashboard flips to the light palette live (no reload required)

#### Scenario: Manual override persists

- **WHEN** the user selects `Light` in the Settings theme toggle
- **THEN** the palette flips to light regardless of OS preference
- **AND** the choice is persisted; next reload starts in light without asking the OS

#### Scenario: Pre-render FOUC guard

- **GIVEN** `localStorage["ithyno.theme"]` is set to `"light"`
- **WHEN** the browser loads `index.html`
- **THEN** `document.documentElement.dataset.theme` is `"light"` BEFORE the React bundle mounts
- **AND** the initial paint uses the light palette (no dark flash)

#### Scenario: Embedded terminal palette matches theme

- **WHEN** the applied theme flips
- **THEN** the xterm.js `theme` option is updated using CSS variable values
- **AND** the terminal's background / foreground / cursor colors align with the surrounding UI
- **AND** the terminal is NOT disposed and recreated (scrollback is preserved)

#### Scenario: Agent output SGR colors remain readable

- **GIVEN** the Agents page renders a job transcript with SGR-colored spans (from the runner's ansi-to-html)
- **WHEN** the theme flips
- **THEN** the SGR-driven span colors are unchanged (they encode semantic meaning from the CLI, not UI decoration)
- **AND** the surrounding `<pre>` background flips per palette; contrast against the fixed SGR colors remains readable

### Requirement: Kanban Filter Input

The Overview page SHALL expose a filter input above the Kanban
columns that removes non-matching change cards from view
(case-insensitive substring match against `change.id`, proposal
title, and tag names). The input SHALL be reachable via `Cmd+F` /
`Ctrl+F` from the Overview page; `Esc` while the input is focused
clears and blurs. Filter state SHALL NOT persist across page
reloads.

#### Scenario: Filter narrows visible cards
- **GIVEN** the Overview page renders 20 change cards across three columns
- **WHEN** the user types "task" into the filter input
- **THEN** only cards whose id, title, or any tag contains "task" (case-insensitively) remain visible
- **AND** column headers reflect the reduced count

#### Scenario: Cmd+F focuses the filter
- **WHEN** the user presses `Cmd+F` (macOS) or `Ctrl+F` (other OS) while on the Overview page
- **AND** the filter input is not already focused
- **THEN** the browser's default find-in-page is preempted
- **AND** the filter input gains focus

#### Scenario: Escape clears filter
- **GIVEN** the filter input is focused with non-empty text
- **WHEN** the user presses `Esc`
- **THEN** `filterText` is cleared
- **AND** the input is blurred
- **AND** all cards return to view

#### Scenario: Non-Overview pages preserve default Cmd+F
- **WHEN** the user is on `/agents`, `/change/*`, `/specs`, `/tags`, or `/docs`
- **AND** presses `Cmd+F`
- **THEN** the browser's native find-in-page opens as usual (no shortcut hijack)

#### Scenario: Reload clears filter
- **GIVEN** an active filter with non-empty text
- **WHEN** the user reloads the page
- **THEN** the filter starts empty; all cards visible
- **AND** no localStorage entry for the filter exists

### Requirement: Multi-Dispatch Orchestrator

The system SHALL provide `/ithy-opsx:dispatch-multi <id1> [id2]
...` — a slash command that drives N changes through
`code → review → verify` concurrently using the same agent
registry and worktree infrastructure as `/ithy-opsx:dispatch`.

**Concurrency cap.** The orchestrator SHALL respect
`agents.yaml.maxParallel` (default `3` when absent, valid range
`[1, 10]`). Given `len(ids) > maxParallel`, the excess ids SHALL
be queued; a new worker starts each time a running one finishes.
`maxParallel: 1` SHALL degrade to sequential behavior equivalent
to calling `/ithy-opsx:dispatch` per id.

**Report token extension.** Workers spawned by dispatch-multi (and
by `/ithy-opsx:dispatch` after its report-contract update)
SHALL emit their completion message in the form:

```
stage:$S status:done change:<change-id>
```

The Manager's inbox parser SHALL accept BOTH the extended shape
above AND the legacy `stage:$S status:done` shape. The legacy
shape assumes a single in-flight change per agent (correct for
single dispatch); the extended shape disambiguates across the N
in-flight changes.

**Combined poll loop.** The Manager SHALL maintain a single poll
loop over the agmsg inbox for the whole invocation. On each poll
tick (5-second interval), for every unread message from a worker
whose `(stage, change)` matches an in-flight entry, the Manager
SHALL:

1. Commit any uncommitted worker output on `agent/<change-id>`
   (`impl: <change-id>`) — same Manager-commit contract as
   single-dispatch.
2. Advance the change's phase per the received stage:
   `code → coded`, `review pass → reviewed`, `verify pass →
   done`.
3. On `review needs-rework`, loop back to spawn a fresh code
   worker for that change with the prior findings appended.
   Capped by `MAX_ITERATIONS = 5` per change.
4. On any escalation from any change, that change is dropped
   from the loop and its status becomes `escalated`; other
   in-flight changes continue.
5. After a change reaches a terminal state (`done` or
   `escalated`), if the queue has more ids, pop and spawn the
   next code stage so the active count stays at
   `min(maxParallel, remaining)`.

**Preflight.** Before spawning any worker, the orchestrator SHALL
validate every input id resolves to an active change under
`openspec/changes/<id>/` (not archived). On any unknown id, the
orchestrator MUST escalate the first unknown id and refuse to
spawn any workers.

**Termination.** The loop SHALL end when every input id reaches
`done` or `escalated`. On exit, the orchestrator SHALL print a
per-id summary line reporting the final phase, iteration count,
and elapsed time.

#### Scenario: Two ids fit within default maxParallel

- **GIVEN** `agents.yaml` has no `maxParallel` field (default 3) and code / review / verify workers declared
- **AND** `add-a` and `add-b` are both active in-flight changes
- **WHEN** the user invokes `/ithy-opsx:dispatch-multi add-a add-b`
- **THEN** the orchestrator preflights both ids, then spawns code workers for both concurrently (2 tmux panes / 2 Task subagents)
- **AND** the Manager's poll loop watches for messages from both
- **AND** each change advances through `coded → reviewed → done` independently as its worker messages arrive

#### Scenario: Concurrency cap queues the excess

- **GIVEN** `agents.yaml` has `maxParallel: 2` and code / review / verify workers declared
- **AND** three active changes `add-a`, `add-b`, `add-c`
- **WHEN** the user invokes `/ithy-opsx:dispatch-multi add-a add-b add-c`
- **THEN** code workers spawn for `add-a` and `add-b` immediately
- **AND** `add-c` waits in the queue
- **WHEN** `add-a` finishes its full loop
- **THEN** the orchestrator spawns the code worker for `add-c`

#### Scenario: Unknown id preempts spawn

- **GIVEN** `add-a` is active but `add-typo` does not exist
- **WHEN** the user invokes `/ithy-opsx:dispatch-multi add-a add-typo`
- **THEN** the orchestrator escalates the first unknown id
- **AND** no worker for either change is spawned
- **AND** `agents.yaml` and every worktree is untouched

#### Scenario: Report token disambiguates across in-flight changes

- **GIVEN** `add-a` and `add-b` are both mid-flight, each with a `claude` code worker running
- **WHEN** worker A sends `stage:code status:done change:add-a`
- **AND** worker B sends `stage:code status:done change:add-b`
- **THEN** the Manager correctly routes each message to its owner and advances only the matching change
- **AND** no cross-change message confusion occurs

#### Scenario: Legacy report shape still works for single-change dispatch

- **GIVEN** a worker running under `/ithy-opsx:dispatch <id>` (single-change) emits legacy `stage:code status:done` (no `change:<id>` suffix)
- **WHEN** the Manager's inbox parser receives it
- **THEN** the message MUST be accepted and routed to the sole in-flight change for that entry
- **AND** the single-dispatch flow completes unchanged

#### Scenario: One change escalates, others continue

- **GIVEN** `add-a`, `add-b`, `add-c` are all in-flight under multi-dispatch
- **WHEN** `add-a` hits `MAX_ITERATIONS` and escalates
- **THEN** `add-a` is dropped from the poll loop with status `escalated`
- **AND** `add-b` and `add-c` continue their loops undisturbed
- **AND** the final exit summary shows `add-a: escalated`, others `done` (or their respective final state)

#### Scenario: `maxParallel: 1` degrades to sequential

- **GIVEN** `agents.yaml` has `maxParallel: 1`
- **WHEN** the user invokes `/ithy-opsx:dispatch-multi add-a add-b`
- **THEN** the orchestrator spawns the code worker for `add-a` first, waits for its full loop to reach `done` or `escalated`, then spawns for `add-b`
- **AND** the behavior is equivalent to calling `/ithy-opsx:dispatch add-a && /ithy-opsx:dispatch add-b`

#### Scenario: maxParallel out of range rejected

- **GIVEN** `agents.yaml` has `maxParallel: 0` (or `11`, or a string)
- **WHEN** the registry loads
- **THEN** the loader SHALL fail with an error naming the invalid value
- **AND** the last-known-good config is preserved

#### Scenario: agents.yaml without maxParallel defaults to 3

- **GIVEN** `agents.yaml` has no `maxParallel` field
- **WHEN** the registry loads
- **THEN** `AgentConfig.maxParallel` is `3`

### Requirement: Column-header Start selector is TODO-only

The Kanban `Start ▼ (N)` column-header bulk selector SHALL render only in the TODO column. IN-PROGRESS and DONE columns SHALL NOT render this selector.

#### Scenario: TODO column shows the selector

- **GIVEN** the TODO column contains N cards
- **WHEN** the Kanban renders the column header
- **THEN** a `Start ▼ (N)` control is present
- **AND** N reflects the TODO card count

#### Scenario: IN-PROGRESS column has no selector

- **GIVEN** the IN-PROGRESS column contains M cards
- **WHEN** the Kanban renders the column header
- **THEN** no `Start ▼` control appears
- **AND** no `(M)` counter appears alongside where the selector used to be
- **AND** the column-title + any existing count badge distinct from the selector's counter render as before

#### Scenario: DONE column has no selector

- **GIVEN** the DONE column contains K cards
- **WHEN** the Kanban renders the column header
- **THEN** no `Start ▼` control appears
- **AND** no `(K)` counter appears alongside where the selector used to be

#### Scenario: Per-card actions are unchanged

- **WHEN** the Kanban renders any card in any column
- **THEN** every per-card action button (including `Start` where it exists today) is unchanged by this requirement
- **AND** the scope of this change is limited to the column-header `Start ▼ (N)` selector

### Requirement: `maxReworkRounds` config field

`agents.yaml` SHALL support an optional top-level `maxReworkRounds` integer field, mirroring `maxParallel`'s shape and validation. Its value SHALL cap the code↔review rework loop for both `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi`.

#### Scenario: Default when field absent

- **GIVEN** `agents.yaml` does not declare `maxReworkRounds`
- **WHEN** the registry loads the config
- **THEN** the resolved `maxReworkRounds` is `5`
- **AND** `publicConfig()` reports `maxReworkRounds: 5`

#### Scenario: Valid value in range

- **GIVEN** `agents.yaml` declares `maxReworkRounds: 3`
- **WHEN** the registry loads
- **THEN** the resolved value is `3`
- **AND** the next `/ithy-opsx:dispatch` invocation escalates after 3 rework rounds

#### Scenario: Value out of range is clamped

- **GIVEN** `agents.yaml` declares `maxReworkRounds: 0` (or `-1`, or a value below the minimum)
- **WHEN** the registry loads
- **THEN** the resolved value is clamped to `1` (the minimum)
- **AND** a warning is emitted at load time naming the invalid value + the clamped result

- **GIVEN** `agents.yaml` declares `maxReworkRounds: 11` (or any value above the maximum `10`)
- **WHEN** the registry loads
- **THEN** the resolved value is clamped to `10`
- **AND** a warning is emitted

#### Scenario: Non-numeric value falls back to default

- **GIVEN** `agents.yaml` declares `maxReworkRounds: "five"` (or any non-numeric)
- **WHEN** the registry loads
- **THEN** the resolved value is `5` (the default)
- **AND** a warning is emitted naming the invalid input

#### Scenario: Dispatch skill reads the resolved value

- **GIVEN** the resolved `maxReworkRounds` is `N`
- **WHEN** `/ithy-opsx:dispatch <id>` or `/ithy-opsx:dispatch-multi <ids>` runs its code↔review loop for any change
- **THEN** the loop escalates that change after `N` rework rounds
- **AND** other changes in a multi-dispatch invocation are unaffected — the cap is per-change, not per-invocation

#### Scenario: Client can read the config

- **WHEN** the client fetches `/api/agents/config` (or the equivalent endpoint exposing `publicConfig()`)
- **THEN** the response includes `maxReworkRounds` alongside `maxParallel`

### Requirement: 2-branch decision on Open Project of a non-openspec folder

When the user opens a folder that does NOT contain an `openspec/` directory, the dashboard SHALL replace the current dead-end "No OpenSpec project found" copy with a decision panel exposing two clear next actions: **Initialize openspec here** and **Open dashboard anyway** (the second action was previously "Browse read-only" and mounted a markdown-tree viewer; it now opens the empty dashboard directly).

#### Scenario: Decision panel renders for non-openspec folder

- **GIVEN** the user opens a folder that has no `openspec/` subdirectory
- **WHEN** the dashboard loads
- **THEN** a decision panel is shown, headed with the folder path
- **AND** it presents two buttons: `Initialize openspec here`, `Open dashboard anyway`

#### Scenario: Initialize action creates openspec and reloads

- **WHEN** the user clicks `Initialize openspec here`
- **THEN** the dashboard invokes `POST /api/init` for the current folder
- **AND** on success it refetches `/api/state`
- **AND** the dashboard transitions to the standard Kanban view for the newly-initialized project

#### Scenario: Open dashboard anyway renders empty Kanban

- **WHEN** the user clicks `Open dashboard anyway`
- **THEN** the dashboard sets a client-side `browseMode = true` flag
- **AND** the app renders its normal chrome (topbar + Routes) as if `state.exists === true`
- **AND** the Overview page (Kanban) renders with zero changes; the standard "no changes" empty-state copy is shown
- **AND** the dedicated `<ReadOnlyBrowse />` markdown-tree component is NOT mounted
- **AND** the dashboard does NOT auto-launch the embedded terminal unless `agents.yaml` is present (guard from `guard-terminal-autolaunch-on-agents-yaml` still applies)

#### Scenario: Openspec-present folder is unaffected

- **WHEN** the user opens a folder that already contains `openspec/`
- **THEN** the decision panel is NOT shown
- **AND** the standard Kanban view loads as before this requirement

#### Scenario: CLAUDE.md hint

- **GIVEN** the picked folder contains `CLAUDE.md` at its root
- **WHEN** the decision panel renders
- **THEN** a short informational line appears beneath the buttons noting that CLAUDE.md was detected and will be picked up as agent-facing context once openspec is initialized
- **AND** when `CLAUDE.md` is absent, no such hint appears

<!--
  Originally we planned to REMOVED the "Browse endpoints for markdown"
  requirement, but the openspec archive validator rejects a bare REMOVED
  section without a valid replacement body. Since the endpoint code
  itself stays in place (as inert), we leave the requirement in the
  main spec for now and rely on ReadOnlyBrowse's file-level UNUSED
  header to signal the inert status. A future cleanup change can do a
  proper propose to remove the requirement AND the code together.
-->

### Requirement: Browse endpoints for markdown

The server SHALL expose two read-only endpoints — `GET /api/browse/markdown-tree` and `GET /api/browse/markdown?path=<rel>` — that let the Browse view enumerate and read markdown files under the current project root without requiring `openspec/` to exist.

#### Scenario: Tree endpoint returns bounded markdown listing

- **WHEN** a client sends `GET /api/browse/markdown-tree` for a project
- **THEN** the response is a JSON array of `{ path, name, kind: "file" | "dir", children? }` entries
- **AND** only files with the `.md` or `.markdown` extension appear as `kind: "file"` leaves
- **AND** directories `node_modules/`, `.git/`, `.worktrees/`, `dist/`, `build/`, `coverage/` and any `.gitignore`-declared paths are excluded from the scan
- **AND** the scan is bounded to at most 5 directory levels deep and 500 total files

#### Scenario: Markdown-file endpoint validates path

- **WHEN** a client sends `GET /api/browse/markdown?path=<rel>` with a path that resolves inside the project root
- **THEN** the response is `{ path, content }` with the file's UTF-8 content
- **AND** files above 5 MB return 413

- **WHEN** the path contains `..` segments, is absolute, or resolves outside the project root via symlink
- **THEN** the response is 400 with a clear denial message
- **AND** no file content is returned

#### Scenario: Endpoints work without openspec/

- **GIVEN** the project folder has NO `openspec/` directory
- **WHEN** the Browse view calls either endpoint
- **THEN** both endpoints succeed
- **AND** their behavior does not depend on `openspec/` existence — this is precisely what enables the Browse mode

### Requirement: Import endpoint generates openspec specs from code and docs

The system SHALL expose `POST /api/import/spec-generation` that, given a project root, dispatches a Claude Code sub-agent (via the Task tool inside the ithyno-side Manager session) to read the project's code and docs and produce a first-draft `openspec/specs/` set. The endpoint SHALL run preflight checks and hand the job off to Manager for execution. Completion is signaled via the existing workspace file-watch WS broadcast (not a subprocess SSE stream).

> ⚠️ **PENDING MODIFIED** by [enable-import-both-patterns](../../changes/enable-import-both-patterns/): Adds doctor preflight (409 when no agent CLI installed) + pattern classification (A/B) in the response + Pattern-A external-target watcher.

#### Scenario: Preflight blocks existing openspec/

- **WHEN** a client sends `POST /api/import/spec-generation` with `projectRoot: <path>` for a directory whose `openspec/` already exists
- **AND** the request body does NOT include `force: true`
- **THEN** the endpoint returns 409 with a clear message naming the existing `openspec/` path
- **AND** no generation job is dispatched

#### Scenario: Preflight blocks oversized projects

- **WHEN** the projectRoot has combined code + docs size above the configured cap (default 50 MB)
- **THEN** the endpoint returns 400 with the actual size and the cap
- **AND** no generation job is dispatched

#### Scenario: Successful dispatch

- **GIVEN** a projectRoot without `openspec/` under the size cap
- **WHEN** the endpoint accepts a `POST /api/import/spec-generation` request
- **THEN** it returns 202 with `{ jobId, targetPath }`
- **AND** the server injects `/ithy-opsx:import <targetPath>` into the ithyno-side Manager's PTY (using the same inject mechanism the Kanban Start button uses)
- **AND** the server does NOT spawn a `claude -p` subprocess
- **AND** no SSE endpoint is exposed for subprocess stdout — progress is observed via the workspace file-watch WS broadcast

#### Scenario: Completion is observed via workspace file watch

- **GIVEN** the Manager's Task-tool sub-agent has written `openspec/GENERATED.md` in the target project
- **WHEN** the server's workspace file watcher detects the write
- **THEN** the server broadcasts a `state-replaced` WS event as it does for any workspace change
- **AND** the dashboard reacts to that event: refetches state, exits the ImportProjectFlow overlay, transitions to the Kanban view of the newly-initialized project
- **AND** the dashboard renders the LLM-generated banner (unchanged from prior spec)

### Requirement: Generated specs validate cleanly

Every capability spec.md written by the import subagent SHALL be valid OpenSpec — passing `openspec validate --all --strict` without modification.

#### Scenario: Generated specs pass validation

- **GIVEN** a completed import job for a projectRoot
- **WHEN** `openspec validate --all --strict` is invoked in that projectRoot
- **THEN** the exit code is 0
- **AND** at least one capability spec.md exists under `openspec/specs/`

### Requirement: Import banner + GENERATED marker

The dashboard SHALL surface a persistent, dismissible banner after import completes indicating the specs are LLM-generated drafts. The generated tree SHALL include a top-level `openspec/GENERATED.md` recording the generation.

#### Scenario: Post-import banner

- **GIVEN** the import job has just completed for the current project
- **WHEN** the dashboard transitions to the Kanban view of the newly-initialized project
- **THEN** a top-of-page banner reads "Specs are LLM-generated drafts — review before relying on them"
- **AND** the banner has a dismiss button that hides it for the current session

#### Scenario: GENERATED.md marker

- **GIVEN** a completed import job
- **WHEN** a reader opens the project's `openspec/GENERATED.md`
- **THEN** the file exists and includes: a header noting LLM generation, the timestamp of generation, and a list of every capability directory that was drafted

### Requirement: Import does not auto-commit

The import sub-agent SHALL leave the project's git working tree with the openspec/ files untracked or added (not committed). The user reviews and commits manually.

#### Scenario: No auto-commit

- **GIVEN** the import job has completed on a git-repo projectRoot
- **WHEN** the user inspects `git status` in that projectRoot
- **THEN** the `openspec/` tree and `openspec/GENERATED.md` appear as untracked files (or as `A`-marked staged files if the user pre-staged), and no new commit exists on the current branch attributable to the import
- **AND** the Task-tool sub-agent's boot prompt includes an explicit "DO NOT commit" instruction

### Requirement: Import uses the ithyno tool's own agents.yaml

The import sub-agent SHALL be spawned via the Task tool inside the ithyno-side Manager's Claude Code session — the Manager itself is configured by ithyno's own `agents.yaml`. The target project (which by definition has no `agents.yaml`) is only the sub-agent's working directory, not its dispatch context.

#### Scenario: Target agents.yaml is not required

- **GIVEN** the target project has no `agents.yaml` (the common case for import)
- **WHEN** the import sub-agent is spawned
- **THEN** the spawn happens via Task tool inside Manager, using Manager's configured role (from ithyno's `agents.yaml`)
- **AND** no error is raised for the target's missing `agents.yaml`

#### Scenario: Manager session is required

- **GIVEN** ithyno's own Manager PTY is not running (e.g., ithyno's own `agents.yaml` is absent or terminal auto-launch was disabled)
- **WHEN** the client hits `POST /api/import/spec-generation`
- **THEN** the endpoint returns 503 with a message pointing at the missing Manager, and no dispatch is attempted

### Requirement: `/ithy-opsx:import <target-path>` skill

The Manager's slash-command surface SHALL include a new skill `/ithy-opsx:import <target-path>` that, when invoked, uses the Task tool to spawn a code sub-agent whose boot prompt encodes the import task (target path + no-commit rule + capability-discovery guidance + `openspec init` + `openspec/specs/` write instructions + `openspec/GENERATED.md` marker write instruction).

#### Scenario: Skill invocation spawns a Task-tool sub-agent

- **GIVEN** Manager receives the string `/ithy-opsx:import /path/to/target` on its PTY
- **WHEN** Manager executes the skill
- **THEN** Manager calls Task tool with `subagent_type: "claude"` and a boot prompt tailored for the import task
- **AND** the sub-agent's `cwd` is `/path/to/target`
- **AND** the sub-agent's boot prompt includes the target path, the no-commit invariant, the capability-discovery guidance, and the `openspec/GENERATED.md` write instruction
- **AND** Manager's context is NOT flooded with the sub-agent's discovery Read/Grep/Bash calls — only the sub-agent's returned summary reaches Manager's context

#### Scenario: Sub-agent is autonomous

- **GIVEN** the import sub-agent has been spawned
- **WHEN** it needs to decide which docs / code files to sample for capability discovery
- **THEN** it uses its own Read / Grep / Bash tools to explore the target project autonomously
- **AND** the parent Manager does not receive per-file progress signals — Manager sees only the final summary

### Requirement: Phase-lane view derives lanes from agents.yaml roles

The Overview page's Phase view (rendered when `overviewLayout === "phase"`) SHALL derive its lane list dynamically from the current `agents.yaml.agents[].roles` declaration, rather than rendering a fixed 4-lane set.

The lane set SHALL be built in workflow order: `[propose?, code, review?, verify?, done]` where:
- `code` SHALL always be included (Manager can substitute for a missing code-role agent via Task-tool self-dispatch, per the dispatch skill's Manager-fallback contract).
- `done` SHALL always be included (terminal state).
- `propose`, `review`, `verify` SHALL be included only when at least one agent's `roles` array contains that identifier.

The lane labels SHALL be present-continuous English words matching the role: `PROPOSING`, `CODING`, `REVIEWING`, `VERIFYING`, `DONE`.

When `agents.yaml` changes at runtime (server broadcasts `agents-updated` WS event), the lane list SHALL re-derive without requiring a page reload.

#### Scenario: Minimal agents.yaml (only code) renders 2 lanes
- **GIVEN** `agents.yaml` declares one agent with `roles: [code]` (and manager-only agents)
- **WHEN** the user opens the Phase view
- **THEN** exactly 2 lanes render: `CODING` and `DONE`

#### Scenario: Two-role agents.yaml renders 3 lanes
- **GIVEN** `agents.yaml` declares agents with roles `[code, review]` between them
- **WHEN** the user opens the Phase view
- **THEN** exactly 3 lanes render: `CODING`, `REVIEWING`, `DONE`

#### Scenario: Full agents.yaml renders 5 lanes
- **GIVEN** `agents.yaml` declares at least one agent with each of `propose`, `code`, `review`, `verify`
- **WHEN** the user opens the Phase view
- **THEN** 5 lanes render in workflow order: `PROPOSING`, `CODING`, `REVIEWING`, `VERIFYING`, `DONE`

#### Scenario: agents.yaml live update re-derives lanes
- **GIVEN** the Phase view is open with `CODING` + `DONE` visible
- **WHEN** the user (or another client) updates `agents.yaml` to add a `review` role and the server broadcasts `agents-updated`
- **THEN** the Phase view re-renders with `CODING`, `REVIEWING`, `DONE` without a full page reload

### Requirement: Phase-lane bucketization routes changes to next-stage lane

When rendering the Phase view, each change SHALL be routed to the lane representing the **next workflow stage** it awaits, not the last stage it completed. The routing rules are:

- `phase` undefined or unknown → the `propose` lane if present, otherwise the first lane in the derived list.
- `phase === "proposed"` → the `code` lane.
- `phase === "coded"` → the `review` lane if present, otherwise `done`.
- `phase === "reviewed"` → the `verify` lane if present, otherwise `done`.
- `phase === "done"` → the `done` lane.
- `phase === "needs-human"` → route by `priorPhase` under the same rules; if `priorPhase` is also unresolvable, fall through to the first lane.

No change SHALL be dropped from view. When a phase would map to a lane that is not in the current derived list, it SHALL fall through to the next available lane (in most cases `done`).

#### Scenario: coded change with no review role falls through to done
- **GIVEN** `agents.yaml` has roles `[code]` only AND a change has `phase === "coded"`
- **WHEN** the Phase view renders
- **THEN** the change appears in the `DONE` lane (no `REVIEWING` lane exists to receive it)

#### Scenario: reviewed change with verify role appears in verifying
- **GIVEN** `agents.yaml` has roles `[code, review, verify]` AND a change has `phase === "reviewed"`
- **WHEN** the Phase view renders
- **THEN** the change appears in the `VERIFYING` lane

#### Scenario: needs-human resolves via priorPhase
- **GIVEN** a change has `phase === "needs-human"` and `priorPhase === "coded"` AND `review` role is declared
- **WHEN** the Phase view renders
- **THEN** the change appears in the `REVIEWING` lane (next-stage of `coded`)

#### Scenario: no change dropped when its target lane is absent
- **GIVEN** `agents.yaml` has roles `[code]` only AND a change has `phase === "reviewed"`
- **WHEN** the Phase view renders
- **THEN** the change appears in the `DONE` lane
- **AND** no change from the input list is missing from the rendered output

### Requirement: Manager activity is tracked per change

The ithyno server SHALL maintain an in-memory per-change record of Manager's current orchestration activity, of shape:

```
{
  changeId: string,
  stage: "code" | "review" | "verify",
  activity: "dispatching" | "waiting" | "judging" | "cleanup" | "transitioning" | "idle",
  startedAt: number,          // epoch ms
  detail?: string             // short human-readable hint
}
```

The record SHALL be:
- **In-memory only** (no sidecar persistence, no restart survival).
- **Set / cleared** via `POST /api/manager/activity` (session-token gated). Setting `activity: "idle"` SHALL clear the entry.
- **Retrievable in bulk** via `GET /api/manager/activity` (returns `Record<changeId, ManagerActivity>`).
- **Broadcast** on every set/clear via WS event `manager-activity-updated` with payload `{ changeId, activity: ManagerActivity | null }`.

Server restarts SHALL clear all Manager-activity state. The dispatch skill is responsible for re-posting current state as it re-enters its loop.

#### Scenario: Set activity broadcasts and persists in memory
- **GIVEN** the server is running with an empty Manager-activity map
- **WHEN** a client POSTs `{ changeId: "x", stage: "code", activity: "waiting", detail: "claude" }` with a valid session token
- **THEN** the endpoint responds 200 OK
- **AND** `GET /api/manager/activity` returns `{ x: { changeId: "x", stage: "code", activity: "waiting", detail: "claude", startedAt: <ts> } }`
- **AND** a WS `manager-activity-updated` event fires with the same payload

#### Scenario: Idle activity clears the entry
- **GIVEN** activity is set for change `x`
- **WHEN** a client POSTs `{ changeId: "x", activity: "idle" }`
- **THEN** the entry for `x` is removed from the map
- **AND** the WS broadcast payload has `activity: null`

#### Scenario: Server restart clears all activities
- **GIVEN** activities are set for multiple changes
- **WHEN** the server restarts
- **THEN** `GET /api/manager/activity` returns `{}` immediately after restart

#### Scenario: Unauthorized POST rejected
- **GIVEN** the server is running
- **WHEN** a client POSTs without a session token (or with an invalid one)
- **THEN** the endpoint responds 401
- **AND** no WS broadcast fires
- **AND** the in-memory map is unchanged

### Requirement: Dispatch skill publishes Manager activity at every phase boundary

The `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi` skills (files `.claude/commands/ithy-opsx/dispatch.md` and `.claude/commands/ithy-opsx/dispatch-multi.md`) SHALL invoke `POST /api/manager/activity` at each orchestration boundary so the dashboard has near-real-time visibility into Manager's current activity per change.

Boundaries SHALL be published in this sequence for each `(change, stage)` combination:

1. Before spawning the worker (Task tool call, agmsg spawn, or subprocess): `activity: "dispatching"`.
2. Immediately after spawn returns (worker running, poll loop starts): `activity: "waiting"`, `detail: "<worker-agent-name>"`.
3. When a worker report arrives and Manager begins inspection: `activity: "judging"`.
4. During Manager cleanup (despawn, worktree state, artifact commit): `activity: "cleanup"`, `detail: "<step>"`.
5. When Manager writes the phase-update to sidecar: `activity: "transitioning"`.
6. When dispatch returns control (success, escalation, or timeout for that change): `activity: "idle"` (clears the entry).

For `dispatch-multi`, publications SHALL carry the correct `changeId` per activity update so multiple parallel dispatches remain distinguishable.

#### Scenario: Full dispatch lifecycle publishes the expected sequence
- **GIVEN** a Manager PTY runs `/ithy-opsx:dispatch add-example` on a fresh change
- **WHEN** the dispatch proceeds through code stage
- **THEN** the following POSTs fire in order (approximately):
  1. `{ changeId: "add-example", stage: "code", activity: "dispatching" }`
  2. `{ changeId: "add-example", stage: "code", activity: "waiting", detail: "claude" }`
  3. `{ changeId: "add-example", stage: "code", activity: "judging" }`
  4. `{ changeId: "add-example", stage: "code", activity: "cleanup", detail: "despawn" }`
  5. `{ changeId: "add-example", stage: "code", activity: "transitioning" }`
- **AND** the same sequence repeats for `stage: "review"` and `stage: "verify"` as those stages run.
- **AND** at end of dispatch, a final `{ changeId: "add-example", activity: "idle" }` fires.

#### Scenario: Parallel dispatch keeps per-change activity separate
- **GIVEN** Manager runs `/ithy-opsx:dispatch-multi X Y`
- **WHEN** both dispatches are mid-flight (X in `waiting` for code, Y in `judging` for review)
- **THEN** `GET /api/manager/activity` returns entries for both `X` and `Y` with their respective distinct states
- **AND** each subsequent WS broadcast is scoped to a single `changeId`

### Requirement: Dashboard displays Manager activity on Kanban cards

The dashboard SHALL render a per-card Manager-activity badge when `managerActivity[changeId]` is defined. The badge SHALL be secondary to (and coexist with) the Job worker-state indicator introduced by `annotate-cards-with-worker-job-state`.

Rendering rules per activity value:

- `dispatching` — spinner (animated) + "dispatching" label.
- `waiting` — hourglass icon + "waiting" + `detail` when present.
- `judging` — brain / thinking icon + "judging".
- `cleanup` — broom / trash icon + `"cleanup: ${detail ?? ''}"`.
- `transitioning` — arrow icon + "transitioning".
- `idle` — badge SHALL NOT render (state is equivalent to absent).

The badge SHALL also render elapsed time since `startedAt` in a small muted suffix.

#### Scenario: Waiting badge renders with agent detail and elapsed
- **GIVEN** `managerActivity["x"] = { activity: "waiting", detail: "claude", startedAt: <2 minutes ago> }`
- **WHEN** card `x` renders
- **THEN** the Manager badge shows an hourglass icon + "waiting: claude" + "2m" elapsed suffix

#### Scenario: Cleanup badge shows step detail
- **GIVEN** `managerActivity["y"] = { activity: "cleanup", detail: "worktree-remove", startedAt: <15s ago> }`
- **WHEN** card `y` renders
- **THEN** the badge shows a cleanup icon + "cleanup: worktree-remove" + "15s"

#### Scenario: Both worker-state and Manager badges coexist
- **GIVEN** change `z` has `job.status = "running"` AND `managerActivity["z"] = { activity: "waiting" }`
- **WHEN** card `z` renders
- **THEN** both the worker-state indicator (pulse dot + agent name) AND the Manager activity badge (hourglass + waiting) are visible on the card
- **AND** the two indicators are visually distinguishable

#### Scenario: Idle change shows no Manager badge
- **GIVEN** a change with no `managerActivity` entry
- **WHEN** the card renders
- **THEN** no Manager activity badge appears on the card

### Requirement: Kanban card annotates worker job state

Every Kanban card (rendered by the shared `<KanbanCard>` component in both Board and Phase views) SHALL display a per-change worker-state indicator derived from the Job registry. The indicator SHALL reflect the current or most-recently-completed Job's status for that change:

- `running` — animated pulse dot (accent color) + agent name + elapsed time (`formatElapsed(now - job.startedAt)`), refreshed every 30 seconds.
- `completed` — static gray checkmark + "done" label, shown only while BOTH conditions hold: (a) the card renders within 30 seconds of `finishedAt`, AND (b) the change still sits in the pipeline stage its worker finished in. When either fails the indicator SHALL fall back to its idle branch.
- `cancelled` — muted gray dot + "cancelled" label.
- `crashed` — red dot + "crashed" label; hover tooltip shows the exit code.
- `orphaned` — red dot + "orphaned" label; hover tooltip shows the worktree path.
- No job (idle) — behavior depends on `laneContext`:
  - `laneContext === "phase"` → muted queued dot + "queued" label
  - `laneContext === "board"` → indicator SHALL render nothing (no annotation)

The indicator SHALL be visible in both view modes without duplicating logic — it lives inside the shared `<KanbanCard>` and receives `laneContext` as a prop from its parent.

The `completed` state is transient in the workflow sense, not only the clock sense: the "done ✓" reports "a worker finished and the Manager has not yet acted". The Manager's act is the phase advance, so the indicator SHALL receive a stage signal — the change's current pipeline stage plus the stage it occupied when that job finished — and SHALL suppress `completed` as soon as the two differ, regardless of remaining grace time. A card that has already moved to its next lane SHALL NOT keep reporting `done`. This rule applies in both view modes (it is derived from `change.phase`, not from the board slot). When the at-finish stage is unknown (the job was already `completed` when the client loaded, so no transition was observed), the 30-second window alone governs.

Finished-job data (status `completed`/`cancelled`/`crashed`/`orphaned` with a `finishedAt` timestamp) SHALL be retained in the client's `jobByChange` map for at least the 30-second grace window post-finish so the indicator can render the just-finished state. The transience of the `completed` annotation SHALL be enforced at render time (grace window + stage signal) rather than by evicting the map entry — the same entry drives the Merge / View diff / Discard affordances, which must outlive the annotation.

No new server endpoints or WS events are introduced; the indicator derives entirely from the existing `JobSummary` data flow.

#### Scenario: Running worker shows pulse + elapsed
- **GIVEN** a `code`-role worker is running on change `X` with `job.startedAt` 45 seconds ago
- **WHEN** the Kanban view renders
- **THEN** card `X` shows an animated pulse dot (accent color) + agent name + `"45s"` elapsed
- **AND** the elapsed value updates roughly every 30 seconds

#### Scenario: Successful completion shows transient checkmark
- **GIVEN** a worker on change `Y` has just transitioned from `running` to `completed`
- **AND** change `Y` is still in the pipeline stage its worker finished in (the Manager has not advanced `phase` yet)
- **WHEN** the card renders within 30 seconds of `finishedAt`
- **THEN** card `Y` shows a gray checkmark + "done" label
- **AND** after 30 seconds the indicator reverts to base (no annotation in Board view, "queued" in Phase view)

#### Scenario: Phase advance retires the checkmark early
- **GIVEN** a worker on change `Y` completed 5 seconds ago and its card shows the "done" checkmark
- **WHEN** the Manager advances change `Y`'s phase (e.g. `proposed` → `coded`) and the card re-renders
- **THEN** card `Y` SHALL no longer show the checkmark, even though the 30-second window has not lapsed
- **AND** the card reverts to base (no annotation in Board view, "queued" in Phase view) in its new lane
- **AND** the Merge / View diff / Discard affordances, which are driven by the job rather than by this indicator, remain available

#### Scenario: Crash renders red badge with tooltip
- **GIVEN** a worker on change `Z` has status `crashed` with `exitCode: 137`
- **WHEN** the card renders
- **THEN** card `Z` shows a red dot + "crashed" label
- **AND** the hover tooltip shows `"exit code: 137"`

#### Scenario: Idle change in Phase view shows queued
- **GIVEN** a change has no annotatable Job state (never dispatched, finished > 30 s ago, or finished in a stage the change has since left) AND the Phase view is active
- **WHEN** the card renders
- **THEN** the card shows a muted queued dot + "queued" label

#### Scenario: Idle change in Board view shows nothing
- **GIVEN** a change has no Job entry AND the Board view is active
- **WHEN** the card renders
- **THEN** the card renders no worker-state indicator (empty slot)

#### Scenario: Card render identity between views
- **GIVEN** the same change `W` appears in both the Board view and the Phase view (via toggle switching)
- **WHEN** each view renders `W`
- **THEN** the same `<KanbanCard>` component instance renders in both contexts
- **AND** the only difference in output is the `laneContext`-driven idle branch

### Requirement: Phase view displays only active-role work, bucketed by role

The Phase view SHALL display **only** changes with an active role in
play — a change with no active worker Job and no active Manager
activity SHALL NOT appear, EXCEPT for `phase === "done"` changes which
appear in the DONE lane as historical record.

Bucketization key SHALL be the role currently in play:

- Worker Job (status: "running") → `Job.role` (must be one of the 4
  standard values: `"propose" | "code" | "review" | "verify"`; other
  values → change filtered out of Phase view).
- Manager activity (activity ≠ "idle") → `ManagerActivity.role`
  (same 4-standard-value enum).
- `phase === "done"` → DONE lane, regardless of activity.

Manager between-role activity (`dispatching / cleanup /
transitioning`) SHALL keep the change in the role lane matching the
most recent role the Manager was executing (B2 policy: `role` on
`ManagerActivity` is never cleared once set within a dispatch
session, only overwritten by the next role).

This supersedes the "Phase-lane bucketization routes changes to
next-stage lane" requirement proposed by
`dynamic-phase-lanes-from-agents-roles` on the same feature branch.

**Empty lane placeholder**: `"No agent is currently on this role."`

**Rationale**: user's intent is "Kanban does not display everything;
it displays agent state" (verbatim). The Board view remains the
place to see all changes bucketed by phase state.

#### Scenario: change with running code worker appears in CODING lane
- **GIVEN** change `X` has `Job { role: "code", status: "running" }`
- **AND** `agents.yaml` declares `code` role (CODING lane exists)
- **WHEN** Phase view renders
- **THEN** `X` appears in CODING lane
- **AND** the card's `WorkerStateIndicator` shows a `running` dot

#### Scenario: change with running review worker appears in REVIEWING lane
- **GIVEN** change `Y` has `Job { role: "review", status: "running" }`
- **AND** REVIEWING lane exists in the derived lane list
- **WHEN** Phase view renders
- **THEN** `Y` appears in REVIEWING lane regardless of `Y.phase` (the change's persisted phase does NOT influence bucketing)

#### Scenario: Manager fallback verify surfaces in VERIFYING lane
- **GIVEN** `agents.yaml` declares no `verify` role
- **AND** Manager is actively judging verify for change `Z`: `ManagerActivity { changeId: Z, role: "verify", activity: "judging" }`
- **AND** VERIFYING lane exists (Manager-fallback reserves it)
- **WHEN** Phase view renders
- **THEN** `Z` appears in VERIFYING lane
- **AND** the card does NOT render a Manager badge (deprecated per this change)

#### Scenario: Manager cleanup after code keeps change in CODING lane (B2)
- **GIVEN** Manager was dispatching code for change `W`; the code worker just finished
- **AND** Manager is now in `activity: "cleanup"` state; `role` is still `"code"` (not cleared)
- **WHEN** Phase view renders during that cleanup window
- **THEN** `W` remains in CODING lane
- **AND** transitions to REVIEWING lane only when Manager updates `role` to `"review"` in a subsequent activity

#### Scenario: idle change at coded phase does NOT appear in Phase view
- **GIVEN** change `V` at `phase === "coded"`, no active `Job`, no active `ManagerActivity`
- **WHEN** Phase view renders
- **THEN** `V` does NOT appear in any lane
- **AND** `V` DOES appear in Board view (unchanged)

#### Scenario: proposed change with no active worker does NOT appear in Phase view
- **GIVEN** change `U` at `phase === "proposed"`, no worker, no Manager activity
- **WHEN** Phase view renders
- **THEN** `U` does NOT appear (was: appeared in CODING under P1's shift-by-one)

#### Scenario: done change appears in DONE lane regardless of activity
- **GIVEN** change `T` at `phase === "done"`
- **WHEN** Phase view renders
- **THEN** `T` appears in DONE lane (terminal history)

#### Scenario: worker Job with non-standard role is filtered out
- **GIVEN** change `S` has `Job { role: "other", status: "running" }` (custom role, A1 policy)
- **WHEN** Phase view renders
- **THEN** `S` does NOT appear in any lane
- **AND** `S` DOES appear in Board view

#### Scenario: multi-role agent — Job.role is authoritative
- **GIVEN** an agent with `roles: [code, review]` currently running a Job dispatched as `review`
- **AND** `Job.role === "review"` (set by Manager at dispatch time)
- **WHEN** Phase view renders
- **THEN** the change is bucketed into REVIEWING (Job.role wins over agent's roles[] array)

#### Scenario: empty lane placeholder reflects role focus
- **GIVEN** CODING lane has zero changes with active code-role work
- **WHEN** Phase view renders the CODING lane
- **THEN** the lane body shows `"No agent is currently on this role."`

### Requirement: JobSummary carries the dispatch role

`JobSummary` (server + web/src/types.ts mirror) SHALL include a `role: string` field, populated at dispatch time. The Manager (or the code path that spawned the Job) knows the role and MUST write it.

Standard values consumed by Phase view: `"propose" | "code" | "review" | "verify"`. Any other value is accepted at the type level (`string`) but filtered out by Phase view rendering (A1 policy). Board view and other consumers may use the raw value as-is.

#### Scenario: dispatch sets JobSummary.role
- **GIVEN** dispatch spawns a code worker for change `X`
- **WHEN** the JobSummary is written to the registry
- **THEN** `JobSummary.role === "code"`

#### Scenario: legacy JobSummary without role degrades to DONE lane
- **GIVEN** a JobSummary from before this change was applied (no `role` field)
- **WHEN** Phase view renders that Job's change
- **THEN** the change is bucketed into DONE lane as fallback (not silently dropped)
- **AND** a one-time console warning names the Job id

### Requirement: Manager activity uses `role` (renamed from `stage`)

`ManagerActivity` (server-side + web/src/types.ts mirror) SHALL use a `role: "propose" | "code" | "review" | "verify"` field instead of `stage`. The rename unifies the vocabulary with `JobSummary.role` — Manager IS always executing one of the 4 roles at any active moment (even fallback verify = Manager playing verify role).

`POST /api/manager/activity` SHALL accept either `role` (new, preferred) or `stage` (deprecated alias, one release cycle) in the request body. When both are present, `role` wins. When only `stage` is present, log a one-line deprecation warning naming the request path and continue.

`role` SHALL be persistent across between-role Manager activities within a dispatch session: once set to (e.g.) `"code"`, it stays `"code"` through `dispatching / waiting / judging / cleanup / transitioning` states, and is overwritten only when Manager moves to a new role (B2 policy). This is what lets the Phase view keep the change in the last-role lane during Manager between-role work.

#### Scenario: POST /api/manager/activity accepts role
- **GIVEN** a POST body `{ changeId, role: "code", activity: "dispatching" }`
- **WHEN** the server processes it
- **THEN** the resulting `ManagerActivity.role === "code"`

#### Scenario: POST /api/manager/activity accepts stage as deprecated alias
- **GIVEN** a POST body `{ changeId, stage: "verify", activity: "judging" }`
- **WHEN** the server processes it
- **THEN** the resulting `ManagerActivity.role === "verify"`
- **AND** the server logs a deprecation warning

#### Scenario: role persists across cleanup transition
- **GIVEN** Manager was on `role: "code", activity: "dispatching"` for change `Q`
- **WHEN** the code worker finishes and Manager updates to `activity: "cleanup"` without changing `role`
- **THEN** the stored `ManagerActivity.role` remains `"code"`
- **AND** Phase view keeps `Q` in CODING lane during the cleanup window

### Requirement: Manager activity badge on card is removed

The dashboard SHALL NOT render a Manager activity badge on any Kanban card. Manager orchestration state is observable via the Terminal (embedded PTY) — a card-level badge is redundant.

`web/src/components/ManagerActivityBadge.tsx` SHALL be removed. `KanbanCard.tsx` SHALL not import or render it. Server-side `ManagerActivity` tracking + WebSocket broadcast SHALL remain (needed for the Phase view bucketize logic).

#### Scenario: KanbanCard has no Manager badge
- **GIVEN** a change with active `ManagerActivity`
- **WHEN** the Kanban card renders (in any view)
- **THEN** no Manager activity badge appears on the card
- **AND** the WorkerStateIndicator (P2) may still appear if the change has an active Job

#### Scenario: Server-side ManagerActivity API is unchanged
- **GIVEN** a client POSTs to `/api/manager/activity`
- **WHEN** the server processes the request
- **THEN** the endpoint accepts, stores, and broadcasts the activity as before
- **AND** the Phase view reads `managerActivity` state slice from the store to drive bucketization

### Requirement: PENDING annotation position for parser compatibility

Every `> ⚠️ **PENDING` annotation blockquote inserted into an existing requirement in `openspec/specs/<capability>/spec.md` SHALL appear **after** the requirement's SHALL/MUST body paragraph, not before it. The annotation SHALL still sit inside the requirement block (before any `#### Scenario:` header), so it remains visually attached to the requirement it annotates.

**Rationale**: openspec CLI (`parseRequirements` in `@fission-ai/openspec/dist/core/parsers/markdown-parser.js`) captures each requirement's `text` field as the FIRST non-empty line after the `### Requirement:` header. `RequirementSchema` then refuses `text` that lacks `SHALL` or `MUST`. If the annotation blockquote lands on that first line, the check rejects every requirement carrying an in-flight annotation — which cascades into unrelated `openspec archive <id>` calls, since the rebuild re-parses the whole capability spec after applying the delta.

CI SHALL enforce this position via a spec-lint test that walks `openspec/specs/**/spec.md`, extracts each requirement's first non-empty content line, and asserts the line contains `SHALL` or `MUST`. The test SHALL name the offending file, line, and requirement title when it fails.

#### Scenario: annotation after SHALL/MUST line passes rebuild validation
- **GIVEN** a requirement in `openspec/specs/dashboard/spec.md` whose body is `"The system SHALL do X."` followed by a `> ⚠️ **PENDING MODIFIED** by [change-id](path/): reason.` blockquote
- **WHEN** any unrelated change is archived via `openspec archive <id>`
- **THEN** the rebuild-validation step accepts the requirement
- **AND** `--no-validate` is NOT required

#### Scenario: annotation before SHALL/MUST line fails CI lint
- **GIVEN** a requirement whose first non-empty line is a `> ⚠️ **PENDING` blockquote (i.e., annotation precedes the SHALL/MUST body)
- **WHEN** the spec-lint test suite runs
- **THEN** the test fails with a message naming the offending file and requirement title
- **AND** the failure message includes the corrective action ("move the annotation to sit after the SHALL/MUST body paragraph")

#### Scenario: skill that inserts annotations uses the correct position
- **GIVEN** `/opsx:revert` (or any skill that inserts a PENDING annotation) generates a spec.md edit
- **WHEN** the annotation is inserted into an existing requirement
- **THEN** the annotation is placed after the last SHALL/MUST-containing paragraph, before any `#### Scenario:` header
- **AND** the CLAUDE.md hard-rule section references this position rather than the pre-body position

#### Scenario: no annotation at all — no-op
- **GIVEN** a requirement with no PENDING annotation
- **WHEN** the spec-lint test runs
- **THEN** the requirement passes trivially (first non-empty line IS the SHALL/MUST body)

### Requirement: Ithyno Init scaffolds `/ithy-opsx:*` into the target project

Ithyno's Init flow SHALL scaffold every ithyno-authored `/ithy-opsx:*` command file and every backing `ithy-opsx-*` skill directory into the target project's `.claude/` tree, alongside the upstream `/opsx:*` output that `openspec init` produces.

The scaffold SHALL be delivered via the existing `templates/` mechanism used for `agents.yaml.tmpl`, `CLAUDE.md`, and `templates/.claude/skills/openspec-flow/` — that is, files placed under `templates/.claude/commands/ithy-opsx/` and `templates/.claude/skills/ithy-opsx-*/` in the ithyno distribution. `bin/init.js`'s existing `walkTemplates` picks them up without dedicated copy logic.

Distribution SHALL NOT include any user-global install step. The ithyno server SHALL NOT write into `~/.claude/` on startup, and no `/api/doctor/install/ithy-opsx` / `/api/doctor/uninstall/ithy-opsx` endpoints SHALL exist. The ithyno CLI SHALL NOT expose `install-skills` / `uninstall-skills` subcommands. The Doctor report SHALL NOT include an `ithyOpsx` field. Settings › Prerequisites SHALL NOT render an ithy-opsx install row.

The ithyno-ui repo itself is the development environment and does NOT run Init on itself; its `.claude/commands/ithy-opsx/` and `.claude/skills/ithy-opsx-*/` are the dev-copy that the templates mirror. A drift-guard test enforces byte-identity between the dev-copy and the template so an edit to one that misses the other fails CI, not review.

The Vitest suite SHALL additionally include two smoke assertions guarding the invariants above end-to-end (added by `add-init-scaffold-smoke-test`):

- **Scaffold reachability**: `runInit()` invoked against a `mkdtemp()` target with `autoGitInit: true` SHALL leave every file present under the repo's `.claude/commands/ithy-opsx/` and every file under each `.claude/skills/ithy-opsx-*/` present at the matching `<target>/.claude/…` path, byte-identical. This is orthogonal to the drift guard: drift compares dev-copy to `templates/`; scaffold reachability compares dev-copy to what actually lands post-Init in a target. An edit to `bin/init.js` or `walkTemplates` that stops copying the ithy-opsx trees fails this test even if the drift guard still passes.
- **Package shape**: `npm pack --dry-run --json` SHALL be parsed and every ithy-opsx entry in the tarball's file list SHALL live under `templates/.claude/…`. No entry SHALL match `^\.claude/commands/ithy-opsx` or `^\.claude/skills/ithy-opsx-`. A future edit that re-adds bare `.claude/…` entries to `package.json` `files` fails this test.

The project SHALL additionally ship a scaffolded-target skill-e2e harness (added by `add-skill-e2e-harness`, reshaped by `revert-skill-e2e-live-mode`) that provides **structural coverage** of every `/ithy-opsx:*` skill in a `mkdtemp()` scaffolded target. The harness SHALL be invoked via `npm run e2e:skills`, SHALL be gated behind `E2E=1` (not part of `npm test`), and SHALL exit non-zero if any covered skill's command file fails to resolve, if fixture setup fails, or if the harness's ithyno server fails to boot against the scaffolded target on port 4321. The harness SHALL cover — at minimum — every skill named in Phase D of `docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`: `apply`, `review`, `verify`, `merge`, `archive`, `revert`, `import`, `escalate`, `answer`, `dispatch`, `dispatch-multi`. Coverage SHALL be structural (does the surface scaffold and resolve?) — semantic verification (does each skill actually apply / review / commit / etc?) is manual, per `docs/skill-e2e-manual-verification.md`. Rationale: `claude -p` mode interacts non-deterministically with slash commands that have interactive commit-approval steps (`/ithy-opsx:apply` and `:archive` both hang waiting for user input), producing false positives / negatives that make live-mode automation unreliable; manual verification via the Electron .app or VSCode extension surface is the load-bearing coverage for semantics.

#### Scenario: Fresh target through Init has ithy-opsx alongside opsx
- **GIVEN** a project directory with no `openspec/`, no `.claude/`, no `agents.yaml`
- **WHEN** `POST /api/init` runs on it (with a valid manager choice)
- **THEN** the target ends up with `.claude/commands/opsx/*.md` (from `openspec init`) AND `.claude/commands/ithy-opsx/*.md` (from ithyno template scaffold)
- **AND** the target ends up with `.claude/skills/openspec-flow/`, `.claude/skills/openspec-*/`, AND every `.claude/skills/ithy-opsx-*/` present under `templates/`
- **AND** every scaffolded file appears in the target's `git status` output as untracked (visible, editable, git-tracked once committed)

#### Scenario: A Manager PTY started in a scaffolded target resolves `/ithy-opsx:*`
- **GIVEN** a target project that ran ithyno Init, so its `.claude/commands/ithy-opsx/` exists
- **WHEN** a Claude Code Manager PTY starts with that target as its cwd, and the user types `/ithy-opsx:import` (or any other command in the family)
- **THEN** the command resolves from the target's own `.claude/`, with no dependency on `~/.claude/`
- **AND** the same resolution path serves `/opsx:apply` — the `code` role's prompt — from the target's `.claude/commands/opsx/`

#### Scenario: A non-Init'd project has no `/ithy-opsx:*`
- **GIVEN** a project with `openspec init` output but no ithyno Init
- **WHEN** a Claude Code session opens that project's cwd and the user types `/ithy-opsx:dispatch <id>`
- **THEN** the command does not resolve (Claude Code reports "Unknown command")
- **AND** `/opsx:*` commands still resolve normally, because those came from `openspec init` and are independent of ithyno

#### Scenario: Server startup does not touch `~/.claude/`
- **GIVEN** the ithyno server about to start
- **WHEN** it completes startup and begins accepting HTTP requests
- **THEN** no read or write occurred against `~/.claude/`
- **AND** the server logs contain no `[install-skills]` line

#### Scenario: `GET /api/doctor` has no ithy-opsx field
- **GIVEN** the ithyno server is running
- **WHEN** an authorized client requests `GET /api/doctor`
- **THEN** the response body has no `ithyOpsx` field
- **AND** neither `agents`, `tmux`, `agmsg`, `readyForManager`, nor `checkedAt` are affected

#### Scenario: Scaffold reachability smoke — every ithy-opsx surface file lands in the target
- **GIVEN** a fresh `mkdtemp()` target directory
- **WHEN** `runInit({ targetDir, autoGitInit: true, quiet: true })` completes with `ok: true`
- **THEN** for every file `f` under the repo's `.claude/commands/ithy-opsx/`, `<target>/.claude/commands/ithy-opsx/<f>` exists and is byte-identical to `f`
- **AND** for every skill `s` under the repo's `.claude/skills/ithy-opsx-*/`, `<target>/.claude/skills/<s>/` contains every file from the source skill, byte-identical
- **AND** the test iterates the dev-copy tree rather than hard-coding counts, so adding a new command or skill file in a future change does not require test updates

#### Scenario: Scaffold reachability smoke fails when Init copy path stops picking up ithy-opsx
- **GIVEN** a hypothetical edit to `bin/init.js` that filters `walkTemplates` output to exclude `.claude/skills/ithy-opsx-*` (regression)
- **WHEN** `npm test` runs
- **THEN** the scaffold-reachability test fails and names at least one specific `<target>/.claude/skills/ithy-opsx-*/SKILL.md` path that failed to land
- **AND** the drift-guard test still passes (dev-copy ≡ templates is unchanged), demonstrating the two tests catch distinct regressions

#### Scenario: Package shape smoke — npm pack ships ithy-opsx only via templates
- **GIVEN** the repo at a clean HEAD
- **WHEN** `npm pack --dry-run --json` is run and its `files` array is parsed
- **THEN** every entry whose path contains `ithy-opsx` sits under `templates/.claude/…`
- **AND** no entry matches the pattern `^\.claude/commands/ithy-opsx` or `^\.claude/skills/ithy-opsx-`
- **AND** the test fails loudly if either invariant is violated

#### Scenario: Package shape smoke fails when files re-add bare `.claude/` entry
- **GIVEN** a hypothetical edit to root `package.json` that re-adds `.claude/commands/ithy-opsx` to the `files` array (regression, matching what `distribute-ithy-opsx-via-init-templates` removed)
- **WHEN** `npm test` runs
- **THEN** the package-shape test fails and names the offending tarball entry path
- **AND** the message points the reader at both this scenario and the distribute-ithy-opsx contract so the fix is obvious

#### Scenario: Skill-e2e harness verifies structural resolution of every `/ithy-opsx:*` skill in a scaffolded target
- **GIVEN** the developer invokes `E2E=1 npm run e2e:skills` on a clean HEAD
- **WHEN** the harness creates a `mkdtemp()` scaffolded target via `runInit()` + `openspec init`, seeds each flow's fixture, and boots an ithyno server against it on port 4321
- **THEN** the harness asserts that every skill named in Phase D of the idea-doc (`apply`, `review`, `verify`, `merge`, `archive`, `revert`, `import`, `escalate`, `answer`, `dispatch`, `dispatch-multi`) has its command file resolvable at `.claude/commands/ithy-opsx/<skill>.md` in the scaffolded target
- **AND** the harness exits 0 on all-structural-pass, non-zero with a per-skill pass / fail summary otherwise
- **AND** the harness completes in under 30 seconds wall-clock on a reasonable developer machine

#### Scenario: Skill-e2e harness fails when a scaffolded skill file is missing
- **GIVEN** a hypothetical regression that removes `templates/.claude/commands/ithy-opsx/apply.md` (or breaks `runInit`'s walk of it)
- **WHEN** `E2E=1 npm run e2e:skills` runs
- **THEN** Flow A fails at the `assertIthyOpsxCommandResolves("apply")` step with an error naming the specific missing surface
- **AND** the harness's exit code is non-zero and the per-skill summary shows `apply FAIL` with the reason

#### Scenario: Live semantic verification of `/ithy-opsx:*` skills is documented as a manual procedure
- **GIVEN** a maintainer preparing a release cut
- **WHEN** they consult `docs/skill-e2e-manual-verification.md`
- **THEN** the doc names both an Electron .app path (A) and a VSCode extension path (B) as the two supported test surfaces
- **AND** the doc provides a per-skill checklist (11 skills × prep + type + expect + fail-mode) with a shared reporting template
- **AND** the doc explains why live automation is not attempted: `claude -p` non-determinism + interactive commit-approval traps in `/ithy-opsx:apply` and `:archive`

#### Scenario: Skill-e2e harness is not part of `npm test`
- **GIVEN** a developer runs `npm test` without setting `E2E=1`
- **WHEN** the test suite completes
- **THEN** the skill-e2e harness did NOT run (no server was booted, no `mkdtemp()` target was created)
- **AND** the harness is invoked only when `E2E=1 node scripts/skill-e2e.mjs` (or the equivalent `npm run e2e:skills`) is called explicitly
- **AND** the harness's runtime cost does not creep into the standard PR / CI test budget

#### Scenario: Skill-e2e harness cleans up on success and on failure
- **GIVEN** the harness has created scaffolded targets and spawned an ithyno server
- **WHEN** the harness completes (whether all flows pass, some fail, or the harness itself crashes)
- **THEN** every scaffolded `mkdtemp()` target directory is removed (unless `--keep-tmp` was passed for diagnosis)
- **AND** every spawned ithyno server subprocess is killed
- **AND** no port allocated by the harness remains bound after exit

### Requirement: Drift-guard test keeps the dev copy and the template in sync

The Vitest suite SHALL include a drift guard that iterates every file under `.claude/commands/ithy-opsx/` and every file under each `.claude/skills/ithy-opsx-*/` in the dev repo, and asserts a byte-identical file exists at the matching `templates/.claude/…` path. The guard SHALL name the specific pair that diverged in its failure message so a reader can fix it in one grep. This mirrors the existing `templates/.claude/skills/openspec-flow/` drift guard in `server/init.test.ts`.

The guard SHALL run as part of `npm test`, so a PR that edits the dev copy without updating the template (or vice versa) fails before review, not after.

#### Scenario: Dev-copy edit without template update fails the guard
- **GIVEN** a developer edits `.claude/commands/ithy-opsx/dispatch.md` in the dev repo
- **AND** does NOT make the same edit to `templates/.claude/commands/ithy-opsx/dispatch.md`
- **WHEN** `npm test` runs
- **THEN** the drift guard fails with a message naming `dispatch.md` as the diverged pair

#### Scenario: Template edit without dev-copy update fails the guard
- **GIVEN** a developer edits `templates/.claude/skills/ithy-opsx-import/SKILL.md`
- **AND** does NOT make the same edit to `.claude/skills/ithy-opsx-import/SKILL.md`
- **WHEN** `npm test` runs
- **THEN** the drift guard fails with a message naming `ithy-opsx-import/SKILL.md` as the diverged pair

#### Scenario: Byte-identical trees pass silently
- **GIVEN** every dev-copy file has a byte-identical counterpart under `templates/.claude/…`
- **WHEN** `npm test` runs
- **THEN** the drift guard passes without output beyond the standard test summary
- **AND** the working tree is unchanged (the guard is read-only)

### Requirement: Manager PTY startup dispatches per CLI when args are empty

The server SHALL expose a per-CLI Manager-startup dispatch table (`MANAGER_STARTUP_STRATEGIES` in `server/sync/pty.ts`) mapping each Manager-eligible CLI id to a strategy function `(projectRoot: string | undefined) => string`. When a Manager entry in `agents.yaml` has an empty `args` array, the server SHALL invoke the strategy registered for `manager.command`; when no strategy is registered for the command, the server SHALL emit the command as-is (plain `<cli>` — safe first-launch default).

The `claude` strategy SHALL implement the session-file mint/resume contract described in `Manager Entry Drives Fresh PTY Startup` priority 3, using `<projectRoot>/.ithyno/session-claude` as the canonical location. New CLI strategies SHALL be added to the table as their per-CLI resume semantics are researched and implemented; each addition is its own follow-up change.

The dispatch function `resolveManagerStartup(command, projectRoot)` SHALL be exported for direct testing.

#### Scenario: claude strategy mints session file on fresh project
- **GIVEN** a fresh project directory with no `.ithyno/session-claude` and no `.ithyno/session-id`
- **WHEN** `resolveManagerStartup("claude", projectRoot)` is called
- **THEN** the return value matches `claude --session-id <uuid>` where `<uuid>` is a fresh UUID
- **AND** `.ithyno/session-claude` is created containing that UUID

#### Scenario: unregistered CLI falls back to plain command
- **GIVEN** the dispatch table has no entry for `codex`
- **WHEN** `resolveManagerStartup("codex", "/any/path")` is called
- **THEN** the return value is exactly `"codex"` (no args, no `--continue`, no other flag)

#### Scenario: registered strategy without projectRoot returns plain command
- **GIVEN** the claude strategy is registered
- **WHEN** `resolveManagerStartup("claude", undefined)` is called (no projectRoot for session file lookup)
- **THEN** the return value is exactly `"claude"`

#### Scenario: template default (empty args) triggers dispatch, not `--continue`
- **GIVEN** a fresh project initialized by `openspec init` with `agents.yaml.tmpl`'s default (empty `args: []`)
- **WHEN** the first PTY session opens
- **THEN** the startup line does NOT contain `--continue`
- **AND** if the manager command is `claude`, the startup line uses the session-file mint/resume dispatch

### Requirement: Manager picker filters to Manager-eligible CLIs with unverified label

The Init flow's Manager-CLI picker (`web/src/components/InitDialog.tsx`) SHALL offer only Manager-eligible CLIs. The eligibility set is the union of two constants: `MANAGER_VERIFIED` (currently `["claude", "agy"]`) and `MANAGER_UNVERIFIED` (currently `["codex", "opencode"]`).

Non-eligible CLIs (`copilot`, `gemini`, `cursor`, `antigravity`) SHALL be hidden from the Manager picker. They MAY still appear in the Prerequisites list and MAY still be spawned as agmsg workers — the filter applies only to the Manager role.

Entries in `MANAGER_UNVERIFIED` SHALL render with a trailing `(unverified)` label. A CLI SHALL be moved from `MANAGER_UNVERIFIED` to `MANAGER_VERIFIED` (removing the label) once both: (a) it has a startup strategy registered in `MANAGER_STARTUP_STRATEGIES`, AND (b) its dispatch skill resolves in that CLI's command surface.

`readyForManager` SHALL be derived from `managerChoices.length > 0` (installed ∩ candidates), not from the raw doctor report's field — a project with only non-eligible CLIs installed correctly reports "no Manager-eligible CLI" and blocks Init.

The preselect logic SHALL respect the candidate filter: the stored `defaultManager` is preselected only if it is both installed AND Manager-eligible; otherwise the picker preselects the first eligible-installed CLI by `CLI_PRIORITY`.

#### Scenario: picker shows only Manager candidates
- **GIVEN** doctor reports `claude`, `copilot`, `gemini` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker shows exactly `claude` (the only eligible CLI in the installed set)
- **AND** `copilot` and `gemini` appear in the Prerequisites list but NOT in the Manager picker

#### Scenario: unverified CLIs get the unverified label
- **GIVEN** doctor reports `claude`, `codex`, `agy` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker shows all three
- **AND** the `codex` entry renders with a `(unverified)` suffix
- **AND** the `claude` and `agy` entries render without the suffix

#### Scenario: no eligible CLI installed blocks Init
- **GIVEN** doctor reports only `copilot` and `gemini` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker section is not shown
- **AND** `readyForManager` is false
- **AND** the "No agent CLI installed" (or equivalent) blocking message appears

#### Scenario: defaultManager honored only if eligible
- **GIVEN** the store's `defaultManager` is `gemini` (which is not Manager-eligible) AND doctor reports `claude` and `gemini` installed
- **WHEN** the Init dialog renders
- **THEN** the picker preselects `claude` (first eligible-installed by priority)
- **AND** does NOT preselect `gemini`

#### Scenario: agmsg worker path unaffected
- **GIVEN** the Manager picker filter has hidden `copilot` from the Init dialog
- **WHEN** the dispatch flow spawns a Copilot worker via agmsg (an unrelated concern)
- **THEN** the worker still spawns successfully
- **AND** the picker filter has NO effect on worker CLI selection or spawn

### Requirement: Settings page does not offer a Default Manager selector

The Settings page (`web/src/pages/Settings.tsx`) SHALL NOT render a `Default Manager` section or any radio-group for selecting the cross-project default Manager CLI. The Agents tab's Manager section is the sole UI for viewing or editing the current project's Manager entry.

The `defaultManager` store slice and its `localStorage["ithyno.defaultManager"]` persistence layer SHALL remain intact. InitDialog SHALL continue to consult `defaultManager` when preselecting the Manager CLI at Init time (honored only when both installed and Manager-eligible). The `setDefaultManager` setter SHALL remain exported from the store so future implicit-set paths (e.g., auto-remember the CLI picked at the most recent Init) can wire it without a UI addition.

**Rationale**: The Settings picker duplicated the Agents tab's Manager UI with a non-obvious scope difference (cross-project preference vs current-project entry), and the two pickers filtered differently after `fix-manager-startup-per-cli-dispatch` — a user could set `gemini` as default in Settings, then discover Init did not offer it. Removing the Settings UI eliminates the contradiction while preserving preference persistence for existing users.

#### Scenario: Settings page renders without Default Manager section
- **WHEN** the user opens the Settings page
- **THEN** the page renders Prerequisites, Appearance, Execution, Agmsg, and New Project sections
- **AND** no `Default Manager` section or radio group is rendered

#### Scenario: Existing localStorage preference is honored at Init
- **GIVEN** a user has `localStorage["ithyno.defaultManager"] = "claude"` from before this change
- **WHEN** the Init dialog opens
- **THEN** the picker preselects `claude` (assuming it is installed and Manager-eligible)
- **AND** no user action in Settings is required (the section no longer exists)

#### Scenario: Fresh user with no preference gets sensible preselect
- **GIVEN** a user with no `localStorage["ithyno.defaultManager"]` value AND `claude` + `codex` installed
- **WHEN** the Init dialog opens
- **THEN** the picker preselects `claude` (first Manager-eligible installed by priority)
- **AND** the Settings page does NOT prompt the user to configure a default

#### Scenario: setDefaultManager stays available for future implicit wiring
- **GIVEN** the `setDefaultManager` action exported from the store
- **WHEN** code (this change or a future one) invokes it programmatically
- **THEN** the store slice updates and the value persists to `localStorage["ithyno.defaultManager"]`
- **AND** the next Init dialog opening honors the new preference

#### Scenario: Agents tab Manager section is unaffected
- **GIVEN** a project with a manager entry in `agents.yaml`
- **WHEN** the user opens the Agents tab
- **THEN** the Manager section renders the current entry, resolved startup line, and Edit button as before
- **AND** editing writes to `agents.yaml` (per-project) with no dependency on `defaultManager` state

### Requirement: Manager PTY exposes ithyno server contact vars

The Manager PTY (spawned by `server/sync/pty.ts:spawnLive`) SHALL export the following environment variables into the child shell, in addition to the existing shell environment inherited from `process.env`:

- `ITHYNO_SESSION_TOKEN` — the ithyno server's per-process session token. Required by every token-gated endpoint including `POST /api/manager/activity`. The PTY is local-only and already origin/token-gated at the WebSocket upgrade, so exporting the token into the shell environment adds no new exposure surface.
- `ITHYNO_PORT` — the port the ithyno server is listening on, as a bare decimal string (e.g. `"57703"`). Sourced from `process.env.PORT` (which the Electron shell and VSCode extension both set at server spawn time via `pickFreePort()`), with a fallback to `"4321"` for the CLI dev workflow where `PORT` is not set.
- `ITHYNO_BASE` — the ithyno server's base URL, as `http://localhost:<port>` (e.g. `"http://localhost:57703"`). Provided so consumers do not need to concatenate — the skill's `curl "$ITHYNO_BASE/api/..."` pattern must work verbatim.

These vars SHALL be set on every PTY spawn (`spawnLive`), NOT just at server startup — a project switch that respawns the PTY MUST re-export them with the current server's port so the fresh Manager reaches the fresh server.

Consumers (skills, tools, user commands run inside the PTY) MAY rely on `ITHYNO_BASE` being set. The `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi` skills SHALL NOT hardcode `http://localhost:4321` — hardcoded 4321 will connection-refuse under Electron and VSCode.

`TERM` SHALL be `xterm-256color` as it is today; no change to terminal capabilities.

#### Scenario: PTY spawned under Electron gets the ephemeral server port
- **GIVEN** the Electron shell spawns the ithyno server on port `57703` (chosen by `pickFreePort()`), then opens a PTY
- **WHEN** the child shell reads its environment
- **THEN** `ITHYNO_PORT == "57703"`
- **AND** `ITHYNO_BASE == "http://localhost:57703"`
- **AND** `ITHYNO_SESSION_TOKEN` matches the server's `SESSION_TOKEN`
- **AND** `curl "$ITHYNO_BASE/api/changes/<some-id>/phase"` returns 200 (not connection-refused)

#### Scenario: PTY spawned under the CLI dev workflow defaults to 4321
- **GIVEN** the server is launched by `npm run dev` with no explicit `PORT` env
- **WHEN** the PTY spawns
- **THEN** `ITHYNO_PORT == "4321"`
- **AND** `ITHYNO_BASE == "http://localhost:4321"`
- **AND** the previously-working dev workflow is unchanged

#### Scenario: Dispatch skill uses the exported base URL
- **GIVEN** the Manager PTY is running under Electron on ephemeral port `57703`
- **WHEN** `/ithy-opsx:dispatch <change-id>` invokes `curl "$ITHYNO_BASE/api/changes/<change-id>/phase"`
- **THEN** the request is routed to `http://localhost:57703/...` (the actual server)
- **AND** the response body is parsed successfully — no connection-refused, no fall-through to 4321

#### Scenario: PTY re-spawned on project switch gets the fresh port
- **GIVEN** ithyno is running at project A on port `57703`, and a `POST /api/project/switch` respawns onto project B on port `57811`
- **WHEN** the new PTY spawns
- **THEN** the fresh Manager's `ITHYNO_PORT == "57811"` (matches the new server, NOT the stale `57703`)

### Requirement: Copy Change ID from Kanban Card

Every Kanban card SHALL provide a copy control that writes the card's exact
change ID to the system clipboard. The control SHALL reuse the CLI command
copy interaction and SHALL not activate the card's Change Detail navigation.

#### Scenario: User copies a change ID
- **GIVEN** a Kanban card for change `add-search`
- **WHEN** the user activates the card's copy control
- **THEN** the clipboard receives exactly `add-search`
- **AND** the control temporarily displays the shared copied-state indicator
- **AND** the current route does not change

#### Scenario: Clipboard permission is unavailable
- **WHEN** writing the change ID to the clipboard fails
- **THEN** the dashboard displays the same clipboard-permission error toast used by the CLI command copy control

#### Scenario: Copy control is accessible
- **WHEN** assistive technology inspects the card copy control
- **THEN** the control identifies that it copies the card's change ID
- **AND** the full ID is available in its tooltip

### Requirement: Settings Agent CLI Skill Controls

The Settings Prerequisites table SHALL display project-local OpenSpec and
ithyno skill state on every supported Agent CLI row. A `Manage skills` button
SHALL be available when that Agent CLI executable is installed. When the
executable is missing, both skill components SHALL be displayed as unsupported.

These controls SHALL be attached to the existing Agent CLI rows and SHALL NOT
add separate OpenSpec or ithyno prerequisite rows.

#### Scenario: Skill state appears on every Agent CLI row
- **GIVEN** Settings has loaded doctor results and Agent skill state
- **WHEN** the Prerequisites table renders
- **THEN** every Agent CLI row displays separate OpenSpec and ithyno states
- **AND** each row whose Agent CLI executable is installed displays a `Manage skills` button
- **AND** a row whose Agent CLI executable is missing does not display the button
- **AND** tmux, agmsg, git, and node rows do not display Agent skill controls

#### Scenario: CLI and skill state remain distinct
- **GIVEN** the Codex CLI is installed but the current project lacks Codex-specific ithyno skills
- **WHEN** Settings renders
- **THEN** the CLI executable is displayed as installed
- **AND** ithyno skills are independently displayed as missing

#### Scenario: Skill inspection fails
- **GIVEN** the Agent skill inspection API fails
- **WHEN** Settings renders
- **THEN** Agent CLI doctor results remain visible
- **AND** skill state is displayed as unknown with a refresh action

### Requirement: Agent CLI Skill Install Dialog

Clicking `Manage skills` SHALL open a dialog dedicated to the selected Agent
CLI. The dialog MUST display the CLI, current project root, separate OpenSpec
and ithyno states, component selection, planned project-local output locations,
and Install and Cancel actions.

The dialog SHALL display progress and per-component results and SHALL identify
a single-component failure as a partial result.

#### Scenario: Open the dialog from an Agent row
- **GIVEN** the user is viewing the Codex row
- **WHEN** the user clicks `Manage skills`
- **THEN** a dialog opens with Codex as its target
- **AND** OpenSpec and ithyno are selected by default
- **AND** the dialog states that output remains under the current project

#### Scenario: Install only one component
- **GIVEN** the user deselects OpenSpec and leaves only ithyno selected
- **WHEN** the user clicks Install
- **THEN** the request contains the selected CLI and ithyno component only
- **AND** OpenSpec initialization does not run

#### Scenario: Skills are unavailable before the CLI executable
- **GIVEN** doctor reports that the selected Agent CLI executable is missing
- **WHEN** Settings renders the Agent CLI row
- **THEN** OpenSpec and ithyno skill state are displayed as unsupported
- **AND** the `Manage skills` button is not displayed
- **AND** project-local skill installation cannot be started for that CLI

#### Scenario: Display a per-component partial failure
- **GIVEN** OpenSpec installation succeeds and the ithyno renderer fails
- **WHEN** SSE execution completes
- **THEN** the dialog displays the aggregate result as partial
- **AND** it displays OpenSpec as successful and ithyno as failed
- **AND** it displays the failure reason and a retry action

#### Scenario: Refresh Settings state after completion
- **GIVEN** at least one selected component installs successfully
- **WHEN** dialog execution completes
- **THEN** the client refetches Agent skill state
- **AND** the selected row updates without a full-page reload
### Requirement: Init endpoint scaffolds agents.yaml with a Manager choice

`POST /api/init` SHALL, in addition to invoking `openspec init`, write `agents.yaml` at the target project root with the user-chosen Manager CLI. The endpoint SHALL consult the doctor check first and reject cleanly when the prerequisite is missing.

#### Scenario: Doctor gate — no agent CLI installed

- **GIVEN** the doctor reports `readyForManager: false` (no agent CLI installed)
- **WHEN** a client posts `POST /api/init`
- **THEN** the endpoint returns 409 with a message pointing at "ithyno doctor" and Settings > Prerequisites
- **AND** no scaffolding occurs

#### Scenario: Manager pick — invalid choice

- **GIVEN** the request body includes `{ manager: { command: "codex" } }` but doctor reports codex `installed: false`
- **WHEN** the client posts `POST /api/init`
- **THEN** the response is 400 with `{ error, installed: [...] }` listing the installed agent CLIs
- **AND** no scaffolding occurs

#### Scenario: Manager pick — default fallback

- **GIVEN** the request body omits `manager`
- **AND** the doctor reports claude and codex both installed
- **WHEN** the client posts `POST /api/init`
- **THEN** the server picks the priority-order first-installed CLI (claude before codex before agy before others) as the Manager

#### Scenario: Successful scaffolding writes agents.yaml

- **GIVEN** the doctor gate passes and Manager is picked as `claude`
- **WHEN** the client posts `POST /api/init { dir: "/path/to/fresh" }`
- **THEN** `openspec init` runs at `/path/to/fresh`
- **AND** `/path/to/fresh/agents.yaml` is created from the templated `templates/agents.yaml.tmpl` with `{{MANAGER_COMMAND}}` → `claude`
- **AND** the response is 200 with `{ managerCommand: "claude" }` alongside the existing fields

#### Scenario: agents.yaml scaffolding failure rolls back

- **GIVEN** `openspec init` succeeded but writing `agents.yaml` fails (e.g., disk full, permission denied)
- **WHEN** the Init endpoint runs
- **THEN** the server removes the openspec/ directory it just created and returns 500 with the write error
- **AND** the target directory is left in its pre-Init state

### Requirement: Init dialog shows Prerequisites and Manager picker

The dashboard's Init entry points (NoProjectDecisionPanel + OnboardingProject) SHALL render a shared `<InitDialog />` component that fetches `/api/doctor`, displays a compact Prerequisites summary, and (when ready) presents a Manager type picker limited to installed CLIs.

#### Scenario: Prerequisites block gates the Init button

- **GIVEN** the user opens the Init dialog
- **WHEN** the doctor reports `readyForManager: false`
- **THEN** the Init button is disabled
- **AND** the dialog shows a link "Settings > Prerequisites" that navigates the user to the doctor UI

#### Scenario: Manager picker defaults to the user's saved preference

- **GIVEN** the user's `defaultManager` in Settings is `codex`
- **AND** the doctor reports both claude and codex installed
- **WHEN** the Init dialog opens
- **THEN** the Manager picker is preselected on codex

#### Scenario: Manager picker only lists installed CLIs

- **GIVEN** the doctor reports claude installed and codex missing
- **WHEN** the Init dialog opens
- **THEN** the Manager picker only offers claude (not codex, not agy, etc.)

### Requirement: Default Manager preference (Settings)

The Settings page SHALL expose a "Default Manager" radio group listing installed agent CLIs. The chosen CLI SHALL be persisted (localStorage `ithyno.defaultManager`) and used as the default in the Init dialog.

#### Scenario: Default Manager persistence

- **WHEN** the user picks a Manager CLI in Settings
- **THEN** the choice is written to `localStorage["ithyno.defaultManager"]`
- **AND** the store's `defaultManager` field updates
- **AND** a subsequent Init dialog opens with this CLI preselected

#### Scenario: Default Manager falls back to priority order

- **GIVEN** localStorage has no `ithyno.defaultManager` value
- **AND** claude and codex are installed
- **WHEN** the store's `defaultManager` is read
- **THEN** it resolves to `claude` (priority: claude > codex > agy > copilot > gemini > opencode > cursor)

### Requirement: Overview layout toggle exposes phase-lane view

The Overview page's existing 2-state layout toggle (`board` / `cards`, driven by the store field `overviewLayout`) SHALL be extended to 3 states by adding a `phase` option. Selecting `phase` renders the Kanban's change list as swim lanes ordered by workflow phase (see next requirement). The `board` state (3-column progress-derived TODO / IN-PROGRESS / DONE) remains the default. Persistence across reloads uses the existing zustand-persist mechanism that already covers the toggle — no new storage decision.

Legacy persisted values (`board` / `cards`) SHALL continue to resolve unchanged. Unknown persisted values (including any future removal of a state) SHALL fall back to `board`.

The 3-state toggle SHALL render as three peer `<button role="tab">` elements inside a single `role="tablist"` container, in the tabstop order Board → Phase → Cards. Each button carries `aria-selected` matching the current store value and a `title` / `aria-label` describing its layout. The button icons SHALL be visually distinct at 16×16.

#### Scenario: Toggle exposes three options
- **GIVEN** the Overview page is rendered
- **WHEN** the user inspects the layout toggle
- **THEN** three `<button role="tab">` elements are present with `aria-label` values `"Board layout"`, `"Phase lanes layout"`, `"Cards layout"`
- **AND** exactly one has `aria-selected="true"`, matching the current `overviewLayout` store value

#### Scenario: Default is board
- **GIVEN** a fresh install with no persisted `overviewLayout` value
- **WHEN** the Overview page mounts
- **THEN** the Board button is selected and the 3-column TODO / IN-PROGRESS / DONE view renders

#### Scenario: Persist round-trips the phase value
- **GIVEN** the user has clicked the Phase toggle
- **WHEN** the page is reloaded
- **THEN** the Phase button is still selected and the phase-lane view renders

#### Scenario: Unknown persisted value falls back to board
- **GIVEN** the persisted `overviewLayout` value is a string not in `{"board", "phase", "cards"}`
- **WHEN** the Overview page mounts
- **THEN** the Board button is selected and the 3-column view renders

### Requirement: Phase-lane view renders 4 swim lanes plus Unphased fallback

When `overviewLayout === "phase"`, the Overview page SHALL render a swim-lane layout consisting of:

1. **Four lanes in pipeline order**: `proposed → coded → reviewed → done`. Each lane header displays the phase name and a card count. An empty lane SHALL display a muted placeholder ("No changes at this phase" or equivalent) instead of collapsing.

2. **An Unphased fallback section below the four lanes**, containing changes whose `phase` field is undefined or an unknown value. The fallback SHALL reuse the same 3-column TODO / IN-PROGRESS / DONE grouping as the Board view (via the same `bucketize()` helper). When the Unphased set is empty, the fallback section SHALL NOT render.

Changes whose `phase === "needs-human"` SHALL render in their `priorPhase` lane. If `priorPhase` is also undefined, they SHALL fall through to the Unphased section.

The lane layout SHALL be **display-only**. Cards SHALL NOT be draggable between lanes. The Phase view SHALL NOT show needs-human WaitBadges, phase-transition menus, or any other phase-derived affordance beyond the lane grouping itself — internal processing is unchanged, this is purely a display format.

Individual card rendering SHALL be identical to the Board view — same Start / Apply / Archive / Merge / Discard controls, same progress bar, same tag chips. No additional visual annotations tied to phase state.

#### Scenario: Four lanes render in pipeline order
- **GIVEN** the Overview page is in phase view
- **WHEN** the layout renders
- **THEN** four lane columns appear in left-to-right order: `proposed`, `coded`, `reviewed`, `done`
- **AND** each lane header shows the phase name and card count

#### Scenario: Empty lane shows placeholder
- **GIVEN** no active change has `phase === "reviewed"`
- **WHEN** the phase view renders
- **THEN** the `reviewed` lane column still appears
- **AND** its body shows a muted placeholder message instead of being empty

#### Scenario: Unphased fallback holds changes without a phase
- **GIVEN** at least one active change has `phase === undefined`
- **WHEN** the phase view renders
- **THEN** an Unphased section appears below the four lanes
- **AND** it groups those changes by the same TODO / IN-PROGRESS / DONE buckets as the Board view

#### Scenario: needs-human cards land in priorPhase lane
- **GIVEN** a change has `phase === "needs-human"` and `priorPhase === "coded"`
- **WHEN** the phase view renders
- **THEN** the change appears in the `coded` lane
- **AND** the card body renders with NO needs-human badge or annotation

#### Scenario: needs-human without priorPhase lands in Unphased
- **GIVEN** a change has `phase === "needs-human"` and `priorPhase === undefined`
- **WHEN** the phase view renders
- **THEN** the change appears in the Unphased fallback section

#### Scenario: No drag interactions in phase view
- **GIVEN** the phase view is active
- **WHEN** the user attempts to drag a card
- **THEN** no drop targets appear
- **AND** no phase-transition API call is issued

#### Scenario: Search filter narrows lanes and fallback
- **GIVEN** the phase view is active and the search filter has text
- **WHEN** the filter matches only a subset of changes
- **THEN** each lane and the Unphased section render only the matching cards
- **AND** empty lanes still show the placeholder message
