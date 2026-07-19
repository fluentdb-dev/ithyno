# vscode-extension Specification

## Purpose
TBD - created by archiving change add-vscode-extension. Update Purpose after archive.
## Requirements
### Requirement: Show Dashboard Command
The system SHALL register a VS Code command `openspecUI.show` ("OpenSpec UI:
Show Dashboard") that opens the dashboard inside the editor as a webview
panel, using the active workspace folder as the OpenSpec project root.

#### Scenario: Command opens the dashboard
- **WHEN** the user invokes `openspecUI.show` with at least one workspace folder open
- **THEN** the extension spawns the Fastify server with `OPENSPEC_PROJECT_ROOT` set to the workspace folder and opens a webview panel pointing at it

#### Scenario: No folder open
- **WHEN** the user invokes `openspecUI.show` with no workspace folder open
- **THEN** the extension shows a message asking the user to open a folder first and does not start the server

#### Scenario: Multi-root workspace
- **WHEN** the user invokes `openspecUI.show` in a multi-root workspace
- **THEN** the extension uses the first workspace folder as the project root (multi-root selection is future work)

### Requirement: Lazy Server Activation
The system SHALL NOT start the dashboard server on extension activation; the
server SHALL start only when the user first invokes `openspecUI.show`.

#### Scenario: Activation is cheap
- **WHEN** the extension activates (e.g. VS Code launches with it installed)
- **THEN** no server process is spawned and no port is bound

#### Scenario: First show triggers spawn
- **WHEN** the user invokes `openspecUI.show` for the first time in the session
- **THEN** the extension picks a free port, spawns the server, and waits for `/api/health` to succeed before opening the webview

### Requirement: Server Lifecycle Bound to Extension
The system SHALL terminate the spawned server when the extension deactivates
or the dashboard panel is disposed, so background processes do not outlive
their UI.

#### Scenario: Panel close terminates server
- **WHEN** the user closes the dashboard panel
- **THEN** the extension sends `SIGTERM` to the spawned server and the panel disposes

#### Scenario: Extension deactivate terminates server
- **WHEN** VS Code deactivates the extension (window close, extension disable)
- **THEN** any spawned server processes are terminated

### Requirement: VSIX Build Path
The system SHALL provide a documented npm script that produces a `.vsix`
package consumable via "Install from VSIX..." in VS Code.

#### Scenario: Build the VSIX
- **WHEN** the developer runs the documented packaging script in `vscode-extension/`
- **THEN** the build emits a `.vsix` file that can be installed locally

### Requirement: Injected Terminal Startup Command

The extension SHALL send an initial "startup" command via
`sendText` before forwarding user input whenever it creates the
injected terminal (a `vscode.window.createTerminal` call made in
response to a webview message that requires the terminal). The
command choice SHALL follow the two-tier logic:

1. **Explicit override** — if the user has set the
   `ithyno.terminalStartup` config value to a non-empty string, the
   extension SHALL send that string verbatim as the startup command.
   Trailing whitespace is preserved (users controlling the exact
   shell invocation).

2. **Default (config unset or empty string)** — the extension SHALL
   read (or create) the workspace-local
   `<workspaceRoot>/.ithyno/session-id` file — a plaintext UUID v4
   — and pick between two Claude Code invocations:

   - **File missing OR empty (whitespace only)**: mint a fresh UUID
     via `crypto.randomUUID()`, ensure
     `<workspaceRoot>/.ithyno/` exists (`mkdir -p`), write
     `<uuid>\n` to the file, and send
     `claude --session-id <uuid>` (Claude Code creates a fresh
     conversation with that specific id).

   - **File present, non-empty**: send
     `claude --resume <trimmed-uuid>` (Claude Code resumes the
     previously-minted session).

This mirrors the server-side embedded PTY behavior spec'd in the
`dashboard` capability's `Embedded PTY Uses tmux When Agmsg Is
Configured` requirement.

The extension SHALL NOT send `--continue`. Explicit override remains
the escape hatch for users who prefer that behavior.

On file I/O failure (write denied, filesystem read-only, etc.), the
extension SHALL fall back to sending plain `claude` (fresh session)
and log a warning to the extension host console. It SHALL NOT
surface a modal error dialog — session-id management is transparent
by design.

The extension SHALL NOT modify `.gitignore`. If the workspace's
`.gitignore` doesn't exclude `.ithyno/`, the newly-created
`.ithyno/session-id` shows up as untracked. Documented in the
README.

The config setting's `description` in `package.json` SHALL explain
the empty-string-means-session-id semantics so users understand
how to opt in or out.

#### Scenario: config empty, workspace lacks .ithyno/session-id → mint
- **GIVEN** the workspace at `<root>` has no `.ithyno/` directory
- **AND** `ithyno.terminalStartup` is unset or an empty string
- **WHEN** the extension creates the injected terminal and needs a startup command
- **THEN** the extension mints a UUID v4, creates `<root>/.ithyno/session-id` containing that UUID (with a trailing newline), and sends `claude --session-id <uuid>` via `terminal.sendText`

#### Scenario: config empty, workspace already has session-id → resume
- **GIVEN** `<root>/.ithyno/session-id` exists containing UUID `abc123...`
- **AND** `ithyno.terminalStartup` is unset or empty
- **WHEN** the terminal is (re)created
- **THEN** the extension reads the UUID, and sends `claude --resume abc123...`

#### Scenario: config empty, session-id file empty → mint fresh
- **GIVEN** `<root>/.ithyno/session-id` exists but contains only whitespace
- **WHEN** the terminal is (re)created
- **THEN** the extension mints a new UUID, overwrites the file, and sends `claude --session-id <new-uuid>` — no broken `--resume ` line is emitted

#### Scenario: config set to explicit command → uses verbatim
- **GIVEN** `ithyno.terminalStartup` is set to `"aider"`
- **WHEN** the terminal is (re)created
- **THEN** the extension sends `aider` verbatim, does NOT read `.ithyno/session-id`, and does NOT mint anything

#### Scenario: config set to `"claude --continue"` (explicit legacy) → uses verbatim
- **GIVEN** the user prefers the pre-2026-07-19 behavior and sets `ithyno.terminalStartup` to `"claude --continue"`
- **WHEN** the terminal is (re)created
- **THEN** the extension sends `claude --continue` verbatim — the explicit override wins

#### Scenario: file write fails → fresh fallback + warn
- **GIVEN** the workspace filesystem denies writes under `.ithyno/`
- **WHEN** the extension attempts to mint + persist a UUID
- **THEN** the extension logs a warning to the extension host console and sends plain `claude` (fresh session) — no modal error dialog

#### Scenario: config set to empty string explicitly → same as unset
- **GIVEN** `ithyno.terminalStartup` is set to `""` in the user's settings.json
- **WHEN** the terminal is (re)created
- **THEN** the extension treats it identically to an unset config and applies the session-id logic

### Requirement: New Project Command

The VS Code extension SHALL contribute a `ithyno.newProject` command
(title `ithyno: New Project`, category `ithyno`) that walks the
user through creating a new ithyno project without leaving VS Code.

The command SHALL prompt the user via `showOpenDialog` (folders
only, single-selection) for a parent-or-target folder, then via
`showInputBox` for an optional subdirectory name. The resolved
target path SHALL be `<picked>` when the subdir input is empty and
`<picked>/<subdir>` when it is non-empty.

On confirmed target, the extension SHALL spawn (or reuse) an
ithyno server pointing at the target's parent directory, open a
`WebviewPanel` loading `<server>/onboarding?target=<encoded-path>
&channel=vscode`, and bridge onboarding messages between the
iframed React app and the extension host.

The panel MUST receive `onboarding-open` and `onboarding-close`
postMessages from the webview. On `onboarding-open`, the extension
SHALL validate that `msg.target` is an absolute path whose parent
directory exists AND contains no `..` traversal tokens; if valid,
it SHALL invoke
`vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.
file(msg.target), false)` which reloads the current VS Code
window. On `onboarding-close`, the extension SHALL dispose the
panel.

When the onboarding panel disposes (via close message OR user
manually closing the panel), the extension SHALL dispose the
short-lived server spawned for that panel.

#### Scenario: User picks a fresh folder with a subdir name

- **Given** a VS Code window with any (or no) workspace open
- **When** the user runs `ithyno: New Project`, picks `/tmp/scratch`
  as the parent, and enters `hello-ithyno` as the subdir
- **Then** the extension resolves the target as `/tmp/scratch/hello-ithyno`
- **And** it opens an onboarding panel pointed at
  `<server>/onboarding?target=%2Ftmp%2Fscratch%2Fhello-ithyno&channel=vscode`

#### Scenario: User picks a folder and leaves the subdir empty

- **Given** a VS Code window
- **When** the user runs `ithyno: New Project`, picks `/tmp/existing-empty`,
  and submits an empty subdir input
- **Then** the extension resolves the target as `/tmp/existing-empty`
  itself
- **And** the onboarding panel loads with that target

#### Scenario: User cancels the folder picker

- **Given** a VS Code window
- **When** the user runs `ithyno: New Project` then cancels the
  `showOpenDialog`
- **Then** the extension SHALL abort silently — no panel is
  opened, no server is spawned, and no error is shown

#### Scenario: User cancels the subdir input

- **Given** a VS Code window
- **When** the user picks a folder then cancels the
  `showInputBox`
- **Then** the extension SHALL abort silently — no panel is
  opened, no server is spawned

#### Scenario: onboarding-open with a valid target

- **Given** an active onboarding panel for target
  `/tmp/scratch/hello-ithyno`
- **When** the webview posts
  `{ type: "onboarding-open", target: "/tmp/scratch/hello-ithyno" }`
- **Then** the extension MUST call
  `vscode.commands.executeCommand('vscode.openFolder',
  vscode.Uri.file("/tmp/scratch/hello-ithyno"), false)`
- **And** the panel MUST dispose before the reload takes effect

#### Scenario: onboarding-open with a path-traversal target

- **Given** an active onboarding panel
- **When** the webview posts `{ type: "onboarding-open",
  target: "/tmp/../etc/passwd" }`
- **Then** the extension MUST NOT invoke `openFolder`
- **And** it MUST show an error via `vscode.window.showErrorMessage`
  and keep the panel open

#### Scenario: onboarding-close disposes cleanly

- **Given** an active onboarding panel
- **When** the webview posts `{ type: "onboarding-close" }`
- **Then** the extension MUST dispose the panel
- **And** the short-lived onboarding server MUST also dispose

#### Scenario: Panel closed by user without confirming

- **Given** an active onboarding panel mid-init
- **When** the user closes the panel tab manually
- **Then** the extension SHALL dispose the short-lived onboarding
  server via `panel.onDidDispose`
- **And** no `openFolder` reload occurs (the target folder may be
  left partially initialized — the init subprocess is not killed)

