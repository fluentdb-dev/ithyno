## Why

Projects run by ithyno often require code-level development variables for local
servers, tests, builds, code generation, databases, and external services.
Today those values must be managed outside ithyno, so the Manager PTY and worker
processes can easily run with different or incomplete environments.

## What Changes

- Add a dedicated Development Environment UI for discovering and selecting
  project `.env*` profiles and viewing the effective variable sources.
- Allow users to add, edit, remove, reveal, and explicitly copy variables while
  keeping secret values masked by default and showing the target file before
  saving.
- Use dotenvx as the execution and encryption foundation; `.env*` files remain
  the source of truth and ithyno does not create a second value store.
- Add diagnostics for invalid names, unreadable files, missing expected keys,
  encryption/key state, and accidentally tracked secret-bearing files.
- Apply the selected development profile consistently to newly started Manager
  PTYs and AgentRunner workers, while reserving `ITHYNO_*` variables for
  dashboard-owned session state.
- Store only the selected profile and non-secret UI preferences in the existing
  project-local `.ithyno/` state. Existing processes are not mutated; the UI
  clearly indicates that a restart is required after changes.
- Prevent plaintext values from appearing in list APIs, logs, WebSocket events,
  diagnostics, or routine error responses.

## Capabilities

### New Capabilities

- `development-environment-manager`: Project `.env*` discovery, profile
  selection, safe editing, dotenvx-backed resolution/encryption, diagnostics,
  and secret-safe API/UI behavior.

### Modified Capabilities

- `dashboard`: Expose the Development Environment screen and its project-local
  selection/restart state.
- `embedded-terminal`: Inject the selected code-development environment into
  newly spawned Manager PTYs without allowing `.env*` files to override
  reserved `ITHYNO_*` values.
- `agent-runner`: Inject the same selected code-development environment into
  newly spawned worker processes and worktree executions.

## Impact

- Adds a dotenvx runtime dependency and a shared server-side environment
  resolution module.
- Adds authenticated local APIs for profile discovery, masked metadata,
  explicit value reveal, validation, and atomic `.env*` updates.
- Adds a new dashboard route/navigation entry and environment editor UI.
- Changes Manager PTY and AgentRunner spawn environment construction.
- Reads and writes project `.env*` files and non-secret selection state under
  `.ithyno/`; it does not manage operating-system variables, agent definitions,
  ithyno session credentials, cloud secret stores, or production deployment.
