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

- Add a new top-level `agents.yaml` toggle, `tmux: true`, that enables tmux-wrapping of the Manager PTY startup.
- `agmsg:` being configured continues to imply tmux ON (AGMSG requires tmux) — effective tmux enablement is `tmux === true OR agmsg !== null`.
- Add a "Wrap Manager terminal in tmux" checkbox UI in `Settings.tsx` under Execution, backed by `POST /api/config/tmux`.
- Implement cascading settings dependency in `server/agents/config-writer.ts`:
  - **TMUX disabled** (`writeTmux(false)`): Disables `agmsg` and updates all worker agents in `agents.yaml` to `mode: single-prompt`.
  - **AGMSG enabled** (`writeAgmsg(block)`): Sets `agmsg`, enables `tmux: true`, and updates all worker agents in `agents.yaml` to `mode: live-shell`.
  - **AGMSG disabled** (`writeAgmsg(null)`): Removes `agmsg` and updates all worker agents in `agents.yaml` to `mode: single-prompt`.

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
