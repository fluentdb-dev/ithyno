# Delta: dashboard — Agents tab edit UI

## ADDED Requirements

### Requirement: Agents Config Edit Modal

The Agents tab's Configured (idle) section SHALL render an `Edit`
button on every row. Clicking `Edit` SHALL open a modal
populated with the row's current agent configuration. The modal
SHALL expose these fields:

- **name** — kebab-case validated; disabled (read-only) when
  editing an existing agent
- **role** — dropdown: `code`, `review`, `verify`, `manager`,
  `other`
- **shape** — toggle between **legacy** (`command` + `args[]`)
  and **runtime-backed** (`runtime` + `prompt`); the modal SHALL
  hide the fields of the non-active shape
- **runtime** — dropdown populated from the `runtimes` state
  (from `/api/agents/runtimes`), rendered only in
  runtime-backed shape
- **command** and **args** — text inputs, rendered only in legacy
  shape; args entered as one whitespace-separated string
- **prompt** — multi-line textarea
- **specialties** — comma-separated tag input
- **concurrency** — number input, min 1
- **dedicated** — checkbox; unchecked means pool mode

The modal SHALL have a `Save` button and a `Cancel` button.
`Save` SHALL POST to `/api/agents/config` (Phase 5.3 endpoint);
on 404 or any other failure it SHALL surface a toast with the
underlying error. On success, the modal SHALL close and the
Agents tab SHALL refresh its agents state via `loadAgents()`.

#### Scenario: Edit button opens modal prefilled from row
- **GIVEN** a Configured (idle) row for agent `claude` with
  `role: code`, `runtime: claude`, `prompt: /opsx:apply ${change_id}`
- **WHEN** the user clicks `Edit` on that row
- **THEN** the modal opens with `name = "claude"` (disabled),
  `role = "code"`, shape toggled to runtime-backed,
  `runtime = "claude"`, and `prompt = "/opsx:apply ${change_id}"`

#### Scenario: Shape toggle swaps visible fields
- **GIVEN** the modal is open with shape set to runtime-backed
- **WHEN** the user toggles shape to legacy
- **THEN** the runtime dropdown is hidden
- **AND** the command and args inputs are shown

#### Scenario: Save surfaces a toast on 404 (5.3 not yet landed)
- **GIVEN** Phase 5.3 has not landed and `/api/agents/config`
  returns 404
- **WHEN** the user clicks Save
- **THEN** a toast is shown with a hint about the missing
  endpoint
- **AND** the modal does NOT close (the user's edits are
  preserved)

### Requirement: Agents Config Delete Confirmation

Every row in the Configured (idle) section SHALL render a
`Delete` button next to `Edit`. Clicking `Delete` SHALL open a
confirmation dialog naming the agent (e.g., "Delete agent
`claude`? This removes it from agents.yaml."). Confirming SHALL
POST a delete-shaped request to `/api/agents/config`; canceling
SHALL close the dialog with no side effects.

#### Scenario: Delete asks before acting
- **GIVEN** the Configured (idle) section shows agent `reviewer`
- **WHEN** the user clicks `Delete` on that row
- **THEN** a confirmation dialog opens naming `reviewer`
- **AND** no network request is issued until Confirm is clicked

#### Scenario: Cancel keeps the agent
- **GIVEN** the delete confirmation dialog is open for `reviewer`
- **WHEN** the user clicks Cancel
- **THEN** the dialog closes
- **AND** the row for `reviewer` remains in the Configured section

### Requirement: Agents Config Add Button

Below the Configured (idle) section the tab SHALL render a
`+ Add agent` button. Clicking it SHALL open the same modal
described under Agents Config Edit Modal, but with:

- `name` field editable (not disabled) and empty
- all other fields empty or at their default values
- shape defaulting to legacy

Save behavior mirrors the Edit modal.

#### Scenario: Add opens an empty editable modal
- **WHEN** the user clicks `+ Add agent`
- **THEN** the modal opens with `name = ""` (editable), all other
  fields empty or default, shape set to legacy

#### Scenario: Add is hidden when the section is missing
- **GIVEN** the Configured (idle) section is hidden because
  `agents.length === 0` AND `agentConfigError` is present
- **WHEN** the tab renders
- **THEN** the `+ Add agent` button is NOT shown (the error
  banner takes precedence; the user resolves the parse error
  before adding)
