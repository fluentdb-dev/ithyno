## 1. Session Identity Plumbing

- [x] 1.1 Add validated launcher-token initialization to the server auth module while preserving random generation for standalone startup.
- [x] 1.2 Extend the Electron server spawner to accept an explicit port and session token for same-session recovery without changing the default new-session path.
- [x] 1.3 Add unit tests for generated, injected, and invalid server-token initialization and explicit-port spawning inputs.

## 2. Electron Session Lifecycle

- [x] 2.1 Represent the active Electron dashboard session as one project-scoped `{ port, token }` identity held in memory.
- [x] 2.2 Change renderer authentication/session reload to reload the current authenticated URL without tearing down a healthy server.
- [x] 2.3 Reuse the active identity for a genuine same-project child recovery, fail visibly if its port cannot be rebound, and rotate identity on project switch.
- [x] 2.4 Add regression tests proving reload preserves the child process, port, and token while project switch creates a new identity.

## 3. Manager Endpoint Propagation

- [x] 3.1 Keep `ITHYNO_PORT`, `ITHYNO_BASE`, and `ITHYNO_SESSION_TOKEN` sourced from the running server session when constructing the embedded PTY environment.
- [x] 3.2 Add PTY tests asserting exact port/base/token propagation and no fallback to port 4321 when explicit session values exist.

## 4. Verification

- [x] 4.1 Run focused Electron, authentication, and PTY tests.
- [x] 4.2 Run typecheck, the non-Claude test suite, production build, and strict OpenSpec validation for this change.
