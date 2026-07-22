# embedded-terminal Specification

## Purpose
TBD - created by archiving change add-ui-orchestration. Update Purpose after archive.
## Requirements
### Requirement: Programmatic Input Injection
The system SHALL accept programmatic input from local HTTP clients and write it
to the active embedded terminal session, so dashboard controls can trigger
commands without typing.

#### Scenario: Inject a command line
- **WHEN** a local POST to /api/pty/inject arrives with text and terminate=true
- **THEN** the system writes the text followed by a newline to the most recently active /pty socket and returns 200

#### Scenario: Inject without terminating newline
- **WHEN** a local POST to /api/pty/inject arrives with terminate=false
- **THEN** the system writes the text verbatim and does NOT append a newline

#### Scenario: No active terminal
- **WHEN** a POST to /api/pty/inject arrives but no /pty socket is open
- **THEN** the system returns 409 with a reason and does not write anywhere

#### Scenario: Non-local client refused
- **WHEN** a non-localhost client sends POST /api/pty/inject
- **THEN** the system rejects the request with 403

### Requirement: Session Persists Across Navigation
The system SHALL keep the PTY session alive when the user navigates between
dashboard pages, so an in-flight conversation or process is not lost by
visiting another change or the specs page.

#### Scenario: Navigate away and back
- **WHEN** the user runs a command in the terminal and then navigates to a different change or the Specs page
- **THEN** the PTY session continues running and the terminal pane shows the same shell, scrollback, and any output produced during navigation

### Requirement: Session Persists Across Hide/Show
The system SHALL keep the PTY session alive when the user toggles the terminal
pane's visibility, so hiding the pane never destroys the shell.

#### Scenario: Hide and show
- **WHEN** the user hides the terminal pane and then shows it again
- **THEN** the same PTY session is visible, including any output that arrived while hidden

### Requirement: Terminal Available on All Routes
The system SHALL render the terminal pane on every dashboard route when the
pane is visible, not just on the change detail page.

#### Scenario: Terminal visible on Overview
- **WHEN** the terminal is visible and the user navigates to the Overview page
- **THEN** the terminal pane remains shown, docked alongside the page content

### Requirement: Embedded Terminal Pane
The system SHALL provide a terminal pane in the dashboard backed by a real
pseudo-terminal on the local server, with its working directory set to the
OpenSpec project root, so the user can run Claude Code and other commands beside
the kanban.

#### Scenario: Run a command in the project
- **WHEN** the user types a command in the terminal pane
- **THEN** it executes in a PTY whose cwd is the OpenSpec project root and output streams back to the pane

#### Scenario: Terminal edit updates the kanban live
- **WHEN** Claude Code in the terminal checks a task in tasks.md
- **THEN** the watcher detects the change and the kanban on the same screen updates without a manual refresh

### Requirement: Cross-platform Shell Selection
The system SHALL choose an appropriate default shell per operating system and
SHALL allow the launch command to be configured.

#### Scenario: Windows default shell
- **WHEN** the server runs on Windows
- **THEN** it launches pwsh.exe when available, otherwise powershell.exe

#### Scenario: POSIX default shell
- **WHEN** the server runs on macOS or Linux
- **THEN** it launches the user's $SHELL, falling back to /bin/bash

### Requirement: Graceful Degradation Without a PTY
The system SHALL run without the terminal when a PTY backend is unavailable, and
SHALL report the terminal's availability.

#### Scenario: PTY backend missing
- **WHEN** the native PTY module cannot be loaded
- **THEN** the dashboard starts normally, reports the terminal as unavailable, and hides the terminal pane

### Requirement: Local-only Terminal Access
The system SHALL restrict the terminal connection to local clients, because the
PTY exposes a real shell.

#### Scenario: Non-local connection refused
- **WHEN** a non-localhost client attempts to open the terminal socket
- **THEN** the system refuses the connection

### Requirement: Terminal Delegated in VS Code Mode
The system SHALL skip mounting the embedded xterm.js terminal pane when the
dashboard runs inside a VS Code webview, because VS Code's own terminal
panel serves the same role and the editor's chrome already provides it.

#### Scenario: Standalone runtime
- **WHEN** the dashboard is loaded outside a VS Code webview (browser or Electron)
- **THEN** the embedded terminal pane is available and toggled via the existing controls

#### Scenario: VS Code runtime
- **WHEN** the dashboard is loaded inside a VS Code webview
- **THEN** the embedded terminal pane is not mounted, and visibility toggles related to it are suppressed

### Requirement: User-triggered terminal restart

The system SHALL provide a user-initiated way to restart just the embedded terminal and its backing PTY, without reloading the rest of the dashboard.

#### Scenario: Restart button in terminal chrome

- **GIVEN** the dashboard is loaded and the terminal pane is visible
- **THEN** a reconnect button (rendered with a `↻` glyph and `aria-label="Restart terminal"`) is visible at the top-right of the terminal host
- **AND** its `title` attribute mentions the keyboard shortcut `Cmd/Ctrl+Shift+K` (which works on both shells)

#### Scenario: Click restarts the terminal only

- **WHEN** the user clicks the reconnect button
- **THEN** the current `/pty` WebSocket is closed
- **AND** the xterm instance is disposed
- **AND** a fresh xterm + new `/pty` WebSocket are created within 200 ms
- **AND** no other dashboard state (open modals, kanban selection, live-panel subscriptions, cached fetch data) is disturbed

#### Scenario: Disconnected state is visible

- **GIVEN** the `/pty` WebSocket has closed (network hiccup, PTY crash, or explicit server-side close)
- **THEN** the reconnect button acquires a warn-state style (accent color + subtle pulse)
- **AND** the `[disconnected]` line still appears in the terminal for continuity with existing behavior

### Requirement: Keyboard shortcut for terminal restart

The system SHALL bind `Cmd/Ctrl+Shift+K` (with terminal focus) to trigger terminal restart on both web and Electron shells. The system SHALL NOT bind `F5` on either shell.

#### Scenario: Cmd/Ctrl+Shift+K with terminal focus

- **GIVEN** the user has focused the terminal (or the reconnect button itself), on either the web or Electron shell
- **WHEN** the user presses `Cmd+Shift+K` (macOS) or `Ctrl+Shift+K` (Windows/Linux)
- **THEN** the terminal restarts (same effect as clicking the reconnect button)
- **AND** the default browser action for this key combo is prevented only when this handler fires

#### Scenario: F5 is not bound

- **WHEN** the user presses `F5` on either shell
- **THEN** the shell's default behavior applies (browser page reload on the web shell; nothing on the Electron shell since no accelerator is bound)
- **AND** the terminal-restart handler does NOT fire

#### Scenario: Shortcut ignored when focus is elsewhere

- **GIVEN** the user's focus is on a Settings input, kanban card, or any other non-terminal element
- **WHEN** the user presses `Cmd/Ctrl+Shift+K`
- **THEN** no terminal restart occurs
- **AND** the default action for that key combo (if any) is not prevented

#### Scenario: Electron menu item

- **GIVEN** the Electron menu is open
- **THEN** a `View → Reload Terminal` item exists, with its label including a `⇧⌘K` visual hint (macOS glyph or platform equivalent); the item does NOT register `Cmd/Ctrl+Shift+K` as a menu accelerator (Electron menu accelerators are global and would bypass the focus-scoping required by the sibling scenario). Users trigger the shortcut via the renderer's focus-scoped keydown handler; clicking the menu item is the mouse-driven equivalent.
- **AND** clicking it restarts the terminal (same effect as pressing the shortcut)
- **AND** the existing `Cmd/Ctrl+R` accelerator continues to reload the entire `BrowserWindow` — unchanged

**Design rationale**: Electron `MenuItem.accelerator` fires regardless of focus, which contradicts the focus-scope requirement. Splitting shortcut delivery (renderer keydown) from menu discoverability (label hint) satisfies both goals.

### Requirement: PTY process cleanup on disconnect

The server SHALL kill the spawned PTY child process when its associated `/pty` WebSocket closes, so that repeatedly restarting the terminal does not accumulate zombie PTYs.

#### Scenario: No PTY leak on restart

- **GIVEN** a PTY child process spawned for a `/pty` WebSocket
- **WHEN** the WebSocket closes (client disconnect, server shutdown, or user-initiated restart)
- **THEN** the PTY child process is killed and its OS entry is reaped
- **AND** the operator can restart the terminal an arbitrary number of times without observing accumulated PTY processes in `ps`

### Requirement: Terminal size toggle in the header

The terminal panel header SHALL render a size toggle to the LEFT of the "Terminal" label. The toggle SHALL expose four exclusive options: Fullscreen, Half, Default, Hidden. Selecting an option SHALL immediately apply the corresponding layout without page navigation.

#### Scenario: Toggle position

- **WHEN** the terminal panel is visible
- **THEN** a size toggle control is present in the terminal header immediately to the left of the "Terminal" label
- **AND** the currently-active option is visually indicated (e.g., `aria-pressed="true"` + a distinct style)

#### Scenario: Fullscreen makes terminal fill the content area

- **WHEN** the user selects Fullscreen
- **THEN** the page content (Kanban / Specs / etc.) collapses within the content area
- **AND** the terminal fills the content area
- **AND** the topbar remains visible and navigable

#### Scenario: Half splits content and terminal 50/50

- **WHEN** the user selects Half
- **THEN** the content area is divided so that the page content and terminal each take approximately 50%
- **AND** the split orientation matches the existing terminal-dock orientation (horizontal split if the terminal currently docks below; vertical split if it docks beside)

#### Scenario: Default returns to baseline layout

- **WHEN** the user selects Default
- **THEN** the layout matches the pre-toggle-introduction baseline
- **AND** the terminal occupies its previous fixed proportion of the content area

#### Scenario: Hidden visually hides the terminal panel but preserves the session

- **WHEN** the user selects Hidden
- **THEN** the terminal panel body is not visible (CSS `display: none`) but remains mounted in the DOM
- **AND** the `/pty` WebSocket stays open
- **AND** the "Terminal" label is not visible
- **AND** the page content occupies the full content area
- **AND** the size toggle itself remains visible as a standalone control at the terminal's dock corner — the sole re-show entry point

#### Scenario: Re-show from Hidden via the standalone toggle

- **GIVEN** the terminal size is Hidden AND the user had scrollback in the terminal before hiding
- **WHEN** the user clicks the standalone toggle to restore
- **THEN** the terminal panel body becomes visible again
- **AND** the same PTY session is shown, with the same shell and the same scrollback intact
- **AND** no `[disconnected]` line appears

### Requirement: Size does not persist across page reloads

The selected terminal size SHALL reset to `Default` on every page reload. No persistence layer (localStorage, sessionStorage, server settings, cookies) SHALL back this state.

#### Scenario: Reload resets to default

- **GIVEN** the user selected Fullscreen (or Half, or Hidden)
- **WHEN** the user reloads the page (F5 or the Reload menu item)
- **THEN** the terminal size is Default on the first paint after reload

### Requirement: All size changes preserve the PTY session

Every transition among Default, Half, Fullscreen, and Hidden SHALL preserve the PTY session — the same shell, the same scrollback, the same WebSocket. No size change SHALL restart the terminal. Only the user-invoked "Reload Terminal" affordance (from add-terminal-reconnect) closes and re-spawns the PTY.

#### Scenario: Layout transitions preserve PTY

- **GIVEN** the user typed a command producing scrollback in Default
- **WHEN** the user selects Half or Fullscreen
- **THEN** the terminal shows the same scrollback and the shell continues to run
- **AND** no `[disconnected]` line appears

#### Scenario: Hidden preserves PTY

- **GIVEN** the user typed a command producing scrollback in any visible layout
- **WHEN** the user selects Hidden AND later restores by any option
- **THEN** the terminal shows the same scrollback and the shell continues to run
- **AND** no `[disconnected]` line appears
- **AND** the PTY child process on the server stays alive throughout — no kill, no re-spawn

### Requirement: Change detail page has no "Hide Terminal" button

The change detail page SHALL NOT render a "Hide Terminal" button. Hiding the terminal is available via the size toggle's Hidden option, which is reachable from any route.

#### Scenario: Change detail page

- **WHEN** the user navigates to any change detail page
- **THEN** no button labeled "Hide Terminal" (or its localized equivalent) is rendered on that page
- **AND** the terminal-hiding affordance is available via the toggle in the terminal panel header instead

### Requirement: Terminal view is gated on agents.yaml presence

The embedded terminal (the whole `<aside class="global-terminal">` pane on the web/Electron shell, plus the VS Code extension's terminal-panel auto-open) SHALL check for `<project-root>/agents.yaml` before rendering or opening. When `agents.yaml` is absent, the terminal view SHALL be suppressed entirely — no aside pane, no hidden-state anchor, no PTY WebSocket, and no VS Code terminal panel — regardless of user configuration.

The rationale: absent `agents.yaml`, there is no dispatch runtime to drive; a terminal without agent orchestration is out of scope for ithyno. Users who want a plain shell can still open one in their host terminal.

#### Scenario: No agents.yaml — terminal view hidden on web/Electron

- **GIVEN** a project whose root does NOT contain `agents.yaml`
- **WHEN** the user opens that project in the ithyno dashboard (browser or Electron shell)
- **THEN** the `<aside class="global-terminal">` pane is NOT rendered
- **AND** the `<div class="terminal-hidden-anchor">` restore button is NOT rendered
- **AND** no `/pty` WebSocket connection is opened by the dashboard
- **AND** the server does NOT spawn a PTY for that project
- **AND** the server logs `[pty] auto-launch skipped — no agents.yaml at <project-root>` for observability

#### Scenario: No agents.yaml — VS Code extension does not open terminal

- **GIVEN** a project without `agents.yaml` opened in VS Code with the ithyno extension active
- **AND** the user's `ithyno.autoLaunchTerminal` setting is `true` (the default)
- **WHEN** the extension activates for that workspace
- **THEN** the extension does NOT open the ithyno terminal panel automatically
- **AND** subsequent explicit user commands (opening the dashboard, invoking `ithyno: New Project`, etc.) still work as before

#### Scenario: agents.yaml present — behavior unchanged

- **GIVEN** a project whose root contains `agents.yaml`
- **WHEN** the user opens that project
- **THEN** the terminal aside renders and the auto-launch fires as before this requirement
- **AND** the Manager Claude Code process starts per the existing per-project session-id logic

#### Scenario: User is nudged to add agents.yaml

- **GIVEN** a project whose root does NOT contain `agents.yaml`
- **WHEN** the user opens the Settings page
- **THEN** an unobtrusive `.info-banner` renders explaining that terminal auto-launch is off and pointing at `agents.yaml` as the enabler

