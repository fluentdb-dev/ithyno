## Why

ithyno's agent workflows currently depend on dashboard-specific environment variables and direct `curl` calls, so Codex Remote and other processes that were not launched by the embedded Manager PTY cannot reliably discover the active project endpoint or authenticate without exposing the dashboard session token. A shared local bridge is needed so local and remotely controlled agents can address the correct ithyno project without guessing ports, inheriting unrelated process state, or receiving raw credentials.

## What Changes

- Add a transport-neutral local agent bridge that resolves an exact canonical project root to its live ithyno session and invokes an allow-listed operation without exposing the dashboard session token to the caller.
- Add a cross-platform, user-scoped runtime registry and local IPC transport: Unix-domain sockets with restrictive permissions on macOS/Linux and user-ACL-scoped named pipes on Windows.
- Add an `ithyno` CLI surface for bridge status, change queries, phase/activity updates, dispatch, job inspection, cancellation, and needs-human answers.
- Add a stdio MCP server backed by the same bridge client and operation schemas, with read/write tool metadata and project-scoped configuration support for Codex hosts.
- Package installation, diagnostics, stale-session cleanup, and explicit enable/disable commands for both adapters without writing credentials into project files, command arguments, logs, or MCP configuration.
- Update bundled ithyno workflows to use the CLI bridge for supported operations instead of assembling authenticated `curl` commands; retain the current environment-variable HTTP path temporarily as a documented compatibility path rather than a guessed fallback.
- Preserve the existing browser HTTP API, dashboard session-token checks, and Manager PTY variables during migration.

## Capabilities

### New Capabilities
- `local-agent-bridge`: Secure per-project runtime discovery, local IPC authorization, operation policy, lifecycle, and a shared client used by all agent-facing adapters.
- `ithyno-agent-cli`: A scriptable CLI for invoking the bridge with stable structured output, safe error handling, and no credential disclosure.
- `ithyno-mcp-server`: A stdio MCP server exposing the bridge's allow-listed read and write operations to supported Codex hosts.

### Modified Capabilities
- `csrf-protection`: Keep dashboard HTTP token enforcement while adding a local IPC trust boundary that never returns or forwards the raw dashboard session token to agent clients.
- `manager-aware-command-entrypoints`: Route bundled ithyno workflow operations through the shared CLI bridge while retaining an explicit legacy environment-based compatibility path during migration.

## Impact

- Server lifecycle, authentication, project-root resolution, and platform-specific IPC modules.
- The root package's executable/bin surface and packaged Electron/VS Code Extension assets.
- Codex MCP configuration/install helpers and diagnostics.
- Bundled workflow/skill sources, generated templates, and drift tests.
- New security and cross-platform tests for multiple simultaneous projects, stale registrations, unauthorized local clients, secret redaction, and Remote-style processes with no `ITHYNO_*` environment variables.
- No immediate breaking change to the dashboard HTTP API or existing Manager PTY environment contract.
