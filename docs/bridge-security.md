# Local bridge security and runtime contract

This project uses a local project bridge for CLI and MCP calls. It is intentionally narrower than the browser HTTP server: it exposes only a project-scoped Unix socket (or Windows named pipe when enabled), never a guessed `localhost:4321` port, and only accepts requests for the same canonical project root.

## Runtime publication and permissions

- The runtime registry canonicalizes the project path with `realpath` / `resolve` to avoid symlink and case-mismatch drift.
- The descriptor is written via a same-directory temp file plus atomic rename, then reduced to `0600` permissions before promotion.
- The runtime directory itself remains `0700` and lives under the current OS user’s runtime area (`$XDG_RUNTIME_DIR` on Linux/macOS; `%LOCALAPPDATA%` on Windows).
- The descriptor contains only project identity, IPC address, PID, process start identity, protocol version, and generation — never tokens or credentials.

## Liveness and stale replacement

The bridge validates the live process identity and the stored generation before reusing a runtime descriptor:

- A descriptor is valid only when the PID still exists and the live process start identity matches the stored value.
- Generation increments when a new registration replaces an older descriptor for the same project.
- Stale descriptors are pruned automatically, and the runtime is treated as unavailable when the process is gone or the start identity does not match.

This avoids stale PID reuse, stale sockets, and partial replacement races after a crash or restart.

## IPC protocol and validation

The Unix socket protocol is deliberately strict:

- JSON requests must be newline-delimited.
- Unsupported protocol versions, unknown operations, malformed JSON, oversized payloads, duplicate request IDs, and deadline timeouts are rejected with structured validation errors.
- Responses are sanitized before leaving the process so tokens, dotenv keys, authorization headers, cookies, and similar values are redacted.

## CLI and MCP contract

Both the CLI and the MCP server must not inherit or re-use environment variables that leak local credentials:

- `ITHYNO_*` values are stripped before child process launch.
- The bridge never falls back to `localhost:4321` or a fixed port.
- Project routing is based on the canonical project root, not a guessed server URL.
- The same-user local socket is the only supported transport for CLI/MCP communication.

## Developer notes

The authoritative implementation lives in `server/bridge.ts`; tests for runtime publication, lifetime checks, protocol regressions, CLI env stripping, and real stdio MCP validation live in `server/bridge.test.ts` and `server/mcp-server.test.ts`.

Windows-specific write-path work remains intentionally disabled until the verified current-user named-pipe ACL and remote-client rejection model is implemented and proven.
