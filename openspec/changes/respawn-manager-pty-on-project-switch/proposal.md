---
tags: [pty, manager, project-switch, cwd, embedded-terminal]
---

## Why

The Manager Claude Code session (spawned by ithyno's embedded PTY)
inherits its cwd from `PROJECT_ROOT` — a constant resolved **once** at
server boot from `ITHYNO_PROJECT_ROOT ?? process.cwd()`
(`server/index.ts:68`). The `/pty` WebSocket handler passes that
constant as the PTY spawn cwd unconditionally
(`server/index.ts:1693`).

Consequence: once the server is up, the Manager's cwd is frozen. There
is no way to point a running ithyno at a different project without
killing the process and relaunching with a new cwd. Any slash command
(`/opsx:propose`, `/opsx:apply`, `/ithy-opsx:import`) runs at the boot
cwd, regardless of what the dashboard thinks the "current" project is.

Concrete failure surfaced 2026-07-29: user initialized a fresh project
at `/Users/cishihara/Documents/works/test-proj` and expected the
running ithyno session to pick it up. `/opsx:propose` landed the
scaffold in the ithyno tool's own `openspec/changes/`, not test-proj —
the server had booted with cwd = ithyno dev repo.

## What Changes

- **`PROJECT_ROOT` becomes mutable** — replace the module-level
  `const PROJECT_ROOT = ...` with a `let currentProjectRoot` behind a
  `getProjectRoot()` getter and a `setProjectRoot(next)` mutator.
  Callers that today read `PROJECT_ROOT` re-read via the getter.
- **New endpoint `POST /api/project/switch`** — accepts
  `{ projectRoot: string }`. Validates the path (absolute, exists, is
  a directory), rejects unauthorized paths per the existing
  `/api/import/spec-generation` allow-list. On accept: terminates all
  live PTYs, updates the internal project root, broadcasts
  `state-replaced`, returns 200.
- **`terminateAllLivePtys()` helper in `server/sync/pty.ts`** — walks
  the module-level `live: LiveTerminal[]` array and cleanly kills each
  PTY + closes its WebSocket.
- **`/pty` WebSocket handler** — reads `getProjectRoot()` dynamically
  on each new connection, so a reconnect after switch attaches to a
  PTY spawned in the new project's cwd.

**Explicitly out of scope for this change** (deferred to follow-ups):
- Electron `switchProject()` rewrite (removing the server subprocess
  respawn in favor of the endpoint).
- VS Code `onDidChangeWorkspaceFolders` listener wiring.
- A dashboard-side "Open Project" trigger. The endpoint exists; the
  caller can invoke it via devtools / curl / an external tool for the
  initial rollout.

Those follow-ups are legitimate but tangential to the root fix. Land
the core mutable-root + endpoint + PTY kill helper first; each caller
change can be its own small follow-up change.

## Success

- User launches ithyno (`ithyno` CLI or `npm run dev`) from directory
  A. Invokes `POST /api/project/switch { projectRoot: "/path/B" }` via
  devtools / curl. Terminal panel's PTY respawns with cwd = B on
  reconnect. `/opsx:propose <id>` in the reconnected Manager creates
  the scaffold at `/path/B/openspec/changes/`, not `/path/A/`.
- Server restart is NOT required to switch projects at runtime.
- Existing PTY tests keep passing — `cwd` is still passed explicitly
  to `attachPtyToSocket` from the WS handler.

## Non-goals

- No UI change (no dashboard button that calls the endpoint).
- No Electron / VS Code integration change.
- No change to how `PROJECT_ROOT` is initially resolved
  (`ITHYNO_PROJECT_ROOT` env + cwd fallback).
- No session-id migration logic — `resolveClaudeSessionStartup`
  already reads per-project files at spawn time; no changes needed.
