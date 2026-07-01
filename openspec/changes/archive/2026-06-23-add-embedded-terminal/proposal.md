## Why

The ideal workflow is to give Claude an instruction and watch the result land —
in one place. Today that means a terminal window for Claude Code beside a browser
for the dashboard. Embedding a real terminal into the dashboard puts the
instruction channel (Claude Code) and the result channel (the kanban) on a single
screen, while keeping everything Claude Code already provides.

## What Changes

Add a terminal pane to the dashboard backed by a real pseudo-terminal (PTY) on
the local server. The server spawns the user's shell (or `claude` directly) with
its working directory set to the OpenSpec project root, and bridges stdin/stdout
to an xterm.js terminal in the browser over a dedicated WebSocket. Because it is
the real CLI in a PTY — not a re-implementation — `.claude/` config, `/opsx`
commands, authentication, and permission prompts all work unchanged. Edits made
by Claude in the terminal flow through the existing watcher and update the kanban
live on the same screen.

The terminal is an optional feature: if a PTY backend is unavailable (e.g. native
module not built), the dashboard runs without it and reports the terminal as
disabled.

## Capabilities

### New Capabilities
- `embedded-terminal`: a browser terminal pane bridged to a local PTY running the user's shell / Claude Code

### Modified Capabilities
- `openspec-parsing`: path handling is made cross-platform so change detection works on Windows

## Impact

- New dependency: `node-pty` (native; prefer a prebuilt-bundling variant) and `@xterm/xterm`
- New `server/sync/pty.ts` (spawn + WebSocket bridge on `/pty`)
- `server/index.ts` (register the `/pty` socket, feature-detect PTY)
- New `web/src/components/Terminal.tsx` and a split layout pairing terminal + kanban
- `server/parser/workspace.ts` (`changeIdForPath` cross-platform fix)
- Local-only: the PTY exposes a real shell, so it MUST remain bound to localhost
