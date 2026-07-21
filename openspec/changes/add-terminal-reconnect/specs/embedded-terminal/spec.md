## ADDED Requirements

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
