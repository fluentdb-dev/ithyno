# Delta: dashboard — retire refine-agents-config-modal, keep server guards

## ADDED Requirements

### Requirement: Manager Agent Server-Side Singleton Guard

The `POST /api/agents/config` endpoint SHALL enforce two server-
side guardrails around manager-role agents, independent of any
client-side dropdown or chip filter. These guards MUST NOT be
weakened when the Modal UI evolves.

- **Delete guard**: an `action: "delete"` payload whose target
  entry has `roles` containing `manager` MUST return `400` with
  `{ error: "manager agents cannot be deleted from the UI; edit
  agents.yaml directly to remove" }`. `agents.yaml` MUST be
  byte-identical to before.
- **Second-manager guard**: an `action: "upsert"` payload with
  `roles` containing `manager` AND whose `name` differs from any
  existing manager entry MUST return `400` with
  `{ error: "only one agent may include 'manager' in roles" }`.
  `agents.yaml` MUST be byte-identical to before.

Editing the existing manager (same `name`, `roles` still contains
`manager`) MUST succeed — the guard identifies the "second manager"
case by name comparison, not by role alone.

#### Scenario: Delete on the manager entry is rejected

- **GIVEN** `agents.yaml` contains an entry with `roles: [manager]`, name `primary`
- **WHEN** a client POSTs `{ action: "delete", name: "primary" }` to `/api/agents/config`
- **THEN** the response is `400` with `{ error: "manager agents cannot be deleted from the UI; edit agents.yaml directly to remove" }`
- **AND** `agents.yaml` is byte-identical to before

#### Scenario: Upsert that would create a second manager is rejected

- **GIVEN** `agents.yaml` contains an entry with `roles: [manager]`, name `primary`
- **WHEN** a client POSTs `{ action: "upsert", name: "ghost-mgr", roles: ["manager"], mode: "live-shell", command: "claude", args: [] }`
- **THEN** the response is `400` with `{ error: "only one agent may include 'manager' in roles" }`
- **AND** `agents.yaml` is byte-identical to before

#### Scenario: Upsert on the existing manager (same name) is accepted

- **GIVEN** `agents.yaml` contains an entry with `roles: [manager]`, name `primary`, command `claude`
- **WHEN** a client POSTs `{ action: "upsert", name: "primary", roles: ["manager"], mode: "live-shell", command: "aider", args: [] }`
- **THEN** the response is `200` with `{ ok: true }`
- **AND** the manager entry in `agents.yaml` has `command: aider`

#### Scenario: Delete on a non-manager entry is unaffected

- **GIVEN** `agents.yaml` contains an entry with `roles: [code]`, name `coder`
- **WHEN** a client POSTs `{ action: "delete", name: "coder" }`
- **THEN** the response is `200` with `{ ok: true }`
- **AND** the entry is removed from `agents.yaml`
