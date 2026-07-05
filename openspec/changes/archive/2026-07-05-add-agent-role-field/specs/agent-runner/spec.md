## ADDED Requirements

### Requirement: Agent Role Metadata Fields
The agent registry SHALL accept optional `role` (string), `specialties`
(string array), and `concurrency` (integer) fields on each agent
definition, and SHALL default absent fields to `role: "coder"`,
`specialties: []`, and `concurrency: 1` so that agent registry files
written before this change load and behave identically.

#### Scenario: Legacy registry file loads with defaults
- **GIVEN** an `agents.yaml` containing only `name`, `command`, and `args` (the shipped template shape)
- **WHEN** the registry loads the file
- **THEN** loading succeeds with `ok: true`
- **AND** the parsed agent carries `role: "coder"`, `specialties: []`, `concurrency: 1`

#### Scenario: Fully specified agent round-trips
- **GIVEN** an agent entry with `role: reviewer`, `specialties: [area/web, feature/ui]`, and `concurrency: 2`
- **WHEN** the registry loads the file
- **THEN** the parsed `AgentDef` exposes exactly those values

#### Scenario: Partially specified agent gets remaining defaults
- **GIVEN** an agent entry that sets only `role: proposer`
- **WHEN** the registry loads the file
- **THEN** the parsed agent carries `role: "proposer"`, `specialties: []`, `concurrency: 1`

### Requirement: Agent Metadata Validation
The agent registry SHALL reject definitions whose metadata fields have
the wrong shape — `role` that is not a non-empty string, `specialties`
that is not an array of non-empty strings, or `concurrency` that is not
an integer greater than or equal to 1 — and SHALL report the error
through the existing registry error channel, naming the offending agent
and field.

#### Scenario: Non-integer concurrency is rejected
- **GIVEN** an agent entry with `concurrency: 1.5`
- **WHEN** the registry loads the file
- **THEN** loading yields `ok: false` with an error naming the agent and the `concurrency` field

#### Scenario: Zero concurrency is rejected
- **GIVEN** an agent entry with `concurrency: 0`
- **WHEN** the registry loads the file
- **THEN** loading yields `ok: false` with an error naming the agent and the `concurrency` field

#### Scenario: Non-string specialty element is rejected
- **GIVEN** an agent entry with `specialties: [area/web, 42]`
- **WHEN** the registry loads the file
- **THEN** loading yields `ok: false` with an error naming the agent and the `specialties` field

#### Scenario: Arbitrary role strings are accepted
- **GIVEN** an agent entry with `role: archivist` (a role no other part of the system knows about)
- **WHEN** the registry loads the file
- **THEN** loading succeeds — roles are an open set and are not validated against an enum

### Requirement: Metadata Fields Are Inert
The agent runner SHALL NOT change job dispatch, worktree placement, or
process spawning based on `role`, `specialties`, or `concurrency`. The
fields are recorded metadata for later phases; in particular,
`concurrency` SHALL NOT be enforced as a job cap.

#### Scenario: Role-annotated agent spawns identically
- **GIVEN** an agent whose definition carries `role: reviewer` and `specialties: [area/server]`
- **WHEN** a job is started for change `<id>` with that agent
- **THEN** the runner creates `.worktrees/<id>/` on branch `agent/<id>` and spawns the agent exactly as it would for an unannotated agent

#### Scenario: Declared concurrency is not enforced
- **GIVEN** an agent whose definition carries `concurrency: 1`
- **WHEN** jobs for two different changes are started with that agent
- **THEN** both jobs run; no queueing or rejection occurs on account of the `concurrency` value
