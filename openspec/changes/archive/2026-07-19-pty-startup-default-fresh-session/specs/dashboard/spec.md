# Delta: dashboard — PTY startup default → `claude` (fresh session)

## MODIFIED Requirements

### Requirement: Embedded PTY Uses tmux When Agmsg Is Configured

The embedded PTY session SHALL wrap the resolved manager startup
command in a `tmux new-session` invocation whenever `agents.yaml`
includes a valid top-level `agmsg` block, and SHALL spawn the manager
command directly (pre-P2 behavior) when the block is absent.

The tmux-wrapped startup command SHALL take the shape:

```
tmux new-session -A -s <session-name> -- <managerCommand> <managerArgs...>
```

The `-A` flag SHALL cause tmux to attach to an existing session with
the given name if one is running (idempotent re-attach on WS
reconnect / dev reload). The session name SHALL default to `ithyno`;
when `ITHYNO_TMUX_SESSION` is set to a non-empty string in the
environment, that value SHALL be used instead. The `--` separator
SHALL be emitted between tmux's own flags and the wrapped command so
manager flags (`--continue`, `--resume`, etc.) are not misinterpreted
as tmux options.

The `initialInput` string (the Manager's declared first-message line
from `agents.yaml`) SHALL continue to be written to the PTY's stdin
after the startup command settles — tmux forwards stdin into pane 0's
foreground command so no extra plumbing is added.

When the `agmsg` block is present and the `tmux` binary is not on
`PATH`, the PTY SHALL open a raw shell that prints a banner naming
the missing dependency, the platform install hint, and a note that
removing the `agmsg:` block reverts to the direct-spawn path. The
WebSocket connection SHALL NOT close in this fallback — the user
retains a usable shell.

The manager startup command SHALL be resolved via a three-tier
priority:

1. `registry.managerAgent()` — the first `agents.yaml` entry whose
   `roles` array contains `manager`. Its `command` + `args` form the
   startup line; its `initialInput` (if set) is auto-injected after.
2. `ITHYNO_TERMINAL_STARTUP` env var — treated as a single shell
   string. Backward compat with the pre-manager-config setup.
3. **Fallback: `claude`** (a plain fresh Claude Code session, no
   flags). This tier applies to fresh projects — user hasn't yet
   declared a manager, no env override — and MUST NOT emit
   `--continue`. A newly-scaffolded project has no prior
   conversation to continue, and running `claude --continue` in
   that state prints "No conversation found to continue" and stalls
   the embedded terminal. Users who want session persistence
   declare a `manager` entry with `args: ['--continue']` or
   `args: ['--resume', '<id>']` in their `agents.yaml`.

This requirement establishes tmux hosting only. It does NOT invoke
any `agmsg` binary, does NOT change dispatcher routing, and does NOT
open additional tmux panes for workers — those are landed by
follow-up changes P2b and P2c.

#### Scenario: agmsg block absent → direct spawn unchanged
- **GIVEN** an `agents.yaml` without an `agmsg:` block and a `role: manager` agent declared
- **WHEN** the Terminal panel opens a PTY
- **THEN** the PTY spawns the manager command directly (no tmux wrap), matching pre-P2 behavior
- **AND** the process tree does NOT contain `tmux`

#### Scenario: agmsg block present with tmux installed → tmux wrap
- **GIVEN** an `agents.yaml` containing `agmsg: { team: alpha }` and a `role: manager` agent whose command is `claude` and args are `[--continue]`
- **AND** the `tmux` binary is on `PATH`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line is `tmux new-session -A -s ithyno -- claude --continue`
- **AND** the manager's `initialInput` is written to the PTY after the tmux session bootstraps

#### Scenario: agmsg block present with tmux missing → fallback banner
- **GIVEN** an `agents.yaml` containing an `agmsg:` block
- **AND** the `tmux` binary is NOT on `PATH`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the PTY opens a raw shell that prints a banner including "tmux was not found on PATH", the platform install hint, and the "remove the agmsg: block to fall back" note
- **AND** the WS connection stays open (the user can Ctrl-C / type commands as normal)

#### Scenario: ITHYNO_TMUX_SESSION overrides the session name
- **GIVEN** `agents.yaml` contains an `agmsg:` block, `tmux` is installed, and the environment sets `ITHYNO_TMUX_SESSION=proj-a`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line uses `-s proj-a` (not `-s ithyno`)

#### Scenario: re-attach idempotence via `-A`
- **GIVEN** an `agmsg:`-configured workspace whose tmux session `ithyno` is already running (previous PTY closed but session was detached, not killed)
- **WHEN** the Terminal panel opens a new PTY
- **THEN** `tmux new-session -A -s ithyno` attaches to the existing session (does NOT error, does NOT create a duplicate); the user sees the same tmux state as before the disconnect

#### Scenario: no manager agent, no env override → fresh `claude`
- **GIVEN** a project whose `agents.yaml` has NO entry with `roles: [manager]`
- **AND** the environment has no `ITHYNO_TERMINAL_STARTUP`
- **WHEN** the Terminal panel opens a PTY (with or without an `agmsg` block)
- **THEN** the resolved startup line is `claude` (fresh session — no `--continue` flag), OR when agmsg is configured, `tmux new-session -A -s ithyno -- claude`
- **AND** the terminal does NOT print "No conversation found to continue" — the user lands in a fresh Claude Code session where they can `/resume` if they want a prior conversation

#### Scenario: manager entry with `--continue` restores session persistence
- **GIVEN** a user who wants auto-continue on their established project adds a manager entry `{ name: manager, mode: live-shell, roles: [manager], command: claude, args: [--continue] }` to `agents.yaml`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line is `claude --continue` (or the tmux-wrapped variant when agmsg is configured) — the fallback default is opt-out, not surprise-default
