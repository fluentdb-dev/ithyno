## ADDED Requirements

### Requirement: Workspace Git Status Detection
The system SHALL detect whether the project root is a git repository and
SHALL expose this via `GET /api/git/status` and via `WorkspaceState.gitStatus`
in the initial state payload, so the UI can render its git surface without
polling on load.

#### Scenario: Repository present
- **WHEN** the project root contains a valid `.git` directory
- **THEN** `/api/git/status` returns `{ isRepo: true, root, headBranch }` where `root` is the repository root path and `headBranch` is the current branch name (or `null` in a detached HEAD)

#### Scenario: No repository
- **WHEN** the project root has no `.git`
- **THEN** `/api/git/status` returns `{ isRepo: false }` and the initial `WorkspaceState.gitStatus.isRepo` is `false`

#### Scenario: Git binary missing
- **WHEN** the `git` binary is not on `PATH`
- **THEN** `/api/git/status` returns `{ isRepo: false, reason: "git-missing" }` so the UI can disable init and identity edits with a clear message

### Requirement: Local Git Identity Read
The system SHALL expose `GET /api/git/config` returning both the effective
identity (as would author a commit right now) and the identity actually
stored at `--local` scope, so the modal can differentiate "inherited" from
"set here" without extra round-trips.

#### Scenario: Local identity set
- **WHEN** the repository has `user.name` and `user.email` set at `--local` scope
- **THEN** the response is `{ effective: { userName, userEmail }, local: { userName, userEmail } }` with matching values

#### Scenario: Only global identity
- **WHEN** `user.name` / `user.email` are set only at `--global`
- **THEN** the response is `{ effective: { userName, userEmail }, local: {} }` — effective is populated, local is empty

#### Scenario: No identity anywhere
- **WHEN** neither local nor global has an identity
- **THEN** the response is `{ effective: {}, local: {} }`

### Requirement: Local Git Identity Write
The system SHALL expose `POST /api/git/config` accepting `{ userName?, userEmail? }`
and SHALL write the provided fields to `--local` scope only, so dashboard
edits never mutate global config.

#### Scenario: Set a local field
- **WHEN** the client posts `{ userName: "Ada" }`
- **THEN** the server runs `git config --local user.name Ada` and returns 200

#### Scenario: Clear a local field
- **WHEN** the client posts `{ userName: "" }`
- **THEN** the server runs `git config --local --unset user.name`, does not error if the key was already unset, and returns 200

#### Scenario: Reject without repository
- **WHEN** the project is not a git repository
- **THEN** the endpoint returns 409 with a reason indicating initialization is required, and does not touch any global config

#### Scenario: Non-local caller
- **WHEN** the request originates from a non-loopback address
- **THEN** the endpoint returns 403 (matching the existing local-only gate)

#### Scenario: Missing session token
- **WHEN** the request omits or fails the session-token check
- **THEN** the endpoint returns 401 (matching the existing CSRF gate)

### Requirement: Repository Initialization
The system SHALL expose `POST /api/git/init` that runs `git init` in the
project root when the workspace is not yet a repository, so users can
resolve the "not a git repository" state without leaving the dashboard.

#### Scenario: Initialize fresh workspace
- **WHEN** the workspace has no `.git` and the client posts to `/api/git/init`
- **THEN** the server runs `git init`, returns 200 with the new `gitStatus`, and does not create an initial commit

#### Scenario: Already a repository
- **WHEN** the workspace is already a git repository
- **THEN** the endpoint returns 200 with the current `gitStatus` and does not re-initialize (no-op)

#### Scenario: Init failure
- **WHEN** `git init` fails (permissions, git binary missing)
- **THEN** the endpoint returns 500 with the error message; the workspace state remains `isRepo: false`

### Requirement: Git Status Broadcast
The system SHALL emit a `git-status-updated` WebSocket event with the new
`gitStatus` payload after a successful `git init` or `git config` write, so
every open dashboard tab reflects the change without polling.

#### Scenario: Init emits update
- **WHEN** `POST /api/git/init` succeeds
- **THEN** all connected WebSocket clients receive `{ type: "git-status-updated", gitStatus: { isRepo: true, root, headBranch } }`

#### Scenario: Identity write emits update
- **WHEN** `POST /api/git/config` succeeds
- **THEN** all connected WebSocket clients receive `{ type: "git-status-updated", gitStatus }` (the `gitStatus` shape is stable across all emitters)

### Requirement: Dashboard Header Chip
The dashboard SHALL show a persistent header chip in the top-right that
reflects the current `gitStatus` and effective identity in the local-server
and Electron shells, so users always know which identity their commits
would use and whether the workspace supports git operations.

#### Scenario: Identity set and repo present
- **WHEN** the shell is local or Electron, `gitStatus.isRepo` is true, and `effective.userName` is set
- **THEN** the chip shows initials computed from `userName` (up to 2 chars) with the tooltip `"<userName> <userEmail>"`

#### Scenario: No identity
- **WHEN** the shell is local or Electron and the effective identity is empty
- **THEN** the chip shows a neutral icon with the label `"Configure git…"`

#### Scenario: Not a repository
- **WHEN** the shell is local or Electron and `gitStatus.isRepo` is false
- **THEN** the chip shows a warning dot on top of the initials/icon, tooltip `"Not a git repository"`

#### Scenario: VS Code shell
- **WHEN** the dashboard is rendered inside the VS Code extension webview (detected via `acquireVsCodeApi`)
- **THEN** the header chip is not mounted; VS Code's own Source Control panel is the identity surface

### Requirement: Git Identity Modal
The dashboard SHALL open a Git identity modal when the header chip is
clicked, showing the workspace state and letting the user edit local
identity or initialize the repository, so the identity surface is
self-contained and reachable from a single, always-visible affordance.

#### Scenario: Modal in "not a repository" state
- **WHEN** the modal opens and `gitStatus.isRepo` is false
- **THEN** the modal shows an `"Initialize repository"` primary button and the identity fields are disabled with a hint

#### Scenario: Modal in "repository" state
- **WHEN** the modal opens and `gitStatus.isRepo` is true
- **THEN** the modal shows the repository root, current branch, and two editable fields `user.name` / `user.email` with placeholders reflecting the effective values and a per-field source label (`local` / `global` / `system` / `unset`)

#### Scenario: Save writes local scope
- **WHEN** the user changes a field and clicks Save
- **THEN** the client calls `POST /api/git/config` with only the changed fields; on 200, the modal refreshes local config and closes

#### Scenario: Init from modal
- **WHEN** the user clicks `"Initialize repository"` and the request succeeds
- **THEN** the modal transitions to the "repository" state (identity fields become editable) without closing

### Requirement: Execution Picker Reflects Git Status
The dashboard SHALL disable the Worktree option in the Execution picker
when the workspace is not a git repository, with a reason that points at
the correct initialization affordance for the current shell.

#### Scenario: Not a repo, picker open in local or Electron shell
- **WHEN** the user opens the Execution picker, `gitStatus.isRepo` is false, and the shell is local or Electron
- **THEN** the Worktree option is disabled with the reason `"Not a git repository — open the Git panel to initialize."`

#### Scenario: Not a repo, picker open in VS Code shell
- **WHEN** the user opens the Execution picker, `gitStatus.isRepo` is false, and the shell is VS Code
- **THEN** the Worktree option is disabled with the reason `"Not a git repository — initialize via VS Code's Source Control."`

#### Scenario: Repo present
- **WHEN** `gitStatus.isRepo` is true
- **THEN** the Worktree option enable/disable state is governed only by `agents.yaml` presence (existing behavior)
