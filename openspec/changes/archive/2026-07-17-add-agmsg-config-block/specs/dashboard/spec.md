# Delta: dashboard — agents.yaml agmsg config block

## ADDED Requirements

### Requirement: Agmsg Config Block In agents.yaml

The `agents.yaml` top-level schema SHALL accept an optional `agmsg`
block. Absence of the block means agmsg is not configured (the
default; existing agents.yaml files are unaffected). When the block
is present, its shape SHALL be:

```yaml
agmsg:
  team: string       # required; non-empty
  storage: string    # optional; path to SQLite messages DB
```

Field rules:

- `team` — required whenever the block is present. Non-empty string.
  Names the agmsg team room that agents in this workspace join.
- `storage` — optional. Path to the SQLite messages DB, overriding
  agmsg's default (`~/.agents/skills/agmsg/db/messages.db`). Users
  wanting workspace-local isolation typically set this to something
  under `.worktrees/`.

The parsed block SHALL be exposed via `GET /api/agents/config` response's
`agmsg` field and mirrored to clients via the `agents-updated` WS event
payload. When the block is absent, both surface `null`. (The block is NOT
mirrored onto `WorkspaceState`; it stays on the AgentConfig surface,
mirroring how `parallelExecution` is exposed.)

An `agmsg` block whose `team` is missing or empty SHALL cause the
registry to return `ok: false` with a config error stating
`agmsg.team is required when the agmsg block is present`. The
existing agents-config error banner surfaces this message so users
see it in the dashboard.

This requirement establishes the config surface only. It does NOT
start any runtime (no tmux, no `agmsg` binary invocation), and does
NOT change `mode` values or dispatcher routing. Those are landed by
follow-up changes.

#### Scenario: block absent → state.agmsg is null
- **GIVEN** an `agents.yaml` without an `agmsg:` block
- **WHEN** the registry loads
- **THEN** `GET /api/agents/config` returns `agmsg: null` and the `agents-updated` WS payload also carries `agmsg: null`

#### Scenario: block present with team → populated
- **GIVEN** an `agents.yaml` with `agmsg: { team: "alpha" }`
- **WHEN** the registry loads
- **THEN** `GET /api/agents/config` returns `agmsg: { team: "alpha" }` (storage omitted) and the store client mirrors the same shape

#### Scenario: block present with team + storage → both populated
- **GIVEN** an `agents.yaml` with `agmsg: { team: "alpha", storage: ".worktrees/.agmsg.sqlite" }`
- **WHEN** the registry loads
- **THEN** `GET /api/agents/config` returns `agmsg: { team: "alpha", storage: ".worktrees/.agmsg.sqlite" }`

#### Scenario: block present without team → validation error
- **GIVEN** an `agents.yaml` with `agmsg: { storage: "..." }` and no `team` key
- **WHEN** the registry loads
- **THEN** the load returns `ok: false` with `error: "agmsg.team is required when the agmsg block is present"`; the dashboard renders the agents-config error banner with that message

#### Scenario: block present with empty team → validation error
- **GIVEN** an `agents.yaml` with `agmsg: { team: "" }`
- **WHEN** the registry loads
- **THEN** the load returns `ok: false` with the same `agmsg.team is required...` message

#### Scenario: agents.yaml config upsert preserves the block
- **GIVEN** an existing `agents.yaml` containing `agmsg: { team: "alpha" }` and an `agents:` list
- **WHEN** the user upserts an agent via `POST /api/agents/config`
- **THEN** the file is rewritten with the same `agmsg:` block intact — the writer preserves top-level keys it doesn't manage

#### Scenario: this change does not spawn any runtime
- **GIVEN** an `agents.yaml` with a valid `agmsg` block
- **WHEN** the workspace loads
- **THEN** no tmux process is started, no `agmsg` binary is invoked, and no message-routing behavior changes — the block is metadata only in this change
