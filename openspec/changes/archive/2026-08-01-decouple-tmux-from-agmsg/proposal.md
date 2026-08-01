## Why

`Embedded PTY Uses tmux When Agmsg Is Configured` (landed by
`wrap-embedded-pty-in-tmux`) ties tmux-wrapping of the Manager's PTY
startup command exclusively to the presence of a top-level `agmsg:`
block in `agents.yaml`. There is no way to run the Manager under tmux
— useful on its own for session persistence across disconnects/reload,
detach/reattach, and eventual multi-pane work — without also
configuring agmsg (team name, storage, the whole agmsg runtime
surface).

Users who want tmux's session-persistence behavior but do not use
agmsg's multi-agent messaging currently have no path to it short of
fabricating an `agmsg:` block they don't otherwise need.

## What Changes

- Add a new independent top-level `agents.yaml` toggle, `tmux: true`,
  that enables tmux-wrapping of the Manager PTY startup regardless of
  whether an `agmsg:` block is present.
- `agmsg:` being configured continues to imply tmux ON (no behavior
  change for existing agmsg users) — effective tmux enablement is
  `tmux === true OR agmsg !== null`.
- `AgentRegistry` gains a `tmux()` accessor mirroring the existing
  `agmsg()` accessor, reading the new top-level field (default
  `false` when omitted).
- `ptyStartup()` in `server/sync/pty.ts` switches its tmux-wrap
  decision from `agmsg !== null` to the new combined
  `tmuxEnabled` boolean. The tmux-missing fallback banner and
  `tmux new-session -A -s <session>` wrapping shape are unchanged;
  only the condition that triggers them changes.
- No UI changes — `agents.yaml` is hand-edited, consistent with every
  other top-level toggle in this file today (`parallelExecution`,
  `maxParallel`, `maxReworkRounds`).

## Capabilities

- Modified: `dashboard` (Embedded PTY Uses tmux When Agmsg Is
  Configured → generalized to "... When Configured", plus a new
  `AgentRegistry` accessor requirement)

## Impact

- `server/agents/registry.ts` — new `tmux` field in `AgentConfig`,
  `validateTmux()`, `tmux()` accessor, `publicConfig()` passthrough.
- `server/sync/pty.ts` — `ptyStartup()`'s tmux-wrap condition.
- `server/agents/registry.test.ts`, `server/sync/pty.test.ts` — new
  coverage for the toggle and its interaction with `agmsg`.
- `openspec/specs/dashboard/spec.md` — MODIFIED requirement (PENDING
  annotation added at propose time per project rule).
