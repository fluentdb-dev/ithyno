# Delta: dashboard — Manager declaration in agents.yaml

## ADDED Requirements

### Requirement: Manager Role In agents.yaml

The system SHALL accept `role: manager` as a first-class value on
entries in the `agents:` list of `agents.yaml`. A manager-role
entry SHALL use the legacy shape (`command` + optional `args[]`);
the runtime-backed shape (`runtime` + `prompt`) SHALL be rejected
at load time with an error message pointing at the manager entry.
A manager-role entry MAY carry an optional `initialInput: string`
that the Terminal panel injects into the PTY after launch (e.g.
`/opsx:manage`).

The `agents.yaml` validator SHALL accept zero, one, or many
manager-role entries. When more than one is present, the Terminal
panel SHALL pick the first (by file order); subsequent entries
are ignored for launch but remain visible in the Configured
(idle) list on the Agents tab so the user can Edit / Delete them.

#### Scenario: Single manager entry loads
- **GIVEN** `agents.yaml` with one entry: `name: primary-manager, role: manager, command: claude, args: [--continue]`
- **WHEN** the registry loads
- **THEN** the entry appears in the loaded agents list with `role: "manager"`
- **AND** `registry.managerAgent()` returns that entry

#### Scenario: Runtime-backed manager rejected
- **GIVEN** `agents.yaml` with `name: m, role: manager, runtime: claude, prompt: /opsx:manage`
- **WHEN** the registry loads
- **THEN** the registry reports a validation error naming the manager entry
- **AND** the last-known-good agents cache is preserved (loader's existing behavior)

#### Scenario: Zero manager entries is not an error
- **GIVEN** `agents.yaml` with only worker (role != manager) entries
- **WHEN** the registry loads
- **THEN** the load succeeds
- **AND** `registry.managerAgent()` returns `null`

### Requirement: Terminal Panel Uses Declared Manager

The server SHALL determine the embedded Terminal panel's PTY
startup command in the following priority order when a fresh
session is spawned:

1. The first `role: manager` entry from `agents.yaml`
   (`registry.managerAgent()`), using its `command`, `args`, and
   `initialInput`.
2. The `ITHYNO_TERMINAL_STARTUP` environment variable, treated as
   a single shell string.
3. The hardcoded default `claude --continue`.

The server SHALL emit the resolved `initialInput` (if any) into
the PTY's stdin after the child has started, so the Manager can
receive an auto-injected line like `/opsx:manage` without user
input.

#### Scenario: Manager entry takes precedence over env var and default
- **GIVEN** `agents.yaml` has a manager entry `command: aider, args: []` AND `ITHYNO_TERMINAL_STARTUP=claude --continue` is set
- **WHEN** a fresh PTY session is opened
- **THEN** the child process is `aider`
- **AND** the env-var value is NOT used

#### Scenario: Env var fallback when no manager entry
- **GIVEN** `agents.yaml` has no manager entry AND `ITHYNO_TERMINAL_STARTUP=aider` is set
- **WHEN** a fresh PTY session is opened
- **THEN** the child process is `aider`

#### Scenario: Hardcoded default when neither manager entry nor env var
- **GIVEN** `agents.yaml` has no manager entry AND `ITHYNO_TERMINAL_STARTUP` is not set
- **WHEN** a fresh PTY session is opened
- **THEN** the child process is `claude` with `--continue`

#### Scenario: initialInput is auto-injected
- **GIVEN** the resolved manager entry has `initialInput: /opsx:manage`
- **WHEN** the PTY is spawned
- **THEN** after the child starts, the string `/opsx:manage\n` is written to its stdin

#### Scenario: Missing initialInput is a no-op
- **GIVEN** the resolved manager entry has no `initialInput` field
- **WHEN** the PTY is spawned
- **THEN** nothing is written to stdin after start; the user sees the Manager's normal prompt
