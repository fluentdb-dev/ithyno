## ADDED Requirements

### Requirement: Standard dotenvx key files are the default local workflow
The system SHALL support the project-root `.env.keys` file as the default local
source of dotenvx private decryption keys and SHALL keep its contents out of UI
responses, logs, events, ithyno state, and Git.

#### Scenario: First encryption creates a key file
- **WHEN** the user encrypts a supported plaintext profile without any existing private key
- **THEN** dotenvx encrypts the profile, creates or updates the project-root `.env.keys`, and ithyno ensures `.env.keys` is excluded from Git

#### Scenario: Existing ignored key file is used
- **WHEN** an encrypted selected profile has its corresponding private key in a safe project-root `.env.keys`
- **THEN** the profile resolves without requiring key entry in the dashboard

#### Scenario: Key file is unsafe
- **WHEN** `.env.keys` is tracked, symlinked, outside the project root, or cannot be protected as required
- **THEN** the operation fails with a secret-safe actionable diagnostic and does not claim encryption or decryption succeeded

### Requirement: Dotenvx performs encrypted profile resolution
The system SHALL use the bundled dotenvx resolver for encrypted values,
profile-specific private-key lookup, precedence, and decryption errors, and
SHALL NOT treat an encrypted ciphertext string returned by syntax parsing as a
runtime value.

#### Scenario: Encrypted development profile is selected
- **WHEN** `.env.development` is selected and `.env.keys` contains `DOTENV_PRIVATE_KEY_DEVELOPMENT`
- **THEN** the resolved environment contains the decrypted application values according to dotenvx precedence

#### Scenario: Required private key is missing
- **WHEN** a selected encrypted profile has no usable matching private key
- **THEN** the system reports a missing-key diagnostic without returning ciphertext as an application value

#### Scenario: Wrong private key is present
- **WHEN** dotenvx cannot decrypt a selected encrypted value with the available key
- **THEN** the system reports decryption failure without exposing the key, ciphertext details, or partial plaintext

### Requirement: Private-key state is profile-aware
The system SHALL model standard `DOTENV_PRIVATE_KEY` and
`DOTENV_PRIVATE_KEY_*` identifiers as distinct profile-aware credentials and
SHALL NOT collapse them into one untyped generic key.

#### Scenario: Multiple encrypted profiles exist
- **WHEN** `.env`, `.env.development`, and `.env.test` use different private keys
- **THEN** status identifies each profile's configured or missing key source without exposing any key value

#### Scenario: Future suffixed private-key identifier is encountered
- **WHEN** dotenvx resolves a supported `DOTENV_PRIVATE_KEY_*` identifier not present in a fixed ithyno list
- **THEN** ithyno preserves dotenvx compatibility rather than silently dropping that credential from the bounded operation

### Requirement: Decryption credentials do not propagate to agents
The system SHALL give Manager PTYs and AgentRunner workers resolved application
values while removing private-key families, key-file contents, legacy key
credentials, and host-storage payloads from child environments.

#### Scenario: Manager starts from an encrypted profile
- **WHEN** ithyno resolves an encrypted selected profile before starting the Manager PTY
- **THEN** the Manager receives decrypted application variables and no dotenvx private-key credential

#### Scenario: Worker starts from an encrypted profile
- **WHEN** AgentRunner starts a worker using the selected profile
- **THEN** the worker receives decrypted application variables and no dotenvx private-key credential

#### Scenario: Windows environment uses different key casing
- **WHEN** a key credential is present with casing that Windows treats as equivalent
- **THEN** the child-environment sanitizer removes it

### Requirement: Secure storage is an optional dotenvx-compatible enhancement
The system SHALL preserve the `.env.keys` workflow when native or host secure
storage is unavailable and SHALL use named dotenvx private-key semantics for
every optional secure-storage integration.

#### Scenario: Dotenvx Native is available
- **WHEN** a user explicitly moves or copies profile keys to the supported OS secret store
- **THEN** ithyno delegates the operation and subsequent lookup to dotenvx Native and reports the resulting source without retaining a parallel generic key

#### Scenario: Native storage is unavailable
- **WHEN** the operating system, remote extension host, or required provider cannot support dotenvx Native
- **THEN** `.env.keys` remains usable and the UI presents the limitation without blocking standard development

#### Scenario: Host storage is used
- **WHEN** a supported host adapter stores private keys outside `.env.keys`
- **THEN** it preserves the corresponding dotenvx private-key identifiers and supplies only operation-required credentials through a bounded secret-safe bridge

### Requirement: Key management UI starts from source and status
The Environment UI SHALL show the active profile, encryption state, key source,
and remediation before presenting any key-entry action, and SHALL avoid an
always-visible generic password field.

#### Scenario: Local key file is ready
- **WHEN** the selected profile has a matching key in `.env.keys`
- **THEN** the UI reports local key-file readiness and offers only applicable migration or management actions

#### Scenario: First encryption is requested
- **WHEN** the selected plaintext profile has no private key
- **THEN** the UI explains that dotenvx will create `.env.keys` and add the required Git ignore entry before asking for confirmation

#### Scenario: Host key entry is required
- **WHEN** the user explicitly chooses a supported host-storage import or replacement action
- **THEN** a transient password-style input is opened for a named profile key and cleared on save or cancel

### Requirement: Env profiles can be deleted independently of private keys
The system SHALL let the user explicitly delete a discovered project-root env
profile after confirming its exact path, SHALL clear an active selection only
after deletion succeeds, and SHALL NOT silently remove a corresponding private
key.

#### Scenario: Active profile is deleted
- **WHEN** the user confirms deletion of the currently selected regular env profile
- **THEN** the file is removed, the selection and transient profile UI state are cleared, and the refreshed profile list no longer contains it

#### Scenario: Unsafe profile target is requested
- **WHEN** deletion targets a missing, unsupported, symlinked, or project-escaping path
- **THEN** no file or selection state is changed and a safe error is returned

#### Scenario: Deleted profile has a remaining private key
- **WHEN** a profile is deleted while its key remains in `.env.keys` or secure storage
- **THEN** the key is retained and may be reported as orphaned until a separate explicit cleanup is confirmed

### Requirement: Real dotenvx contract tests guard the integration
The system SHALL test the bundled dotenvx implementation using temporary real
files and keys in addition to mocked unit tests.

#### Scenario: Standard lifecycle fixture runs
- **WHEN** CI runs the environment integration suite
- **THEN** it verifies plaintext creation, first encryption, `.env.keys` generation, decryption, profile-specific resolution, missing-key behavior, and credential-free child environments

#### Scenario: Packaged hosts are checked
- **WHEN** Electron and VS Code host assets are staged
- **THEN** the bundled dotenvx version can execute the same standard key-file contract without relying on a global installation
