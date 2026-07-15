# Delta: dashboard — revert Manager UI special-casing

## ADDED Requirements

### Requirement: Manager Agent Listed With Other Agents

The Agents tab SHALL treat an agent with `roles: [manager]` as a
regular Configured row (same rendering as workers). The tab SHALL NOT
render a dedicated Manager section, and the server SHALL NOT expose
`GET /api/manager-status`.

The Terminal panel's PTY-startup routing (per
`add-manager-agent-config`) SHALL remain — the Manager agent
declaration in `agents.yaml` still drives what Terminal auto-launches
— only the visual special-casing on the Agents tab is removed.

#### Scenario: Manager appears in the Configured list
- **GIVEN** `agents.yaml` declares an agent with `roles: [manager]` (e.g., `pptr`)
- **WHEN** the user opens the Agents tab
- **THEN** the Manager agent renders as a row in the Configured (idle) section, indistinguishable from worker agents apart from its `mode: live-shell` badge and `manager` role badge

#### Scenario: `/api/manager-status` returns 404
- **WHEN** a client GETs `/api/manager-status`
- **THEN** the server responds 404 (route is not registered)
