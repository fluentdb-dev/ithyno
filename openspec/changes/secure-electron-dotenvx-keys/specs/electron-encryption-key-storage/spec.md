## ADDED Requirements

### Requirement: Electron selects a safe OS-specific storage mode
The Electron main process SHALL classify dotenvx key storage as `persistent`,
`session-only`, `unavailable`, or `decryption-failed` according to the active
platform, encryption backend, and macOS signing identity, and SHALL expose no
plaintext as part of that status.

#### Scenario: Windows encryption is available
- **WHEN** the app is ready on Windows and `safeStorage` encryption is available
- **THEN** key storage is classified as persistent using DPAPI-backed protection

#### Scenario: Linux secure backend is available
- **WHEN** the app is ready on Linux and Electron selected a supported Secret Service or KWallet backend
- **THEN** key storage is classified as persistent

#### Scenario: Linux basic backend is selected
- **WHEN** Electron reports `basic_text`, `unknown`, or unavailable encryption on Linux
- **THEN** persistent key storage is unavailable and no plaintext fallback is enabled

#### Scenario: Signed macOS build is running
- **WHEN** Keychain encryption is available and the running macOS executable has a valid stable non-ad-hoc signature
- **THEN** key storage is classified as persistent

#### Scenario: Unsigned macOS build is running
- **WHEN** the running macOS executable is unsigned, invalidly signed, or ad-hoc signed
- **THEN** key storage is classified as session-only even if `safeStorage` reports encryption availability

### Requirement: Persistent mode stores only OS-protected ciphertext
In persistent mode, Electron SHALL encrypt the dotenvx key with `safeStorage`
and atomically store only a versioned ciphertext envelope under the Electron
user-data directory, scoped by a hash of the canonical project root.

#### Scenario: User saves a key in persistent mode
- **WHEN** the user confirms a new key
- **THEN** the stored file contains versioned metadata and ciphertext but no plaintext key or project path

#### Scenario: App restarts with the same OS identity
- **WHEN** the encrypted envelope and compatible OS key provider remain available
- **THEN** Electron can use the stored key for an explicit dotenvx operation without asking the user to enter it again

### Requirement: Session-only mode never persists key material
In session-only mode, Electron SHALL retain the key only in project-scoped main
process memory and SHALL clear its reference when the project changes, the user
removes it, or the app exits.

#### Scenario: Unsigned macOS user sets a key
- **WHEN** the user enters a key for the current project
- **THEN** the key is usable during the current app session and no key file or ciphertext envelope is written

#### Scenario: App restarts
- **WHEN** a session-only key existed before the app exited
- **THEN** the restarted app reports no configured key and asks for it when a key-dependent operation is requested

### Requirement: Storage never downgrades to plaintext
The system SHALL NOT store a dotenvx encryption key as plaintext and SHALL NOT
enable Electron's plaintext encryption fallback when durable OS-backed
protection is unavailable.

#### Scenario: Secure persistence is unavailable
- **WHEN** the user requests persistent storage on an unsupported backend
- **THEN** the app refuses persistence and explains the supported recovery path without writing the key

### Requirement: Decryption failures preserve recoverability
The system SHALL report an unreadable encrypted envelope as
`decryption-failed`, SHALL NOT overwrite or delete it automatically, and SHALL
require explicit user confirmation before replacement or removal.

#### Scenario: OS credentials or app identity changed
- **WHEN** `safeStorage` cannot decrypt an existing envelope
- **THEN** the UI offers replace and remove actions without exposing ciphertext as a usable value or silently creating plaintext storage

### Requirement: Plaintext is bounded to the requested dotenvx operation
Electron SHALL provide the plaintext key only to an explicit dotenvx operation
and SHALL prevent it from entering renderer status responses, logs, settings,
general server environments, Manager PTYs, and AgentRunner workers.

#### Scenario: Encryption operation completes
- **WHEN** Electron supplies a stored or session key to dotenvx
- **THEN** the operation returns a secret-safe result and releases the operation-scoped key reference

#### Scenario: Manager or worker starts
- **WHEN** a Manager PTY or AgentRunner worker is launched while a key is configured
- **THEN** none of the supported dotenvx key variables are present in the child environment
