---
tags: [pty, tmux, agmsg, embedded-terminal, project-scope]
---

## Why

The embedded PTY's tmux wrap uses a global session name — `"ithyno"`
by default (`server/sync/pty.ts:272`). With `-A` on
`tmux new-session -A -s ithyno`, the second ithyno instance to open
that tmux session simply **attaches to the existing one** rather than
creating a fresh pane.

Consequence: cross-project cwd contamination. If ithyno for project A
runs first and creates the `ithyno` tmux session at cwd=A, opening a
second ithyno instance for project B (Electron respawn, `npm run dev`
in a different dir, VS Code extension activation, anything) attaches
to A's pane — the dashboard for B shows a Manager Claude at cwd=A,
`/opsx:propose` under B lands the scaffold in A.

Concrete failure surfaced 2026-07-30: user launched ithyno at
`openspec-ui`, later opened Electron at `test-proj`. Dashboard showed
the openspec-ui Manager (via tmux session collision), `/opsx:propose`
inside "test-proj's" dashboard landed the scaffold in openspec-ui.

The recent `respawn-manager-pty-on-project-switch` change fixed the
server-side `PROJECT_ROOT` (mutable + endpoint), but the tmux layer
short-circuits it: `terminateAllLivePtys()` closes the WebSocket but
tmux keeps the pane alive; the next reconnect runs
`tmux new-session -A -s ithyno` and re-attaches to the same pane at
the same old cwd.

## What Changes

- **Default session name becomes per-project** — replace the
  hard-coded `"ithyno"` default with `ithyno-<hash>` where `<hash>`
  is a short, stable digest of the resolved project root (SHA-256
  first 12 hex chars: 48-bit collision space, cosmetically short).
- **`ITHYNO_TMUX_SESSION` env override is unchanged** — when set, its
  literal value wins (backward compat for users who opt into
  cross-project shared session for their own reasons).
- **`terminateAllLivePtys()` (from `respawn-manager-pty-on-project-switch`)
  gains a companion cleanup** — best-effort `tmux kill-session -t
  <old-session-name>` invoked when the project switches, so the old
  pane doesn't linger and get re-attached by an unrelated future
  invocation.

**Out of scope**:
- Migration for existing users with running `ithyno` tmux sessions —
  they'll see one final orphan on upgrade, easily cleaned via
  `tmux kill-session -t ithyno`. Documented in outcome.md, not
  automated.
- Renaming the env var (still `ITHYNO_TMUX_SESSION`).

## Success

- Launching two ithyno instances for two different project roots
  produces two distinct tmux sessions (`ithyno-<hashA>` and
  `ithyno-<hashB>`). Each dashboard's Manager Claude sits at its own
  cwd. `/opsx:propose` in each lands in the expected project.
- `POST /api/project/switch` from A to B: previous tmux session
  (A's `ithyno-<hashA>`) is killed, new WS reconnect creates
  `ithyno-<hashB>` at cwd=B. Manager runs at B.
- `ITHYNO_TMUX_SESSION=my-name` still overrides — user's literal name
  wins over the per-project default.
- Existing PTY tests still pass with only session-name expectations
  updated.

## Non-goals

- No change to `-A` semantics or the fallback banner behavior when
  tmux is missing.
- No change to `.ithyno/session-claude` per-project session-id
  storage (that's already per-project; only the tmux pane name was
  global).
- No change to non-agmsg (raw claude spawn) path.
