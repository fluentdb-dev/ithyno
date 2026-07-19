# Delta: dashboard — retire add-manager-agent-config, clarify PTY manager routing

## ADDED Requirements

### Requirement: Manager Entry Drives Fresh PTY Startup

The server SHALL resolve the embedded PTY session's startup
command via a three-tier priority chain whenever a fresh child is
about to be spawned (initial connection or reconnect that spawns
a new process). This resolution is independent of any tmux
wrapping applied later:

1. **`registry.managerAgent()`** — the first `agents.yaml` entry
   whose `roles` array contains `manager`. Its `command` + `args`
   form the startup line. If the entry defines `initialInput`
   (either as a top-level field pre-reshape or as
   `prompts.manager` post-reshape), that string SHALL be written
   to the child's stdin after the startup command settles.
2. **`ITHYNO_TERMINAL_STARTUP` env var** — treated as a single
   shell string, tokenised on whitespace with standard shell
   quoting.
3. **Per-project Claude Code session id fallback** — see
   `Embedded PTY Uses tmux When Agmsg Is Configured` for the
   canonical `<project-root>/.ithyno/session-id` mint-or-resume
   contract. `--continue` MUST NOT be used at this tier.

The chain SHALL be evaluated identically whether or not `agents.yaml`
declares an `agmsg:` block. When the block is present, the resolved
command is subsequently wrapped in `tmux new-session -A -s <name> --`
(see `Embedded PTY Uses tmux When Agmsg Is Configured`); when absent,
the resolved command is spawned directly.

Live PTY sessions SHALL NOT be restarted on `agents.yaml` reload —
only the NEXT fresh spawn picks up a changed manager entry.

#### Scenario: Manager entry takes precedence over env var and session-id

- **GIVEN** `agents.yaml` has a manager entry `command: aider, args: [--yolo]` AND `ITHYNO_TERMINAL_STARTUP=claude` is set AND `.ithyno/session-id` exists with a UUID
- **WHEN** a fresh PTY session opens (no agmsg block)
- **THEN** the child process is `aider --yolo`
- **AND** neither the env var nor the session-id path is consulted

#### Scenario: Env var fallback when no manager entry

- **GIVEN** `agents.yaml` has no manager entry AND `ITHYNO_TERMINAL_STARTUP=aider` is set
- **WHEN** a fresh PTY session opens
- **THEN** the child process is `aider`

#### Scenario: Session-id fallback when neither manager entry nor env var

- **GIVEN** `agents.yaml` has no manager entry AND `ITHYNO_TERMINAL_STARTUP` is unset AND `.ithyno/session-id` is absent
- **WHEN** a fresh PTY session opens
- **THEN** the server mints a new UUID, writes it to `.ithyno/session-id`, and spawns `claude --session-id <uuid>`

#### Scenario: initialInput auto-injected after manager startup

- **GIVEN** the resolved manager entry has `prompts.manager: /opsx:manage` (or pre-reshape `initialInput: /opsx:manage`)
- **WHEN** the PTY spawns
- **THEN** after the child starts, the string `/opsx:manage\n` SHALL be written to its stdin

#### Scenario: Reload does not restart live sessions

- **GIVEN** an open PTY session running `claude --resume <uuid>` AND a user edits `agents.yaml` to change the manager command
- **WHEN** the file watcher reloads the registry
- **THEN** the running session continues unchanged
- **AND** the NEXT fresh spawn picks up the new manager command
