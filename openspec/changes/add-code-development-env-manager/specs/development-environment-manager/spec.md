## ADDED Requirements

### Requirement: Project env profiles are discovered without leaving the project root
The system SHALL discover supported `.env*` files from the dashboard project
root, SHALL reject paths that escape that root, and SHALL present each supported
file as an explicit development environment profile.

#### Scenario: Supported profiles are listed
- **WHEN** the project contains `.env`, `.env.local`, and `.env.test`
- **THEN** the Development Environment API lists those profiles with their paths and status

#### Scenario: Escaping symlink is rejected
- **WHEN** a candidate env file resolves outside the project root through a symlink
- **THEN** the file is excluded and a path-safety diagnostic is returned

### Requirement: Env files remain the value source of truth
The system SHALL read and write dotenvx-compatible `.env*` files directly and
SHALL NOT duplicate variable values in ithyno configuration or state files.

#### Scenario: Profile selection stores no values
- **WHEN** a user selects a profile
- **THEN** `.ithyno/environment.json` stores the selected profile metadata without storing any environment value

### Requirement: Values are masked until explicitly revealed
The system SHALL omit plaintext values from profile lists, diagnostics,
WebSocket events, and routine errors, and SHALL reveal only one requested value
through an authenticated explicit action.

#### Scenario: Profile is listed
- **WHEN** the UI requests variables for a profile
- **THEN** the response contains keys, sources, masks, and encryption status but no plaintext values

#### Scenario: User reveals one value
- **WHEN** an authenticated local user explicitly reveals one variable
- **THEN** only that variable's current value is returned and the request and response value are not written to application logs

### Requirement: Profile edits are narrow and atomic
The system SHALL validate the target profile, revision, key names, and requested
operations before replacing the selected `.env*` file atomically. It SHALL
preserve unrelated compatible lines and SHALL reject stale revisions.

#### Scenario: Valid edit is saved
- **WHEN** the user reviews and saves a valid key update against the current revision
- **THEN** the target env file is atomically replaced and unrelated entries remain intact

#### Scenario: Concurrent edit is detected
- **WHEN** the env file changed after the UI loaded its revision
- **THEN** the save is rejected as stale without overwriting the newer file

### Requirement: Reserved ithyno variables cannot be managed as project values
The system SHALL reject editing or applying any `.env*` key beginning with
`ITHYNO_` and SHALL report such entries as diagnostics.

#### Scenario: Env file contains reserved key
- **WHEN** a selected profile defines `ITHYNO_SESSION_TOKEN`
- **THEN** the key is excluded from the resolved development environment and a reserved-key diagnostic is shown

### Requirement: dotenvx provides resolution and encryption behavior
The system SHALL resolve profile values and perform supported encryption
operations through the bundled dotenvx adapter rather than an ithyno-specific
env grammar or encryption format.

#### Scenario: Selected layered profile is resolved
- **WHEN** a base file and selected profile define the same key
- **THEN** the effective value follows the documented selected-profile precedence implemented by the dotenvx adapter

#### Scenario: User requests encryption
- **WHEN** the user starts encryption for a writable profile
- **THEN** the operation uses dotenvx and reports its resulting encryption/key state without returning unrelated plaintext values

### Requirement: Environment diagnostics are actionable and secret-safe
The system SHALL diagnose unreadable files, invalid keys, reserved keys,
unsupported syntax, missing expected keys when a schema source is available,
encryption/key state, and risky Git tracking without including plaintext values.

#### Scenario: Secret-bearing file is tracked
- **WHEN** Git reports a selected non-example env file as tracked
- **THEN** the UI shows a warning naming the file without displaying its values or automatically changing Git state

### Requirement: Existing processes are not silently mutated
The system SHALL apply profile changes only to newly started processes and SHALL
show when the current Manager PTY must be restarted to receive the selected
environment.

#### Scenario: Profile changes while Manager is running
- **WHEN** the user changes or edits the selected profile while a Manager PTY is active
- **THEN** the UI marks the Manager environment as restart-required and does not claim that the running process was updated
