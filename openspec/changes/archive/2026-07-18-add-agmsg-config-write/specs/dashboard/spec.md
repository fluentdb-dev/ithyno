# Delta: dashboard — add agmsg config write path

## ADDED Requirements

### Requirement: Agmsg Config Write Endpoint

The server SHALL expose `POST /api/config/agmsg` for creating,
updating, or removing the top-level `agmsg:` block in `agents.yaml`.
The endpoint SHALL accept a JSON body of one of the following two
shapes:

```jsonc
// Enable / upsert:
{ "enabled": true, "team": "<non-empty string>", "storage": "<optional string>" }

// Disable / remove:
{ "enabled": false }
```

The server SHALL:

- Reject non-local origins with `403` (matching the guard on
  `POST /api/config/parallel-execution`).
- When `enabled: true` and `team` is missing or an empty string,
  respond `400` with error message
  `agmsg.team is required when the agmsg block is present`.
- When `enabled: true`, atomically write the `agmsg:` block into
  `agents.yaml` preserving every other top-level key (`agents:`,
  `parallelExecution:`, etc.) and preserving the `agents:` list.
- When `enabled: false`, remove the `agmsg:` key from
  `agents.yaml` if present; no-op if already absent. The
  `agents:` list SHALL remain untouched.
- Broadcast the existing `agents-updated` WS event with the
  refreshed `agmsg` field after a successful write.

#### Scenario: enable + team persists to agents.yaml
- **GIVEN** an `agents.yaml` with no `agmsg:` block and an `agents:` list of length 2
- **WHEN** the UI posts `{ enabled: true, team: "alpha" }` to `/api/config/agmsg`
- **THEN** the response is 200 OK
- **AND** the file on disk contains `agmsg:\n  team: alpha` (or equivalent YAML) at the top level
- **AND** the two existing agents in the list are untouched

#### Scenario: enable with storage
- **GIVEN** the UI posts `{ enabled: true, team: "alpha", storage: ".worktrees/.agmsg.sqlite" }`
- **WHEN** the write completes
- **THEN** `agents.yaml` contains `agmsg: { team: alpha, storage: .worktrees/.agmsg.sqlite }` (equivalent YAML)

#### Scenario: disable removes the block
- **GIVEN** an `agents.yaml` that currently contains `agmsg: { team: alpha }`
- **WHEN** the UI posts `{ enabled: false }` to `/api/config/agmsg`
- **THEN** the response is 200 OK
- **AND** the file on disk no longer contains any top-level `agmsg:` key
- **AND** every other top-level key (agents, parallelExecution, ...) is preserved

#### Scenario: enable without team → 400
- **WHEN** the UI posts `{ enabled: true }` (no team) OR `{ enabled: true, team: "" }`
- **THEN** the server responds `400` with error `agmsg.team is required when the agmsg block is present`
- **AND** `agents.yaml` on disk is unchanged

#### Scenario: non-local origin → 403
- **WHEN** a non-loopback client posts `/api/config/agmsg`
- **THEN** the server responds `403` and does not touch `agents.yaml`

#### Scenario: agents-updated broadcast on successful write
- **WHEN** the write succeeds
- **THEN** the server emits an `agents-updated` WS event whose payload's `agmsg` field reflects the just-written block

## MODIFIED Requirements

### Requirement: Settings Tab

The dashboard SHALL expose a `Settings` tab in the top navigation,
routed at `/settings`, that renders a small form for user-editable
config. The form SHALL include:

- A `Parallel execution` checkbox bound to the `parallelExecution`
  config value. Toggling SHALL persist through
  `POST /api/config/parallel-execution` and broadcast an
  `agents-updated` event so other tabs see the fresh value.
- An `Agmsg` section bound to the top-level `agmsg:` block from
  `agents.yaml`. The section SHALL include:
  - An **Enable** checkbox. When on, the `agmsg` block is present
    in `agents.yaml`. When off, the block is removed.
  - A **Team name** text input (required when Enable is on;
    non-empty).
  - An optional **Storage** text input (path to the SQLite DB;
    empty means "use the agmsg default at
    `~/.agents/skills/agmsg/db/messages.db`").
  - A **Save** button that posts the current form state to
    `POST /api/config/agmsg`.
- All persist paths SHALL broadcast the existing `agents-updated`
  WS event on success so other tabs (Agents, Kanban) see the
  fresh state; no new event type is introduced.

The form's source of truth for the agmsg values SHALL be the
client store's `state.agmsg` (populated by the WS broadcast); the
form draft SHALL reset to that value when the WS event arrives
after a successful Save.

#### Scenario: toggle persists
- **GIVEN** `parallelExecution: false` in `agents.yaml`
- **WHEN** the user opens `/settings` and toggles Parallel execution to on
- **THEN** `agents.yaml` on disk contains `parallelExecution: true` and other keys are unchanged

#### Scenario: broadcast propagates
- **WHEN** a client posts `/api/config/parallel-execution` with `{ value: true }`
- **THEN** the server writes the file AND emits an `agents-updated` WS event carrying the new config

#### Scenario: non-local origin rejected
- **WHEN** a non-local address posts `/api/config/parallel-execution`
- **THEN** the server responds 403

#### Scenario: agmsg form enables and saves team
- **GIVEN** `agents.yaml` has no `agmsg:` block
- **WHEN** the user opens `/settings`, ticks Enable in the Agmsg section, enters `openspec-ui` as team, leaves storage empty, and clicks Save
- **THEN** the client calls `POST /api/config/agmsg { enabled: true, team: "openspec-ui" }` and the server writes the block
- **AND** the `agents-updated` WS event arrives with `agmsg: { team: "openspec-ui" }`
- **AND** the form re-reads that value; the Enable checkbox stays on and the team input shows `openspec-ui`

#### Scenario: agmsg form disables and removes block
- **GIVEN** `agents.yaml` currently has `agmsg: { team: openspec-ui }`
- **WHEN** the user unchecks Enable and clicks Save
- **THEN** the client calls `POST /api/config/agmsg { enabled: false }` and the server removes the block
- **AND** the form's team and storage inputs become empty and disabled

#### Scenario: agmsg form validation surfaces empty team
- **GIVEN** the user has Enable on but the team input is empty
- **WHEN** the user clicks Save
- **THEN** the client either disables Save (client-side guard) OR posts and the server responds 400; either way, `agents.yaml` on disk is not modified
- **AND** a toast surfaces the error message
