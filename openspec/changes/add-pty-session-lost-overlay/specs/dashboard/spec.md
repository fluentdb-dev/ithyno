## ADDED Requirements

### Requirement: Terminal Session Lost Overlay
The dashboard's embedded terminal SHALL detect a `/pty` WebSocket
close or error event and continue automatic reattachment while the
server-side PTY remains recoverable. The terminal SHALL surface a
session-lost overlay only after the reconnect window expires, the PTY
has exited, or the server session is otherwise irrecoverably gone.

#### Scenario: Transient disconnect stays recoverable
- **GIVEN** the embedded terminal is mounted and the PTY is still alive on the server
- **WHEN** the `/pty` socket closes briefly and automatic reattachment is in progress
- **THEN** the terminal remains active and no lost-session overlay renders
- **AND** the reconnect warning remains local to the terminal pane while the server reattaches

#### Scenario: Irrecoverable session loss triggers overlay
- **GIVEN** the embedded terminal is mounted and automatic reattachment does not succeed within the reconnect window
- **WHEN** the server-side PTY is gone, the server session is dead, or the reconnect window expires
- **THEN** an overlay renders on top of the xterm container with the message "Terminal session ended — reload to reconnect." and a "Reload terminal" button
- **AND** the xterm's existing scrollback remains visible behind the dimmed backdrop for context

#### Scenario: Reload gesture opens a fresh terminal
- **WHEN** the user clicks "Reload terminal"
- **THEN** the current terminal instance is torn down and the terminal restart counter advances
- **AND** a new `/pty` WS opens with a fresh PTY/session identity instead of reusing the dead server session
- **AND** a fresh xterm instance mounts with a live prompt
- **AND** typing into the terminal is echoed by the server, as before

#### Scenario: Clean unmount does not trigger overlay
- **WHEN** the user toggles the terminal pane off or navigates away from the ChangeDetail page
- **AND** the component's cleanup effect closes the WS
- **THEN** the overlay does NOT appear on any remaining or subsequently-mounted view
- **AND** re-opening the terminal starts fresh without stale lost-session state carried across
