## Context

The Electron app currently has no application-owned secure key store. The
development-environment manager can observe dotenvx keys inherited through the
server environment, but that keeps credentials alive too broadly and can
propagate them to unrelated child processes.

Electron 33 exposes synchronous `safeStorage` APIs. Their provider is
platform-dependent: macOS Keychain, Windows DPAPI, and a desktop-dependent
Linux password store. The current ithyno macOS release configuration contains
no Developer ID signing or notarization setup, so Keychain-backed persistence
cannot be treated as durable across app updates even when encryption is
temporarily available.

## Goals / Non-Goals

**Goals:**

- Persist only `safeStorage` ciphertext when the current platform and build can
  provide durable OS-backed protection.
- Use session memory only on unsigned or ad-hoc-signed macOS builds.
- Refuse Linux persistence when Electron selected `basic_text`, `unknown`, or
  no encryption backend.
- Never persist plaintext or silently downgrade to plaintext encryption.
- Scope each stored key to the canonical project root and use plaintext only
  for an explicit dotenvx operation.
- Keep keys out of render responses, logs, general server environments,
  Manager PTYs, and AgentRunner workers.

**Non-Goals:**

- Signing or notarizing the macOS app as part of this change.
- Creating a custom encryption algorithm or master-password scheme.
- Synchronizing keys between devices.
- Storing normal project environment values outside dotenvx-compatible files.
- Providing durable macOS persistence before a stable signing identity exists.

## Decisions

### Classify storage availability before accepting persistence

The Electron main process exposes one of four secret-storage modes:

- `persistent`: Windows with available DPAPI-backed `safeStorage`; Linux with
  available encryption and a backend other than `basic_text` or `unknown`; or
  macOS with available encryption and a valid, stable, non-ad-hoc signature.
- `session-only`: macOS without a qualifying signature but with an otherwise
  usable running application.
- `unavailable`: encryption/provider initialization failed, or Linux selected
  an unsafe/unknown backend.
- `decryption-failed`: a previously written encrypted blob cannot be decrypted
  by the current OS identity or key provider.

The main process SHALL NOT infer signed status from `app.isPackaged`. A small,
injectable signing probe verifies the running macOS executable with the system
code-signing tool and rejects ad-hoc signatures. This probe is isolated behind
an interface so non-macOS builds and tests do not execute macOS commands.

### Store ciphertext in the Electron user-data directory

Persistent mode writes an atomic, owner-readable metadata envelope below
`app.getPath("userData")/secrets/`. The filename uses a hash of the canonical
project root; the file contains a format version, storage backend metadata, and
base64-encoded `safeStorage` ciphertext, never the plaintext or project path.

This is preferred over `~/.ithyno` because Electron already provides a
platform-correct per-application data root. File permissions remain defense in
depth; confidentiality comes from the OS-backed `safeStorage` provider.

### Never write a session-only key to disk

On an unsigned, invalidly signed, or ad-hoc-signed macOS build, the user may
enter a key for the current application session. The main process retains it in
a project-scoped in-memory holder, prompts again after restart, and reports
`session-only` clearly. No ciphertext placeholder or recoverable plaintext is
written to disk.

JavaScript strings cannot be reliably zeroized, so the implementation avoids
copies, replaces references immediately after use, clears the holder on project
switch and shutdown, and never includes the value in errors or diagnostics.

### Keep `safeStorage` calls in the main process

Only the Electron main process calls `safeStorage`. Electron 33 provides the
synchronous API, so encryption/decryption occurs only after `app.ready` and in
response to an explicit key action, never during startup. A future Electron
upgrade can adopt the asynchronous API without changing the storage contract.

The trusted local Environment UI necessarily receives the value while the user
types it. It sends the value once over a narrow context-isolated preload IPC
method, immediately clears the password input, and never receives stored
plaintext back from main. Renderer status responses contain mode, presence,
backend, and actionable errors only.

### Deliver keys through a bounded operation path

The main process retrieves a persistent or session key only for an explicit
dotenvx request and forwards it to the one-shot environment operation. The
server/adapter does not mutate `process.env`, cache the key, broadcast it, or
include it in a response. The dotenvx subprocess receives the key in its
dedicated environment for that invocation only.

The shared key-variable sanitizer introduced by the secure-key changes remains
mandatory at Manager PTY and AgentRunner boundaries.

### Fail closed and offer recovery

Linux `basic_text` is never enabled through `setUsePlainTextEncryption(true)`.
Unavailable storage offers session use only where this proposal explicitly
allows it (unsigned macOS); other unsupported backends ask the user to install
or unlock a supported password store.

If decryption fails after an OS credential, signature, or backend change, the
app preserves the unreadable blob until the user confirms replacement or
deletion. It never overwrites it automatically and never falls back to
plaintext.

## Risks / Trade-offs

- **[Risk] Electron 33 synchronous Keychain calls can block the main process** →
  Invoke them only from explicit user actions after app readiness and migrate
  to async APIs with a future Electron upgrade.
- **[Risk] Signature probing varies across macOS development and release
  builds** → Require successful strict verification plus a non-ad-hoc identity;
  uncertainty resolves to `session-only`.
- **[Risk] A Linux backend can disappear or become locked** → Detect the backend
  at each persistence/decryption action and return an actionable unavailable or
  decryption-failed state.
- **[Risk] DPAPI does not isolate from every process running as the same Windows
  user** → Document the OS security boundary and continue to avoid plaintext
  files and process-wide inheritance.
- **[Risk] Renderer compromise could capture newly typed input** → Keep
  `contextIsolation` enabled, expose a minimal preload method, apply a strict
  content policy, and clear the uncontrolled password field immediately.
- **[Trade-off] Unsigned macOS users must re-enter the key after restart** →
  Prefer an explicit usability cost over unreliable or plaintext persistence.

## Migration Plan

1. Add storage-mode detection, macOS signature probing, and Linux backend
   rejection with unit tests.
2. Add versioned ciphertext envelopes and atomic user-data storage for
   persistent mode.
3. Add the project-scoped session-only holder and lifecycle clearing.
4. Add narrow preload/main IPC and Environment UI setup, replacement, removal,
   and recovery actions.
5. Connect the bounded dotenvx operation and verify subprocess isolation.
6. When signed macOS releases become available later, qualifying builds begin
   offering persistent mode automatically; existing session-only users simply
   set the key once more.

Rollback removes the IPC/UI integration and leaves only encrypted blobs. A
cleanup command can remove those blobs without modifying project env files.

## Open Questions

- Whether the future signing/notarization change should migrate a live
  session-only key into persistent storage after explicit user confirmation.
- Whether a future Electron upgrade should migrate existing synchronous
  ciphertext envelopes during asynchronous provider key rotation.
