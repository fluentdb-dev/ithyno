## ADDED Requirements

### Requirement: VS Code brokers secure environment-key actions
The VS Code extension SHALL broker Environment UI key-management and
key-dependent encryption requests between the nested dashboard webview,
SecretStorage, and the authenticated ithyno server without sending stored
plaintext back to the dashboard iframe.

#### Scenario: Dashboard requests key status
- **WHEN** the nested dashboard asks whether a workspace key is configured
- **THEN** the Extension Host returns only availability and source metadata

#### Scenario: Dashboard requests key setup
- **WHEN** the user chooses to set or replace the key
- **THEN** the Extension Host collects it with a password-style input and reports success without echoing the value to the dashboard

#### Scenario: Extension and server protocol versions differ
- **WHEN** the current server does not support the secure key-operation protocol
- **THEN** the extension shows an actionable unsupported-version error and preserves the stored key
