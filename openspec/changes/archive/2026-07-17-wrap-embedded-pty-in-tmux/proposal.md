---
tags: [feature/agents, feature/messaging, area/server, agmsg, tmux, phase-2a-of-3]
---

# Wrap the embedded PTY in a tmux session when agmsg is configured

## Why

P1 (`add-agmsg-config-block`, archived 2026-07-17) landed the
`agmsg: { team, storage? }` config surface on `agents.yaml` as
metadata-only. P2 is the first runtime step of Flavor D
(PTY → tmux → agmsg): when a workspace opts into agmsg, the
embedded PTY hosts a **tmux session** instead of running the manager
command directly. tmux gives every subsequent step (dispatcher routes
workers via `agmsg send`, workers boot in adjacent panes, etc.) a
stable multi-pane host that the browser xterm can attach to
transparently.

This change intentionally scopes to the tmux wrap only. It does NOT
touch dispatch routing, does NOT boot any worker pane, does NOT
invoke `agmsg`. The follow-up proposals do:

- **P2b `route-live-shell-worker-via-agmsg`** — dispatcher routes
  `mode: live-shell` workers to `agmsg send` instead of subprocess.
- **P2c `bootstrap-workers-under-agmsg-monitor`** — workers boot in
  adjacent tmux panes under `agmsg monitor` so they react to messages.

Splitting like this means P2 can land and ship even before P2b/P2c —
users configure agmsg and get a tmux-hosted terminal that still runs
their manager identically to today (attaching to a fresh session with
`-A`). The only observable difference is `tmux` in the process tree.

## What Changes

### 1. PTY spawn path — tmux wrap gated on `agmsg` presence

Extend `server/sync/pty.ts` `ptyStartup(registry)` so its return value
carries a resolved startup command. New behavior:

- **Registry's `agmsg` block is null** → today's behavior, no change:
  spawn `<managerCommand> <managerArgs>` (or the env/default fallback).
- **Registry's `agmsg` block is present** → wrap the same command in
  `tmux new-session -A -s ithyno -- <managerCommand> <managerArgs>`.
  - `-A` attaches to an existing session named `ithyno` if one is
    already running (idempotent re-attach on PTY reconnect / dev
    reload), otherwise creates a new one.
  - `-s ithyno` is a fixed session name in P2. Multi-workspace users
    can override via `ITHYNO_TMUX_SESSION` env var. (A per-project
    default derived from `path.basename(projectRoot)` is a P2 follow-
    up.)
  - `--` marker separates tmux flags from the wrapped command so
    manager args (like `--continue`, `--resume`) don't collide with
    tmux's own flag parsing.

### 2. Precondition check — tmux availability

At the moment `ptyStartup()` resolves the wrap:

- Run `which tmux` (or read a cached lookup done once at boot) to
  confirm the binary is on `PATH`.
- **Missing tmux + agmsg configured**: fail closed. Return a startup
  string that runs `echo` with a clear message so the xterm shows:
  ```
  agmsg is configured in agents.yaml but tmux was not found on PATH.
  Install tmux (e.g. `brew install tmux` on macOS) and reopen the
  Terminal panel, or remove the agmsg: block to fall back to the
  direct-spawn path.
  ```
  The PTY still opens (raw shell) so the user isn't locked out — the
  message and a shell prompt is friendlier than a WS-close.

### 3. `initialInput` continues to reach the manager

`ptyStartup()`'s `initialInput` (the Manager's declared first-message
line) is still returned unchanged and still written to the PTY after
the startup command settles. Since tmux transparently forwards stdin
into pane 0's foreground command (the manager), no extra plumbing is
needed.

Only nuance: on the very first attach, `tmux new-session -A` prints a
tmux status bar before pane 0's command has settled. Existing PTY
waits before `initialInput` fires already exist (attachPtyToSocket
handles that timing today via the `initialInputMode: "stdin"` path);
this change reuses that.

### 4. What this change does NOT touch

- **No dispatcher change**. `/ithy-opsx:dispatch` still uses Task tool
  for `command == "claude"` and subprocess `-p` otherwise. P2b lands
  the agmsg routing.
- **No worker spawn in tmux panes**. P2c handles that.
- **No agmsg binary invocation**. Zero calls to `agmsg send`, `agmsg
  monitor`, or `agmsg spawn` in this change.
- **No agents.yaml schema change**. The `agmsg:` block already exists
  from P1; P2 reads its presence, nothing more.
- **No Windows path work**. tmux is macOS/Linux; Windows users who
  configure `agmsg:` see the "tmux not found" fallback message. A
  Windows-native alternative (Windows Terminal? conhost multiplex?)
  is deferred.
- **No Electron bundling of tmux**. P3 covers packaging.

## Spec deltas (`dashboard` capability)

- **ADDED** `Embedded PTY Uses tmux When Agmsg Is Configured` — new
  requirement covering the tmux wrap, the tmux-availability precondition,
  and the fallback message. The existing PTY spawn path (no agmsg block →
  direct spawn) is described by env-var scenarios inside `App Identity is
  ithyno` and stays untouched.

## Impact

- **Affected specs**: `dashboard` — 1 MODIFIED
- **Affected code**:
  - `server/sync/pty.ts` — extend `ptyStartup()` return, add tmux
    availability check, wrap the startup string when `registry.agmsg()`
    is non-null.
  - `server/sync/pty.test.ts` — new tests: agmsg-absent path
    unchanged; agmsg-present wraps with `tmux new-session -A -s
    ithyno --`; missing-tmux emits the fallback echo message.
  - No client-side change (the xterm is byte-transparent).
- **Risk**:
  - Users who add `agmsg:` block but haven't installed tmux see the
    fallback echo. The message is explicit about the fix; the raw
    shell is still usable. Mitigation: mention tmux requirement in
    P1's spec text (already done indirectly via the "follow-up
    change" callout).
  - `tmux new-session -A` **attaches** to an existing named session
    across dev reloads. If the previous session died half-way
    (manager crashed), `-A` re-attaches to the dead pane. Mitigation:
    tmux marks dead panes and the user can `Ctrl-b :kill-session`.
    Long-term: a `respawn-pane` hook is a P2 follow-up.
  - Cross-project session name collision: `ithyno` is fixed in P2. A
    user running two ithyno workspaces attaches both to the same tmux
    session (unlikely in practice; env var override is provided).
- **Migration**: none. Absent `agmsg:` block → today's spawn path.
  Present block → transparent tmux wrap requiring only that `tmux` is
  on `PATH`.
