# Delta: dashboard — PTY fallback becomes per-project session id

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
manager flags (`--resume`, `--session-id`, etc.) are not
misinterpreted as tmux options.

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
3. **Fallback: per-project Claude Code session id**. When neither
   priority 1 nor 2 supplies a command, ithyno SHALL manage a
   persistent UUID at `<project-root>/.ithyno/session-id` and
   choose between `claude --session-id <uuid>` (first launch) and
   `claude --resume <uuid>` (subsequent launches):

   - Read `<project-root>/.ithyno/session-id`. Trim whitespace.
   - **File missing OR empty** → mint a new UUID v4, ensure
     `<project-root>/.ithyno/` exists (`mkdir -p`), write
     `<uuid>\n` to the file, then set the startup command to
     `claude --session-id <uuid>` (Claude Code creates a fresh
     conversation with that specific id).
   - **File present, non-empty** → set the startup command to
     `claude --resume <uuid>` (Claude Code resumes the previously-
     minted session).

   `--continue` MUST NOT be used at this tier — its "most recent"
   picking is opaque and it errors on a truly fresh project. Users
   who want a different startup command declare a manager entry
   (tier 1) or set `ITHYNO_TERMINAL_STARTUP` (tier 2).

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
- **GIVEN** an `agents.yaml` containing `agmsg: { team: alpha }` and a `role: manager` agent whose command is `claude` and args are `[--resume, <id>]`
- **AND** the `tmux` binary is on `PATH`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line is `tmux new-session -A -s ithyno -- claude --resume <id>`
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

#### Scenario: fallback first launch mints a session id
- **GIVEN** a project whose `agents.yaml` has NO entry with `roles: [manager]`
- **AND** the environment has no `ITHYNO_TERMINAL_STARTUP`
- **AND** `<project-root>/.ithyno/session-id` does NOT exist
- **WHEN** the Terminal panel opens a PTY
- **THEN** ithyno mints a fresh UUID v4, creates `<project-root>/.ithyno/session-id` containing that UUID, and the resolved startup line is `claude --session-id <uuid>` (or the tmux-wrapped variant when agmsg is configured)
- **AND** the terminal does NOT print "No conversation found" — Claude Code starts a fresh conversation bound to the newly-minted id

#### Scenario: fallback subsequent launch resumes
- **GIVEN** a project with no manager and no env override
- **AND** `<project-root>/.ithyno/session-id` already exists containing UUID `f0e1d2c3-...`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the resolved startup line is `claude --resume f0e1d2c3-...` (or the tmux-wrapped variant)
- **AND** the Claude Code conversation from the previous PTY is resumed with its history intact
- **AND** no new UUID is minted; `.ithyno/session-id` is unchanged

#### Scenario: fallback with empty or whitespace session-id file → fresh mint
- **GIVEN** `<project-root>/.ithyno/session-id` exists but is empty or contains only whitespace
- **WHEN** the Terminal panel opens a PTY
- **THEN** ithyno treats it as "missing", mints a new UUID, overwrites the file, and starts `claude --session-id <new-uuid>` — no broken `claude --resume ` line is emitted

#### Scenario: user deletes ~/.claude session externally → --resume errors
- **GIVEN** `<project-root>/.ithyno/session-id` contains a UUID
- **AND** the user has deleted the corresponding `~/.claude/projects/<encoded>/<uuid>.jsonl`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the startup line is `claude --resume <uuid>` and Claude Code emits "No conversation found with session ID: <uuid>" — the user recovers by deleting `<project-root>/.ithyno/session-id` and re-opening the Terminal (which mints a fresh id per the first-launch scenario above)

#### Scenario: manager entry overrides the fallback
- **GIVEN** a project whose `agents.yaml` declares a `roles: [manager]` entry with `command: claude` and `args: [--resume, my-fixed-uuid]`
- **WHEN** the Terminal panel opens a PTY
- **THEN** the manager entry (priority 1) wins; ithyno does NOT read or write `.ithyno/session-id` and the startup line uses the manager's declared args verbatim
