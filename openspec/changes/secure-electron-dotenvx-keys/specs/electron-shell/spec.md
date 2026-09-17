## ADDED Requirements

### Requirement: Electron brokers encryption-key actions through isolated IPC
The Electron shell SHALL expose narrow context-isolated preload methods for key
status, setup/replacement, removal, and key-dependent dotenvx operations, and
SHALL keep stored plaintext in the main process after initial user entry.

#### Scenario: Renderer requests storage status
- **WHEN** the Environment UI requests key status
- **THEN** the main process returns mode, presence, backend, and actionable error metadata without returning the key

#### Scenario: User enters a new key
- **WHEN** the user submits the password-style key field
- **THEN** the renderer sends it once through the dedicated IPC method, clears the field, and receives only success and status metadata

#### Scenario: User removes a key
- **WHEN** the user confirms removal
- **THEN** the main process removes the project-scoped memory value or encrypted envelope and returns secret-free status

### Requirement: Electron shows platform-appropriate recovery guidance
The Environment UI SHALL explain whether key storage is persistent,
session-only, unavailable, or unreadable and SHALL present only actions valid
for the current mode.

#### Scenario: Unsigned macOS build uses session mode
- **WHEN** the current mode is session-only
- **THEN** the UI explains that the key lasts until app exit and that signed builds can use Keychain persistence

#### Scenario: Linux backend is unsafe
- **WHEN** the current mode is unavailable because `basic_text` or no secret store was selected
- **THEN** the UI instructs the user to configure a supported Secret Service or KWallet backend and does not offer persistent save
