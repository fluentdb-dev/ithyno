## ADDED Requirements

### Requirement: Manager PTY cwd follows the currently-opened project

The embedded Manager PTY's working directory SHALL track the project currently opened in the dashboard. When the user switches projects at runtime, the server SHALL update its notion of the current project root, terminate any live PTYs, and let the client reconnect — with the new PTY spawned at the new project's root.

The server SHALL NOT require a process restart to switch projects at runtime.

#### Scenario: Runtime project switch respawns PTY at new cwd

- **GIVEN** ithyno is running with `PROJECT_ROOT = /path/A` and a Manager PTY is attached
- **WHEN** the dashboard invokes `POST /api/project/switch` with `{ projectRoot: "/path/B" }` and the path is valid + authorized
- **THEN** the server updates its internal project root to `/path/B`
- **AND** it terminates the live Manager PTY (cleanly closes the WS with a "project switch" reason)
- **AND** it broadcasts `state-replaced` so the dashboard refetches state
- **AND** when the client reconnects the `/pty` WebSocket, the new PTY is spawned with cwd = `/path/B`

#### Scenario: `/opsx:propose` after project switch lands in the correct project

- **GIVEN** ithyno launched with cwd = `/path/A`, then the user switched to project `/path/B`
- **WHEN** the user invokes `/opsx:propose <id>` in the Manager PTY
- **THEN** the change scaffold is created at `/path/B/openspec/changes/<id>/`, not `/path/A/`

#### Scenario: `/ithy-opsx:import <target>` after project switch uses the correct parent cwd

- **GIVEN** ithyno launched with cwd = `/path/A`, then the user switched to project `/path/B`
- **WHEN** the user invokes `/ithy-opsx:import /path/C` in the Manager PTY
- **THEN** the Task-tool sub-agent's parent Manager is at cwd = `/path/B`
- **AND** the sub-agent still targets `/path/C` per its argument

#### Scenario: Session-id continuity per project

- **GIVEN** projects `/path/A` and `/path/B` each with a pre-existing `.ithyno/session-claude` file
- **WHEN** the user switches from A to B
- **THEN** the newly-spawned PTY resolves its startup as `claude --resume <B's session-id>`, not A's
- **AND** A's session file remains untouched

#### Scenario: Concurrent project switch is guarded

- **WHEN** a `POST /api/project/switch` request is in-flight
- **AND** a second `POST /api/project/switch` request arrives before the first completes
- **THEN** the second request returns 409 with a message about a switch already in progress
- **AND** the first request completes normally

#### Scenario: Unauthorized project path is rejected

- **WHEN** a client sends `POST /api/project/switch` with `projectRoot: "/etc"` (or any path under the existing system-path blocklist)
- **THEN** the endpoint returns 403 with the reason
- **AND** the server's project root is NOT changed
- **AND** no PTYs are terminated

#### Scenario: Nonexistent or non-directory path is rejected

- **WHEN** a client sends `POST /api/project/switch` with a path that does not exist or is not a directory
- **THEN** the endpoint returns 400 with a clear reason
- **AND** the server's project root is NOT changed

### Requirement: Electron and VS Code project-switch flows delegate to the server endpoint

The Electron shell's `switchProject(picked)` and the VS Code extension's Open-Folder-driven project switch SHALL delegate the project-root update to the new `POST /api/project/switch` endpoint. Neither SHALL respawn the ithyno server process to switch projects at runtime.

The initial `--dir <path>` CLI flag (boot-time project root) is unchanged and remains supported.

#### Scenario: Electron Open Project no longer respawns the server

- **GIVEN** ithyno running under Electron with a live server process
- **WHEN** the user picks a different folder via File → Open Project
- **THEN** the existing server process stays up
- **AND** Electron invokes `POST /api/project/switch` with the picked folder
- **AND** the dashboard transitions to the new project without a window blank / port re-bind

#### Scenario: VS Code Open Folder updates the server's project root

- **GIVEN** ithyno running under the VS Code extension
- **WHEN** the user changes the VS Code workspace root
- **THEN** the extension detects the change and calls `POST /api/project/switch`
- **AND** the ithyno webview refetches state and shows the new workspace's Kanban
