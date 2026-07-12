# Delta: dashboard — refine Modal + Manager singleton + no-delete

## MODIFIED Requirements

### Requirement: Manager Role In agents.yaml

The system SHALL accept `role: manager` as a first-class value on
entries in the `agents:` list of `agents.yaml`. A manager-role entry
SHALL use the legacy shape (`command` + optional `args[]`); the
runtime-backed shape (`runtime` + `prompt`) SHALL be rejected at
load time with an error message pointing at the manager entry. A
manager-role entry MAY carry an optional `initialInput: string` that
the Terminal panel injects into the PTY after launch (e.g.
`/opsx:manage`).

The `agents.yaml` validator SHALL accept zero or one manager-role
entry. When two or more are present, the loader SHALL fail with an
error naming the second manager-role entry's index.

#### Scenario: Single manager entry loads
- **GIVEN** `agents.yaml` with one entry: `name: primary-manager, role: manager, command: claude, args: [--continue]`
- **WHEN** the registry loads
- **THEN** the entry appears in the loaded agents list with `role: "manager"`
- **AND** `registry.managerAgent()` returns that entry

#### Scenario: Runtime-backed manager rejected
- **GIVEN** `agents.yaml` with `name: m, role: manager, runtime: claude, prompt: /opsx:manage`
- **WHEN** the registry loads
- **THEN** the registry reports a validation error naming the manager entry
- **AND** the last-known-good agents cache is preserved

#### Scenario: Zero manager entries is not an error
- **GIVEN** `agents.yaml` with only worker (role != manager) entries
- **WHEN** the registry loads
- **THEN** the load succeeds
- **AND** `registry.managerAgent()` returns `null`

#### Scenario: Multiple manager entries fail load
- **GIVEN** `agents.yaml` with two `role: manager` entries
- **WHEN** the registry loads
- **THEN** the load fails with an error message naming the second entry
- **AND** `registry.managerAgent()` on the last-known-good config returns the previous state (empty or the single prior manager)

## ADDED Requirements

### Requirement: Agents Config Modal Includes InitialInput Field

The Agents tab config modal SHALL expose an `initialInput` textarea
field, editable in both Add and Edit modes and for both legacy and
runtime-backed shapes. The field's placeholder SHALL be
role-dependent so users see a sensible hint:

- `manager` role → `"/opsx:manage"`
- `code` role → `"/ithy-opsx:apply ${change_id}"`
- other roles → `"Optional prompt injected on spawn"`

On Save, an empty value SHALL omit the field from the resulting
`agents.yaml` entry (matches the loader's optional-field handling).

#### Scenario: Edit opens with existing initialInput populated
- **GIVEN** an agent with `initialInput: "/opsx:manage"`
- **WHEN** the user clicks Edit on that row
- **THEN** the modal's initialInput textarea shows `/opsx:manage`

#### Scenario: Placeholder changes with role
- **GIVEN** the modal is open with role=code
- **WHEN** the user changes role to manager
- **THEN** the initialInput placeholder becomes `/opsx:manage`
- **AND** the current value (if any) is preserved

#### Scenario: Empty initialInput is not persisted
- **GIVEN** the user Adds an agent with an empty initialInput field
- **WHEN** Save round-trips through the write endpoint
- **THEN** the resulting agents.yaml entry has NO `initialInput` key

### Requirement: Agents Config Manager Delete Rejected

The Agents tab SHALL NOT render a `Delete` button on a row whose
agent has `role: "manager"`. The `POST /api/agents/config` endpoint
SHALL respond `400` with `{ error: "manager agents cannot be
deleted from the UI; edit agents.yaml directly to remove" }` when a
`{ action: "delete" }` payload targets a manager-role entry. The
Edit button SHALL remain available so the manager can be
reconfigured or its role changed to a non-manager value (which
implicitly makes it eligible for deletion on a subsequent request).

#### Scenario: Manager row has no Delete button
- **GIVEN** a Configured (idle) row for an agent with `role: manager`
- **WHEN** the Agents tab renders
- **THEN** no `Delete` button appears on that row
- **AND** the `Edit` button IS present

#### Scenario: Non-manager row keeps its Delete button
- **GIVEN** a Configured (idle) row for an agent with `role: code`
- **WHEN** the Agents tab renders
- **THEN** the `Delete` button is present as before

#### Scenario: Server rejects delete on a manager entry
- **GIVEN** `agents.yaml` contains `name: primary-manager, role: manager`
- **WHEN** a client POSTs `{ action: "delete", name: "primary-manager" }`
- **THEN** the response is `400` with the error message above
- **AND** `agents.yaml` is byte-identical to before

#### Scenario: Server delete on a non-manager entry is unaffected
- **GIVEN** `agents.yaml` contains `name: coder, role: code`
- **WHEN** a client POSTs `{ action: "delete", name: "coder" }`
- **THEN** the response is `200` with `{ ok: true }` (as per Phase 5.3's Agents Config Write Endpoint)

### Requirement: Manager Singleton Enforcement

The Agents tab's Add-mode modal SHALL omit `manager` from its role
dropdown when at least one manager-role agent already exists in the
loaded registry. Edit mode is NOT affected — a user Editing the
existing manager keeps `manager` selectable so they can change
other fields without losing role. Additionally, `POST /api/agents/config`
SHALL respond `400` with `{ error: "only one role: manager entry is
allowed" }` when an upsert payload with `role: manager` and a name
different from any existing manager entry is submitted.

#### Scenario: Add modal hides manager when one exists
- **GIVEN** `agents.yaml` contains one entry with `role: manager`
- **WHEN** the user clicks `+ Add agent`
- **THEN** the modal's role dropdown does NOT include `manager`

#### Scenario: Add modal offers manager when none exists
- **GIVEN** `agents.yaml` contains only role=code and role=review entries
- **WHEN** the user clicks `+ Add agent`
- **THEN** the modal's role dropdown includes `manager`

#### Scenario: Edit modal keeps manager selectable for the existing manager
- **GIVEN** an agent with `role: manager` exists AND the user clicks Edit on that row
- **WHEN** the modal renders
- **THEN** the role dropdown includes `manager` (currently selected)
- **AND** the user MAY change it to another role (which frees `manager` for a subsequent Add)

#### Scenario: Server rejects upsert that would create a second manager
- **GIVEN** `agents.yaml` has one entry `name: primary, role: manager`
- **WHEN** a client POSTs `{ action: "upsert", name: "secondary", role: "manager", command: "claude", args: [] }`
- **THEN** the response is `400` with `{ error: "only one role: manager entry is allowed" }`
- **AND** `agents.yaml` is byte-identical to before

#### Scenario: Server accepts editing the existing manager
- **GIVEN** `agents.yaml` has one entry `name: primary, role: manager, command: claude`
- **WHEN** a client POSTs `{ action: "upsert", name: "primary", role: "manager", command: "aider", args: [] }`
- **THEN** the response is `200` with `{ ok: true }`
- **AND** the file's manager entry has `command: aider`
