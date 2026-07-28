## ADDED Requirements

### Requirement: Phase-lane view derives lanes from agents.yaml roles

The Overview page's Phase view (rendered when `overviewLayout === "phase"`) SHALL derive its lane list dynamically from the current `agents.yaml.agents[].roles` declaration, rather than rendering a fixed 4-lane set.

The lane set SHALL be built in workflow order: `[propose?, code, review?, verify?, done]` where:
- `code` SHALL always be included (Manager can substitute for a missing code-role agent via Task-tool self-dispatch, per the dispatch skill's Manager-fallback contract).
- `done` SHALL always be included (terminal state).
- `propose`, `review`, `verify` SHALL be included only when at least one agent's `roles` array contains that identifier.

The lane labels SHALL be present-continuous English words matching the role: `PROPOSING`, `CODING`, `REVIEWING`, `VERIFYING`, `DONE`.

When `agents.yaml` changes at runtime (server broadcasts `agents-updated` WS event), the lane list SHALL re-derive without requiring a page reload.

#### Scenario: Minimal agents.yaml (only code) renders 2 lanes
- **GIVEN** `agents.yaml` declares one agent with `roles: [code]` (and manager-only agents)
- **WHEN** the user opens the Phase view
- **THEN** exactly 2 lanes render: `CODING` and `DONE`

#### Scenario: Two-role agents.yaml renders 3 lanes
- **GIVEN** `agents.yaml` declares agents with roles `[code, review]` between them
- **WHEN** the user opens the Phase view
- **THEN** exactly 3 lanes render: `CODING`, `REVIEWING`, `DONE`

#### Scenario: Full agents.yaml renders 5 lanes
- **GIVEN** `agents.yaml` declares at least one agent with each of `propose`, `code`, `review`, `verify`
- **WHEN** the user opens the Phase view
- **THEN** 5 lanes render in workflow order: `PROPOSING`, `CODING`, `REVIEWING`, `VERIFYING`, `DONE`

#### Scenario: agents.yaml live update re-derives lanes
- **GIVEN** the Phase view is open with `CODING` + `DONE` visible
- **WHEN** the user (or another client) updates `agents.yaml` to add a `review` role and the server broadcasts `agents-updated`
- **THEN** the Phase view re-renders with `CODING`, `REVIEWING`, `DONE` without a full page reload

### Requirement: Phase-lane bucketization routes changes to next-stage lane

When rendering the Phase view, each change SHALL be routed to the lane representing the **next workflow stage** it awaits, not the last stage it completed. The routing rules are:

- `phase` undefined or unknown → the `propose` lane if present, otherwise the first lane in the derived list.
- `phase === "proposed"` → the `code` lane.
- `phase === "coded"` → the `review` lane if present, otherwise `done`.
- `phase === "reviewed"` → the `verify` lane if present, otherwise `done`.
- `phase === "done"` → the `done` lane.
- `phase === "needs-human"` → route by `priorPhase` under the same rules; if `priorPhase` is also unresolvable, fall through to the first lane.

No change SHALL be dropped from view. When a phase would map to a lane that is not in the current derived list, it SHALL fall through to the next available lane (in most cases `done`).

#### Scenario: coded change with no review role falls through to done
- **GIVEN** `agents.yaml` has roles `[code]` only AND a change has `phase === "coded"`
- **WHEN** the Phase view renders
- **THEN** the change appears in the `DONE` lane (no `REVIEWING` lane exists to receive it)

#### Scenario: reviewed change with verify role appears in verifying
- **GIVEN** `agents.yaml` has roles `[code, review, verify]` AND a change has `phase === "reviewed"`
- **WHEN** the Phase view renders
- **THEN** the change appears in the `VERIFYING` lane

#### Scenario: needs-human resolves via priorPhase
- **GIVEN** a change has `phase === "needs-human"` and `priorPhase === "coded"` AND `review` role is declared
- **WHEN** the Phase view renders
- **THEN** the change appears in the `REVIEWING` lane (next-stage of `coded`)

#### Scenario: no change dropped when its target lane is absent
- **GIVEN** `agents.yaml` has roles `[code]` only AND a change has `phase === "reviewed"`
- **WHEN** the Phase view renders
- **THEN** the change appears in the `DONE` lane
- **AND** no change from the input list is missing from the rendered output
