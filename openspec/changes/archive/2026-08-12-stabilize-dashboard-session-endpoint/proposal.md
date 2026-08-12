## Why

Electron session recovery currently tears down and respawns the ithyno server, changing its ephemeral port and per-process token while already-running Manager and worker CLIs retain the old `ITHYNO_BASE` and `ITHYNO_SESSION_TOKEN`. Dispatch then targets a stale endpoint and cannot recover without restarting the CLI session.

## What Changes

- Define a dashboard session identity consisting of one server port and one cryptographically random session token.
- Keep both values constant for the lifetime of an Electron dashboard session, including renderer reloads and authentication recovery.
- Reload the current authenticated launch URL for renderer recovery instead of replacing a healthy server process.
- Ensure the Manager PTY receives the exact port and token owned by its dashboard session.
- Make dispatch fail closed when the authoritative endpoint or token is absent; it must never retry a remembered/default port or expose the token during diagnostics.
- Require every ithyno HTTP boundary to reconsider session freshness and re-expand the current environment instead of trusting values used by an earlier request.
- Apply the same authoritative endpoint and token policy to both single-change and multi-change dispatch definitions, and guard every shipped Claude template against default-port drift.
- Report project-local/global Claude ithyno definition collisions in Manage Skills without mutating the user's global configuration.
- Start a new endpoint identity only when starting a genuinely new dashboard session, such as an application launch or project switch.
- Preserve the existing CSRF checks and token secrecy; this change alters token lifetime, not authorization requirements.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `csrf-protection`: Scope the session token to the dashboard session rather than an incidental server-process restart.
- `electron-shell`: Keep the server endpoint stable during renderer reload and session recovery.
- `embedded-terminal`: Guarantee that Manager processes receive the dashboard session's authoritative endpoint and token values.

## Impact

- Electron main-process session and reload handling.
- Server authentication token initialization.
- Embedded PTY environment construction.
- Cross-CLI dispatch workflow and Agy's eager dispatch rule.
- Electron and server authentication tests; no HTTP API shape or external dependency changes.
