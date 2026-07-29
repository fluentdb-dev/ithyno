---
tags: [pty, manager, project-switch, cwd, embedded-terminal]
---

## Why

The Manager Claude Code session (spawned by ithyno's embedded PTY)
inherits its cwd from `PROJECT_ROOT` — a constant resolved **once** at
server boot from `ITHYNO_PROJECT_ROOT ?? process.cwd()`
(`server/index.ts:68`). The `/pty` WebSocket handler then passes that
constant as the PTY spawn cwd unconditionally
(`server/index.ts:1693`).

Consequence: once the server is up, the Manager's cwd is frozen. If the
user opens a different project via the dashboard's Open Project flow,
the Manager keeps operating in the ORIGINAL project's directory. All
downstream effects follow:

- `/opsx:propose <id>` creates the change scaffold under the wrong
  project's `openspec/changes/`
- `/opsx:apply` edits the wrong project's files
- `/ithy-opsx:import <target>` (from `refactor-import-to-task-tool-subagent`)
  spawns a sub-agent whose parent Manager is at the wrong cwd
- Session-id resolution (`resolveClaudeSessionStartup(projectRoot)` in
  `server/sync/pty.ts`) mints its `.ithyno/session-claude` file in the
  original project, not the newly-opened one

Electron gets this right by re-spawning the server per project
(see `switchProject(picked)` in `electron/src/main.ts`), but the CLI
`npm run dev` / production single-process paths do not — the server
sticks to its boot-time cwd forever.

Concrete failure surfaced 2026-07-29: user initialized a fresh project
at `/Users/cishihara/Documents/works/test-proj`, expected the running
ithyno session to pick it up, invoked `/opsx:propose` in that context.
Change scaffold landed in the ithyno tool's own `openspec/changes/`
(the server had booted with cwd = ithyno dev repo), not test-proj.

## What Changes

- **`PROJECT_ROOT` becomes mutable / dynamically resolved** — replace
  the module-level `const PROJECT_ROOT = ...` with a getter or `let`
  that can be updated by an Open Project handler. All handlers that
  currently read `PROJECT_ROOT` re-read on each call.
- **New endpoint `POST /api/project/switch`** — accepts
  `{ projectRoot: string }`. Validates the path (absolute, exists, is
  a directory), rejects unauthorized paths per existing `/api/import`
  authorization list, then:
  - Terminates all live PTYs (`live: LiveTerminal[]` in
    `server/sync/pty.ts`) — their consumers see a clean WS close and
    reconnect
  - Updates the internal `PROJECT_ROOT` reference to the new path
  - Re-resolves `openspecDir` from the new root
  - Broadcasts `state-replaced` so dashboards refetch
- **`/pty` WebSocket handler** — reads the current `PROJECT_ROOT`
  (dynamic) on every new connection, so a reconnect after project
  switch attaches to a PTY spawned in the NEW project's cwd
- **Dashboard triggers `POST /api/project/switch`** — the existing
  `NoProjectDecisionPanel` Initialize path AND the `add-electron-welcome-window` /
  Open Project flow both call the endpoint before reloading state
- **Electron `switchProject(picked)` demoted** — no longer needs to
  respawn the whole server process. Instead calls the endpoint. This
  removes the "server restart" flicker on project switch
- **VS Code parity** — the extension's "Open Project" command hits the
  same endpoint

## Success

- User launches ithyno (`ithyno` CLI or `npm run dev`) from directory
  A. Opens project B via the dashboard. Terminal panel's PTY respawns
  with cwd = B. `/opsx:propose <id>` in the Manager creates the
  scaffold at B/openspec/changes/, not A.
- User launches ithyno, imports a project via
  `/ithy-opsx:import <target>` (which uses the Manager PTY). The
  Task-tool sub-agent runs at `<target>` as intended.
- Server restart is NOT required to switch projects. No process kill,
  no port re-bind, no session state loss.
- Electron shell no longer respawns the server on Open Project — same
  process, PTY respawn only.
- Session-id file mints at the correct project root.

## Non-goals

- No change to the Kanban Start / dispatch flow (those already pass
  correct `cwd` per-worktree, not per-project).
- No change to how PROJECT_ROOT is initially resolved (env var + cwd
  fallback).
- No new UI for project switch — this change is purely about making
  the existing Open Project flow correctly re-target the Manager PTY.
