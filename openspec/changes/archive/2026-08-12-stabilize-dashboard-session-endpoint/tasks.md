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
- [x] 3.3 Require the authoritative base URL and session token in the cross-CLI dispatch workflow, remove the default-port fallback, and add an Agy eager-rule guard.
- [x] 3.4 Add a mandatory per-request session-freshness checkpoint, prevent auth/transport failures from entering worker fallback, and use the server-supported session-token header.
- [x] 3.5 Bring multi-change dispatch onto the same fail-closed endpoint policy and remove its default-port and optional-token guidance.
- [x] 3.6 Detect duplicate global Claude ithyno definitions in Manage Skills and surface their paths as a conflict without deleting them automatically.

## 4. Verification

- [x] 4.1 Run focused Electron, authentication, and PTY tests.
- [x] 4.2 Run typecheck, the non-Claude test suite, production build, and strict OpenSpec validation for this change.
- [x] 4.3 Validate the cross-CLI endpoint guard, template drift, build, and strict OpenSpec contract after the dispatch hardening.
- [x] 4.4 Validate per-request freshness guidance, rendered CLI outputs, template drift, and strict OpenSpec consistency.
- [x] 4.5 Extend the drift guard across API-using command and skill definitions, then run focused tests, build, and strict validation.
