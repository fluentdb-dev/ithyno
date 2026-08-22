## ADDED Requirements

### Requirement: Layered Agent Timeout Configuration

The Agent registry SHALL resolve separate startup, first-activity, idle,
hard-runtime, and artifact-grace timeout values for every dispatched Agent.
Top-level `agents.yaml.timeouts` values SHALL provide project defaults, and an
Agent's optional `timeouts` block SHALL override them for that Agent.

When configuration is absent, the system MUST use 30 seconds for startup, 180
seconds for first activity, 300 seconds for idle, 5 seconds for artifact grace,
and role-specific hard limits of 3600 seconds for code and 1800 seconds for
review and verify.

#### Scenario: Existing configuration receives defaults
- **GIVEN** `agents.yaml` contains no `timeouts` block
- **WHEN** a code Agent is resolved
- **THEN** its startup, first-activity, idle, and artifact-grace values use the documented defaults
- **AND** its hard-runtime value is 3600 seconds

#### Scenario: Agent override wins
- **GIVEN** project idle timeout is 300 seconds and one Agent declares `timeouts: { idleSeconds: 900 }`
- **WHEN** that Agent is resolved
- **THEN** its idle timeout is 900 seconds
- **AND** other Agents retain 300 seconds

#### Scenario: Invalid timeout is rejected
- **GIVEN** an Agent declares a non-positive or non-finite timeout
- **WHEN** the registry loads
- **THEN** configuration fails with a diagnostic naming the Agent and timeout field

#### Scenario: Hard timeout cannot be shorter than startup
- **GIVEN** resolved startup timeout is 60 seconds and hard timeout is 30 seconds
- **WHEN** the registry validates the configuration
- **THEN** configuration fails before any Agent is dispatched

### Requirement: Activity-aware Agent Timeout Supervisor

The Agent runner SHALL supervise each worker with independent startup,
first-activity, idle, hard-runtime, and artifact-grace timers. Qualifying worker
activity SHALL reset the idle timer but MUST NOT reset or extend the hard
deadline.

Qualifying activity SHALL include non-empty streamed worker output, Agent runner
progress events, valid agmsg working heartbeats, and scoped worktree mutations.
Process liveness and timer polling MUST NOT count as worker activity.

#### Scenario: Worker never produces first activity
- **GIVEN** a worker process acknowledges startup but emits no qualifying activity
- **WHEN** `firstActivitySeconds` elapses
- **THEN** the supervisor terminates it with `timeoutKind: first-activity-timeout`
- **AND** does not report an idle or hard timeout

#### Scenario: Active implementation exceeds the idle duration
- **GIVEN** a code worker emits qualifying activity before every idle deadline
- **WHEN** total runtime grows beyond `idleSeconds`
- **THEN** the worker remains running
- **AND** only its hard deadline remains an absolute limit

#### Scenario: Worker becomes idle after progress
- **GIVEN** a worker emitted qualifying activity and then stopped all activity
- **WHEN** the gap reaches `idleSeconds`
- **THEN** the supervisor terminates it with `timeoutKind: idle-timeout`
- **AND** reports the timestamp of its last activity

#### Scenario: Noisy worker reaches hard runtime
- **GIVEN** a worker continuously emits qualifying activity
- **WHEN** `hardSeconds` elapses
- **THEN** the supervisor terminates it with `timeoutKind: hard-timeout`

#### Scenario: Completion artifact is briefly delayed
- **GIVEN** a review worker reports completion before `review.md` is readable
- **WHEN** the artifact appears within `artifactGraceSeconds`
- **THEN** the supervisor returns completion and artifact judgment continues

#### Scenario: Completion artifact never appears
- **GIVEN** a review worker reports completion but no artifact appears
- **WHEN** `artifactGraceSeconds` elapses
- **THEN** the result is `timeoutKind: artifact-timeout`
- **AND** it is reported as an artifact contract failure rather than implementation inactivity

### Requirement: Supervisor Owns Effective CLI Timeout

Known Agent CLI adapters SHALL align or disable vendor-native prompt timeouts so
they cannot expire before ithyno's resolved hard deadline. A vendor process that
still reports its own timeout MUST be classified as `native-timeout` and SHALL
retain whether qualifying activity occurred before exit.

#### Scenario: Agy default would expire early
- **GIVEN** ithyno resolves a 3600-second hard timeout for an Agy code worker
- **AND** Agy's default print timeout is shorter
- **WHEN** the subprocess command is constructed
- **THEN** the adapter supplies an effective native timeout that does not expire before ithyno's deadline

#### Scenario: Vendor timeout occurs before any activity
- **GIVEN** a vendor CLI exits with its native timeout and no qualifying activity occurred
- **WHEN** the runner finalizes the job
- **THEN** it reports `timeoutKind: native-timeout`
- **AND** marks that no partial activity was observed

### Requirement: Structured Timeout Result Preserves Partial Work

A timed-out Agent job SHALL expose the timeout kind, elapsed runtime,
last-activity timestamp when present, Agent name, dispatched role, and whether
the worktree contains partial changes. Timeout handling SHALL NOT automatically
discard, reset, or overwrite partial work.

#### Scenario: Idle timeout after source edits
- **GIVEN** a code worker modified source files before becoming idle
- **WHEN** the idle timeout terminates it
- **THEN** the job result reports partial work
- **AND** the modified files remain in the worktree

#### Scenario: First-activity timeout leaves a clean worktree
- **GIVEN** a worker produced no qualifying activity or file changes
- **WHEN** first-activity timeout terminates it
- **THEN** the job result reports no partial work
