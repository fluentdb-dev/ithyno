# vscode-extension — deltas from add-vscode-extension-new-project

## ADDED Requirements

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
