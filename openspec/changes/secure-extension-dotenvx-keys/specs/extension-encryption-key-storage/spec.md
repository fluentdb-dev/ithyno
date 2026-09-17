## ADDED Requirements

### Requirement: VS Code stores encryption keys in workspace-scoped secret storage
The VS Code extension SHALL store a dotenvx encryption key through VS Code
SecretStorage under a versioned workspace-scoped identifier and SHALL NOT write
the plaintext to workspace settings, project files, ithyno state, logs, or
telemetry.

#### Scenario: User saves a key
- **WHEN** the user enters a dotenvx key through the extension's secure key action
- **THEN** the Extension Host stores it in SecretStorage for the active canonical workspace

#### Scenario: Another workspace is opened
- **WHEN** the extension switches to a workspace with a different canonical root
- **THEN** the previous workspace's stored key is not made available to the new workspace

### Requirement: The UI exposes key management without revealing stored plaintext
The extension SHALL let the user set, replace, and remove the workspace key and
SHALL expose only key presence and source status to the dashboard.

#### Scenario: Stored key exists
- **WHEN** the Environment UI requests encryption status
- **THEN** it reports that an extension-managed key is available without returning the key value

#### Scenario: User replaces the key
- **WHEN** the user confirms a new key through a password-style Extension Host input
- **THEN** the stored key is replaced without displaying the previous value

#### Scenario: User removes the key
- **WHEN** the user confirms removal
- **THEN** the extension deletes the workspace-scoped SecretStorage entry and reports the source as missing unless a compatibility key exists

### Requirement: Extension-managed keys are used only for bounded dotenvx operations
The system SHALL retrieve an extension-managed key only for the requested
dotenvx operation, SHALL require the active dashboard session credential for
the one-shot server request, and SHALL discard the request-scoped plaintext
after completion.

#### Scenario: Encryption is requested
- **WHEN** an authenticated user encrypts the selected profile and an extension-managed key exists
- **THEN** the key is supplied only to that dotenvx invocation and the response contains no plaintext key

#### Scenario: Authentication is invalid
- **WHEN** the Extension Host submits a key-dependent operation with an invalid or stale session credential
- **THEN** the server rejects the operation without invoking dotenvx or retaining the supplied key

### Requirement: Encryption keys never propagate to agent processes
The system SHALL remove all supported dotenvx key variables from Manager PTY
and AgentRunner worker environments, whether the key originated in
SecretStorage or the ithyno server's inherited process environment.

#### Scenario: Manager PTY starts after a key is configured
- **WHEN** a new Manager PTY is spawned
- **THEN** its environment contains none of the supported dotenvx key variables

#### Scenario: AgentRunner worker starts after a key is configured
- **WHEN** AgentRunner launches a code, review, verify, or other worker
- **THEN** its environment contains none of the supported dotenvx key variables

#### Scenario: Compatibility key is inherited by the server
- **WHEN** the ithyno server starts with `DOTENVX_KEY` or another supported key variable
- **THEN** dotenvx operations can report that compatibility source while Manager and worker processes still do not inherit it
