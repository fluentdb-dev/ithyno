## Why

The embedded PTY receives the dashboard's authoritative ithyno endpoint and token, but a tmux Manager startup does not explicitly place that identity in the tmux session environment. A persistent tmux server can therefore retain stale endpoint values when ithyno attaches to an existing project session.

## What Changes

- Pass `ITHYNO_PORT`, `ITHYNO_BASE`, and `ITHYNO_SESSION_TOKEN` explicitly when creating a tmux Manager session.
- Register those variables with tmux `update-environment` before `new-session -A` attaches to an existing session.
- Keep the generated startup line free of literal token values by referring to the attaching PTY's environment variables.
- Add regression coverage for tmux-enabled Manager startup, custom session names, argument quoting, and initial-input forwarding.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-terminal`: Propagate the authoritative dashboard identity into new and reattached tmux session environments.

## Impact

- `server/sync/pty.ts` Manager startup command construction.
- PTY/tmux startup tests.
- No HTTP API, `agents.yaml`, or external dependency changes.
