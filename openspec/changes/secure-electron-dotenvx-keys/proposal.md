## Why

Electron users need a secure way to provide dotenvx encryption keys without
placing plaintext in `~/.ithyno`, project files, application settings, or the
general process environment. The available protection differs by operating
system and, on macOS, by whether the distributed application has a stable code
signature.

## What Changes

- Add Electron-specific dotenvx key handling backed by Electron `safeStorage`
  only when the active OS backend can provide durable protection.
- Persist encrypted key bytes on Windows through DPAPI-backed `safeStorage`.
- Persist encrypted key bytes on Linux only when a supported Secret Service or
  KWallet backend is active; reject `basic_text`, `unknown`, and unavailable
  encryption rather than silently downgrading.
- Persist encrypted key bytes on macOS only when the application has a stable,
  valid signing identity and Keychain encryption is available.
- Keep keys in main-process memory for the current session on unsigned or
  inconsistently signed macOS builds, prompting again after restart.
- Never fall back to plaintext persistence. Store only encrypted blobs under
  the Electron application data directory and pass plaintext only to the
  requested dotenvx operation.
- Prevent the key from entering Manager PTY, AgentRunner, renderer, logs,
  settings, WebSocket, or general server process environments.
- Add clear status and recovery UI for persistent, session-only, unavailable,
  and decryption-failed states.

## Capabilities

### New Capabilities

- `electron-encryption-key-storage`: OS-aware secure persistence and
  session-only handling of dotenvx encryption keys in the Electron app.

### Modified Capabilities

- `electron-shell`: Broker key setup and key-dependent operations through the
  Electron main process without exposing plaintext to the renderer.

## Impact

- Affects Electron main/preload IPC, application signing detection, application
  data files, Environment UI status/actions, the dotenvx adapter, and child
  process environment sanitization.
- Depends functionally on `add-code-development-env-manager` and complements
  `secure-extension-dotenvx-keys`; the two changes use platform-specific secret
  providers but share the same no-propagation policy.
- Does not require a plaintext `~/.ithyno` key file and does not introduce a
  custom encryption algorithm.
