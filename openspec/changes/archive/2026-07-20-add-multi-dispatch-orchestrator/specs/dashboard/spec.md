## ADDED Requirements

### Requirement: Multi-Dispatch Orchestrator

The system SHALL provide `/ithy-opsx:dispatch-multi <id1> [id2]
...` — a slash command that drives N changes through
`code → review → verify` concurrently using the same agent
registry and worktree infrastructure as `/ithy-opsx:dispatch`.

**Concurrency cap.** The orchestrator SHALL respect
`agents.yaml.maxParallel` (default `3` when absent, valid range
`[1, 10]`). Given `len(ids) > maxParallel`, the excess ids SHALL
be queued; a new worker starts each time a running one finishes.
`maxParallel: 1` SHALL degrade to sequential behavior equivalent
to calling `/ithy-opsx:dispatch` per id.

**Report token extension.** Workers spawned by dispatch-multi (and
by `/ithy-opsx:dispatch` after its report-contract update)
SHALL emit their completion message in the form:

```
stage:$S status:done change:<change-id>
```

The Manager's inbox parser SHALL accept BOTH the extended shape
above AND the legacy `stage:$S status:done` shape. The legacy
shape assumes a single in-flight change per agent (correct for
single dispatch); the extended shape disambiguates across the N
in-flight changes.

**Combined poll loop.** The Manager SHALL maintain a single poll
loop over the agmsg inbox for the whole invocation. On each poll
tick (5-second interval), for every unread message from a worker
whose `(stage, change)` matches an in-flight entry, the Manager
SHALL:

1. Commit any uncommitted worker output on `agent/<change-id>`
   (`impl: <change-id>`) — same Manager-commit contract as
   single-dispatch.
2. Advance the change's phase per the received stage:
   `code → coded`, `review pass → reviewed`, `verify pass →
   done`.
3. On `review needs-rework`, loop back to spawn a fresh code
   worker for that change with the prior findings appended.
   Capped by `MAX_ITERATIONS = 5` per change.
4. On any escalation from any change, that change is dropped
   from the loop and its status becomes `escalated`; other
   in-flight changes continue.
5. After a change reaches a terminal state (`done` or
   `escalated`), if the queue has more ids, pop and spawn the
   next code stage so the active count stays at
   `min(maxParallel, remaining)`.

**Preflight.** Before spawning any worker, the orchestrator SHALL
validate every input id resolves to an active change under
`openspec/changes/<id>/` (not archived). On any unknown id, the
orchestrator MUST escalate the first unknown id and refuse to
spawn any workers.

**Termination.** The loop SHALL end when every input id reaches
`done` or `escalated`. On exit, the orchestrator SHALL print a
per-id summary line reporting the final phase, iteration count,
and elapsed time.

#### Scenario: Two ids fit within default maxParallel

- **GIVEN** `agents.yaml` has no `maxParallel` field (default 3) and code / review / verify workers declared
- **AND** `add-a` and `add-b` are both active in-flight changes
- **WHEN** the user invokes `/ithy-opsx:dispatch-multi add-a add-b`
- **THEN** the orchestrator preflights both ids, then spawns code workers for both concurrently (2 tmux panes / 2 Task subagents)
- **AND** the Manager's poll loop watches for messages from both
- **AND** each change advances through `coded → reviewed → done` independently as its worker messages arrive

#### Scenario: Concurrency cap queues the excess

- **GIVEN** `agents.yaml` has `maxParallel: 2` and code / review / verify workers declared
- **AND** three active changes `add-a`, `add-b`, `add-c`
- **WHEN** the user invokes `/ithy-opsx:dispatch-multi add-a add-b add-c`
- **THEN** code workers spawn for `add-a` and `add-b` immediately
- **AND** `add-c` waits in the queue
- **WHEN** `add-a` finishes its full loop
- **THEN** the orchestrator spawns the code worker for `add-c`

#### Scenario: Unknown id preempts spawn

- **GIVEN** `add-a` is active but `add-typo` does not exist
- **WHEN** the user invokes `/ithy-opsx:dispatch-multi add-a add-typo`
- **THEN** the orchestrator escalates the first unknown id
- **AND** no worker for either change is spawned
- **AND** `agents.yaml` and every worktree is untouched

#### Scenario: Report token disambiguates across in-flight changes

- **GIVEN** `add-a` and `add-b` are both mid-flight, each with a `claude` code worker running
- **WHEN** worker A sends `stage:code status:done change:add-a`
- **AND** worker B sends `stage:code status:done change:add-b`
- **THEN** the Manager correctly routes each message to its owner and advances only the matching change
- **AND** no cross-change message confusion occurs

#### Scenario: Legacy report shape still works for single-change dispatch

- **GIVEN** a worker running under `/ithy-opsx:dispatch <id>` (single-change) emits legacy `stage:code status:done` (no `change:<id>` suffix)
- **WHEN** the Manager's inbox parser receives it
- **THEN** the message MUST be accepted and routed to the sole in-flight change for that entry
- **AND** the single-dispatch flow completes unchanged

#### Scenario: One change escalates, others continue

- **GIVEN** `add-a`, `add-b`, `add-c` are all in-flight under multi-dispatch
- **WHEN** `add-a` hits `MAX_ITERATIONS` and escalates
- **THEN** `add-a` is dropped from the poll loop with status `escalated`
- **AND** `add-b` and `add-c` continue their loops undisturbed
- **AND** the final exit summary shows `add-a: escalated`, others `done` (or their respective final state)

#### Scenario: `maxParallel: 1` degrades to sequential

- **GIVEN** `agents.yaml` has `maxParallel: 1`
- **WHEN** the user invokes `/ithy-opsx:dispatch-multi add-a add-b`
- **THEN** the orchestrator spawns the code worker for `add-a` first, waits for its full loop to reach `done` or `escalated`, then spawns for `add-b`
- **AND** the behavior is equivalent to calling `/ithy-opsx:dispatch add-a && /ithy-opsx:dispatch add-b`

#### Scenario: maxParallel out of range rejected

- **GIVEN** `agents.yaml` has `maxParallel: 0` (or `11`, or a string)
- **WHEN** the registry loads
- **THEN** the loader SHALL fail with an error naming the invalid value
- **AND** the last-known-good config is preserved

#### Scenario: agents.yaml without maxParallel defaults to 3

- **GIVEN** `agents.yaml` has no `maxParallel` field
- **WHEN** the registry loads
- **THEN** `AgentConfig.maxParallel` is `3`
