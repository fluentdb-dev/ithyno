## Context

The dashboard already keeps the kanban in sync with the on-disk Markdown via a
chokidar watcher and surgical edits with an optimistic lock. The only missing
piece for a single-screen agentic workflow is the instruction channel. Rather
than embedding an LLM SDK (which would not load `.claude/`, could not invoke
`/opsx` commands, and would require rebuilding auth and permission UX), we embed
the *terminal itself*: a real PTY running the user's shell or Claude Code, shown
in the browser via xterm.js.

## Goals / Non-Goals

**Goals:**
- A terminal pane beside the kanban, running the real CLI in the project's cwd.
- Preserve everything Claude Code provides (config, slash commands, auth, permission prompts).
- Live kanban updates when the terminal's Claude edits Markdown (reuse the watcher).
- Cross-platform: macOS, Linux, and Windows (native + WSL).
- Degrade gracefully when no PTY backend is available.

**Non-Goals:**
- Re-implementing chat, an agent loop, or permission UI in the dashboard.
- Multi-user or remotely exposed terminals (local-only).
- Persisting terminal scrollback across server restarts.

## Decisions

- **PTY bridge:** `server/sync/pty.ts` spawns a PTY and bridges it to a dedicated
  `/pty` WebSocket (separate from the data `/ws`). Browser uses xterm.js; bytes
  flow both directions verbatim, plus a small control message for resize.
- **Shell selection by platform:**
  - Windows: prefer `pwsh.exe`, fall back to `powershell.exe`.
  - POSIX: `process.env.SHELL` or `/bin/bash`.
  - The user may configure the launch command (e.g. spawn `claude` directly).
- **Working directory:** the PTY cwd is the resolved OpenSpec project root, so the
  terminal's Claude and the dashboard operate on the same files.
- **Cross-platform paths:** replace ad-hoc `"/"` string handling in
  `changeIdForPath` with `path.relative` + `path.sep` so change detection works
  with Windows backslash paths. CRLF is already preserved by surgical edits.
- **Optional feature:** load `node-pty` lazily; if it fails to load, expose
  `terminal: { available: false }` in `/api/health` and hide the pane.

## Risks / Trade-offs

- **node-pty is a native module.** On Windows it uses ConPTY (Windows 10 1809+),
  and a missing prebuilt forces a Visual Studio Build Tools compile that can break
  `npm install`. Mitigation: prefer a prebuilt-bundling variant and keep the
  feature optional so install never hard-fails.
- **WSL vs native mismatch (Windows).** If the dashboard server runs in
  Windows-native Node while files live in WSL (or vice versa), chokidar file
  events are unreliable across the boundary and the kanban will not follow the
  terminal's edits. Mitigation: document that the server and Claude Code must run
  in the *same* environment (both WSL or both native); the cwd is set from that
  same process so they stay aligned.
- **Security.** The PTY is a real shell over a socket. Mitigation: bind to
  localhost only (already enforced) and refuse the `/pty` upgrade for non-local
  connections; any future remote mode must add authentication.
