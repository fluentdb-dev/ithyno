## Context

The server currently owns `SESSION_TOKEN` and creates it at module load. Electron also chooses a fresh free port every time `createWindowForProject()` runs. The renderer's `ithyno:reload-session` recovery path calls that function even when the existing project server is healthy, so a renderer recovery silently replaces both values while Manager CLIs and tmux sessions still hold the previous environment.

The endpoint identity is security-sensitive: the token remains a bearer credential, and the port participates in the same-origin allow-list. The solution must therefore preserve the existing authorization checks without persisting the token to disk or exposing it through a new unauthenticated discovery endpoint.

## Goals / Non-Goals

**Goals:**

- Give each dashboard session one stable `{ port, token }` identity.
- Keep that identity unchanged across renderer reload and authentication recovery.
- Ensure every Manager PTY receives the exact identity of its owning server.
- Allow a same-session server respawn to reuse the identity when recovery genuinely requires a new child process.
- Retain a new random token boundary for a new application/project session.

**Non-Goals:**

- Changing dispatch routing, `/api/agents/run`, worker timeout behavior, or artifact contracts.
- Persisting bearer tokens across a complete application restart.
- Adding a network discovery API or scanning localhost ports.
- Changing VS Code panel behavior that already reloads its current server URL without respawning the server.
- Preserving an endpoint after a project switch, which intentionally starts a new dashboard session.

## Decisions

### D1: Define the dashboard session boundary explicitly

For Electron, a dashboard session starts when a project is opened and ends when the application quits or switches projects. Renderer reload, focus recovery, and authentication recovery remain inside that session. A project switch starts a new session even if the user later switches back to the original project.

This boundary matches the lifetime of Manager processes launched for one active project. Treating each renderer reload as a new session is rejected because renderer state recovery is an implementation detail and must not invalidate long-running CLIs.

### D2: Reload the authenticated URL without replacing a healthy server

`ithyno:reload-session` will load `currentSpawn.url` into the existing BrowserWindow. It will not call the project-switch/server-teardown path while `currentSpawn` is available. Reloading that URL restores the renderer's token from the authoritative launch URL and leaves the server, port, PTY, and Manager environment untouched.

Restarting the server unconditionally is rejected because it creates the stale endpoint that this change is intended to eliminate.

### D3: Let the launcher preserve identity for a genuine same-session respawn

The Electron launcher will retain the active session's port and token in memory and allow `spawnServer()` to receive them as explicit inputs. The server will accept a dedicated launcher-only token environment variable after validating that it is exactly 64 hexadecimal characters; when absent, it will continue to generate a new 32-byte random token.

The dedicated server-bootstrap variable will be distinct from the Manager-facing `ITHYNO_SESSION_TOKEN`, preventing an unrelated shell environment from accidentally selecting the server credential. No token is written to disk.

If the stable port cannot be rebound, recovery will fail visibly rather than silently select a different port and leave existing Manager processes stale. Starting a new dashboard session remains the explicit escape hatch.

### D4: Keep Manager propagation sourced from the server identity

The PTY environment will continue to expose `ITHYNO_BASE`, `ITHYNO_PORT`, and `ITHYNO_SESSION_TOKEN`, but tests will lock that all three come from the running server's authoritative port and token. Consumers must use these supplied values and must not replace them with port `4321` when they are present.

## Risks / Trade-offs

- **[Longer token lifetime within one open dashboard]** → The token remains memory-only, is still cryptographically random, and is invalidated by project switch or application restart.
- **[Stable port is unexpectedly occupied during genuine child recovery]** → Fail explicitly instead of silently breaking existing CLIs; the user can start a new dashboard session.
- **[Launcher and server token validation drift]** → Centralize token-format validation in the server auth module and cover injected, absent, and invalid values with unit tests.
- **[Reload path accidentally regresses to server replacement]** → Add a focused Electron session-reload regression test that asserts a healthy current spawn is reloaded without invoking server creation or teardown.

## Migration Plan

No stored data migration is required. Existing sessions keep their current behavior until the updated Electron application is restarted. Rollback restores per-process tokens and the former reload behavior without changing repository data.

## Open Questions

None.
