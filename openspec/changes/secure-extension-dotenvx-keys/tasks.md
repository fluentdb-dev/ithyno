## 1. Secret model and process isolation

- [ ] 1.1 Define the canonical supported dotenvx key-variable set and a shared environment sanitizer
- [ ] 1.2 Apply the sanitizer to Manager PTY environment construction without removing selected non-key project variables
- [ ] 1.3 Apply the sanitizer to every AgentRunner launch path, including detached and adopted jobs
- [ ] 1.4 Add regression tests proving inherited key variables do not reach Manager or worker processes

## 2. VS Code SecretStorage integration

- [ ] 2.1 Derive a stable versioned SecretStorage identifier from the canonical active workspace root
- [ ] 2.2 Implement Extension Host helpers to query presence, store/replace through a password input, and confirm/remove a workspace key
- [ ] 2.3 Ensure project switching and extension deactivation release all in-memory plaintext references
- [ ] 2.4 Add Extension Host tests using a fake SecretStorage and multiple workspace roots

## 3. Bounded key-operation protocol

- [ ] 3.1 Define versioned nested-webview messages for key status, setup, removal, and encryption operation results
- [ ] 3.2 Relay messages through the outer VS Code webview while ensuring plaintext responses never return to the dashboard iframe
- [ ] 3.3 Add an authenticated one-shot server encryption request that accepts request-scoped key material without logging, caching, broadcasting, or mutating `process.env`
- [ ] 3.4 Refactor the dotenvx adapter to pass an explicit key only to the individual dotenvx subprocess
- [ ] 3.5 Add tests for invalid session credentials, protocol-version drift, secret-safe failures, and successful request-scoped encryption

## 4. Environment UI

- [ ] 4.1 Extend encryption status with `extension-secret`, `process-environment`, and `missing` sources while exposing no plaintext
- [ ] 4.2 Add VS Code-only set/replace and remove actions to the Environment workspace
- [ ] 4.3 Show actionable unsupported-version and missing-key states without discarding an existing SecretStorage entry
- [ ] 4.4 Preserve the existing environment-variable compatibility flow for browser and Electron shells
- [ ] 4.5 Add UI and bridge tests covering status, setup, replacement, removal confirmation, and secret-free message payloads

## 5. Validation and documentation

- [ ] 5.1 Document secure VS Code key setup and clearly label process-environment configuration as a broader compatibility path
- [ ] 5.2 Verify no key value appears in settings, state files, API responses, WebSocket events, errors, or test snapshots
- [ ] 5.3 Run focused extension, environment, PTY, AgentRunner, and UI tests
- [ ] 5.4 Run `npm run typecheck`, `npm test`, `npm run build`, and strict OpenSpec validation
