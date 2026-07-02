## ADDED Requirements

### Requirement: Optional Initial Input on Agent Spawn
The agent runner SHALL support an optional `initialInput` string per
agent definition in `agents.yaml` and, when present, MUST write the
template-resolved value plus a trailing newline (if not already present)
to the child's stdin exactly once, immediately after spawn — so any
CLI that expects its first task on stdin (rather than as CLI arguments)
receives it without user intervention.

#### Scenario: Initial input is written on spawn
- **WHEN** an agent with `initialInput: "/opsx:apply ${change_id}"` is spawned for change `add-foo`
- **THEN** the runner writes `"/opsx:apply add-foo\n"` to the child's stdin exactly once, before any user-triggered `writeInput` calls can arrive

#### Scenario: Template variables in initialInput are substituted
- **WHEN** `initialInput` contains `${change_id}`, `${worktree_path}`, or `${branch}`
- **THEN** the same substitution engine used for `args` and `env` resolves them, and the resolved string is what gets written

#### Scenario: Trailing newline is preserved, not doubled
- **WHEN** `initialInput` already ends with `\n`
- **THEN** no additional newline is appended (the write is the string as-is)
- **AND WHEN** the string does not end with `\n`
- **THEN** exactly one `\n` is appended before the write

#### Scenario: Absence of initialInput leaves behavior unchanged
- **WHEN** an agent definition has no `initialInput` field
- **THEN** the runner performs no initial write; the child's stdin remains as-spawned (open pipe, no data), matching pre-change behavior

#### Scenario: Initial input is echoed in the transcript
- **WHEN** the initial write succeeds
- **THEN** a `{ stream: "stdin", chunk: <bytes-written>, ts: <server-time> }` entry is pushed into the job's output ring buffer AND broadcast via the existing `agent-job-output` WebSocket event, so all connected clients see the initial prompt on the transcript

#### Scenario: Initial input write failure does not crash the runner
- **WHEN** the write to `child.stdin` throws (child died during spawn, EPIPE)
- **THEN** the runner logs the error and lets the existing exit-handler finalize the job status; the runner process itself remains healthy

#### Scenario: Initial input does not close stdin
- **WHEN** the initial input has been written
- **THEN** the child's stdin remains open so subsequent `writeInput` calls from the dashboard (per `add-agent-stdin-relay`) can send follow-up bytes such as permission-prompt responses
