## ADDED Requirements

### Requirement: VSIX dashboard clipboard writes use the Extension Host

The VS Code extension SHALL route copy requests originating in the dashboard
iframe through the Extension Host and SHALL write text using
`vscode.env.clipboard.writeText()`.

#### Scenario: Copy succeeds in a VSIX dashboard

- **WHEN** a user activates a dashboard copy control in the VSIX
- **THEN** the iframe sends a correlated clipboard-write request to the
  Extension Host
- **AND** the Extension Host writes the requested text to the system clipboard
- **AND** the dashboard receives a success response and shows its copied state

#### Scenario: Clipboard write is rejected

- **WHEN** the Extension Host clipboard API rejects a write request
- **THEN** the dashboard receives a correlated failure response
- **AND** the copy control reports the existing clipboard error to the user

#### Scenario: Browser and Electron copy behavior is preserved

- **WHEN** the dashboard runs outside the VS Code extension channel
- **THEN** copy controls continue using the existing browser clipboard path
- **AND** no VS Code clipboard message is emitted

#### Scenario: Stale write response

- **WHEN** a clipboard response arrives after its originating copy request is
  no longer current
- **THEN** the dashboard ignores the response and does not change a later copy
  operation's state
