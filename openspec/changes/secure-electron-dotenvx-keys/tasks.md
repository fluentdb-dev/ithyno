## 1. Storage policy and platform detection

- [ ] 1.1 Define secret-storage status types for persistent, session-only, unavailable, and decryption-failed modes
- [ ] 1.2 Implement injectable Windows, Linux, and macOS storage-mode detection after Electron app readiness
- [ ] 1.3 Implement strict macOS signature probing that distinguishes stable non-ad-hoc signatures from unsigned, invalid, and ad-hoc builds
- [ ] 1.4 Reject Linux `basic_text`, `unknown`, unavailable encryption, and any attempted plaintext fallback
- [ ] 1.5 Add platform-matrix tests for every storage mode without invoking host credential prompts

## 2. Persistent and session stores

- [ ] 2.1 Define a versioned ciphertext-envelope format containing no plaintext key or project path
- [ ] 2.2 Implement canonical-project hashing and atomic owner-readable writes below Electron's user-data directory
- [ ] 2.3 Implement `safeStorage` encrypt/decrypt and explicit replace/remove behavior for persistent mode
- [ ] 2.4 Implement a project-scoped session-only holder that never writes key material to disk
- [ ] 2.5 Clear session references on project switch, removal, server/session replacement, and app shutdown
- [ ] 2.6 Preserve unreadable ciphertext and return decryption-failed recovery status instead of overwriting it
- [ ] 2.7 Add tests proving plaintext and canonical paths never appear in stored envelopes, errors, or status payloads

## 3. Electron IPC and Environment UI

- [ ] 3.1 Add narrow context-isolated preload/main IPC contracts for status, set/replace, remove, and bounded dotenvx operations
- [ ] 3.2 Add a password-style Environment UI input that submits once and clears immediately without receiving stored plaintext back
- [ ] 3.3 Add explicit confirmation for replacement and removal, including decryption-failed recovery
- [ ] 3.4 Display platform-appropriate persistent, session-only, unavailable, and decryption-failed guidance
- [ ] 3.5 Add IPC and UI tests proving renderer responses and post-save state contain no plaintext

## 4. Bounded dotenvx execution and isolation

- [ ] 4.1 Pass a retrieved Electron key only to the requested dotenvx subprocess without mutating the server or main-process environment
- [ ] 4.2 Reuse or implement the shared dotenvx key-variable sanitizer at Manager PTY and all AgentRunner launch boundaries
- [ ] 4.3 Verify session and persistent keys are released from operation-scoped references after success and failure
- [ ] 4.4 Add regression tests proving Manager, detached/adopted workers, logs, WebSocket events, and API responses do not contain key material

## 5. Packaging, validation, and documentation

- [ ] 5.1 Document that current unsigned macOS builds use session-only storage and that stable Keychain persistence requires a valid consistent signature
- [ ] 5.2 Document Windows DPAPI boundaries and Linux Secret Service/KWallet prerequisites and recovery
- [ ] 5.3 Add packaged-app smoke checks for storage-mode reporting on macOS, Windows, and Linux without requiring real secrets in CI
- [ ] 5.4 Run focused Electron, environment, PTY, AgentRunner, IPC, and UI tests
- [ ] 5.5 Run `npm run typecheck`, `npm test`, `npm run build`, Electron packaging verification, and strict OpenSpec validation
