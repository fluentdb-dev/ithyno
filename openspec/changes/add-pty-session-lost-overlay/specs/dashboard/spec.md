## MODIFIED Requirements

### Requirement: Terminal Session Lost Overlay
The dashboard's embedded terminal SHALL detect a `/pty` WebSocket
close or error event and surface an overlay in place of the xterm
view, communicating that the session ended and offering an explicit
Reload button. The overlay SHALL NOT appear when the WebSocket is
closed by the client's own cleanup (component unmount, deliberate
toggle-off).

#### Scenario: Server restart triggers overlay
- **GIVEN** the embedded terminal is mounted with an open `/pty` WS to a running server
- **WHEN** the server process restarts and the WebSocket receives `close` or `error`
- **THEN** an overlay renders on top of the xterm container with the message "Terminal session ended — reload to reconnect." and a "Reload terminal" button
- **AND** the xterm's existing scrollback remains visible behind the dimmed backdrop for context

#### Scenario: Reload gesture opens a fresh terminal
- **WHEN** the user clicks "Reload terminal"
- **THEN** the current xterm instance is disposed
- **AND** a new `/pty` WS opens with the same session token
- **AND** a fresh xterm instance mounts with a live prompt
- **AND** typing into the terminal is echoed by the server, as before

#### Scenario: Clean unmount does not trigger overlay
- **WHEN** the user toggles the terminal pane off (or navigates away from the ChangeDetail page)
- **AND** the component's cleanup effect closes the WS
- **THEN** the overlay does NOT appear on any remaining or subsequently-mounted view
- **AND** re-opening the terminal starts fresh (no stale overlay state carried across)
