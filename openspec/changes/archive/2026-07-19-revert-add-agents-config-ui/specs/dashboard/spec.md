# Delta: dashboard — retire add-agents-config-ui, spec the two gaps

## ADDED Requirements

### Requirement: Agents Config Delete Confirmation And Add Button

The Agents tab SHALL surface two entry points that are not
covered by `Agents Config Modal Layout Ergonomics`:

- **Delete confirmation dialog** — clicking `[Delete]` on a
  worker agent row (Manager rows have no Delete button per
  `Manager Agent Listed With Other Agents`) MUST NOT immediately
  fire the destructive `POST /api/agents/config { action:
  "delete" }` request. Instead, the tab SHALL render an inline
  confirmation dialog reading `Delete agent <name>?`. Only when
  the user clicks the dialog's Confirm button SHALL the delete
  request be sent. Cancel SHALL dismiss the dialog and keep the
  row intact.
- **`[+ Add agent]` button** — the Agents tab SHALL render a
  `[+ Add agent]` button below the Configured (idle) section
  when the agents registry is loaded. Clicking the button SHALL
  open the AgentConfigModal in Add mode (per
  `Agents Config Modal Layout Ergonomics`'s Add-mode behavior).
  The button SHALL be hidden when the registry could not be
  loaded (`agentConfigError` is set), so the user doesn't
  attempt to add against a broken config file.

Both entry points are Modal-adjacent scaffolding — the Modal's
internal shape is specified by `Agents Config Modal Layout
Ergonomics`. This requirement covers only the row-level and
section-level UI that lives outside the Modal itself.

#### Scenario: Delete on a worker row surfaces confirmation

- **GIVEN** the Agents tab shows a worker agent row named `claude-code`
- **WHEN** the user clicks the row's `[Delete]` button
- **THEN** an inline confirmation dialog appears reading `Delete agent claude-code?`
- **AND** no `POST /api/agents/config` request has fired yet

#### Scenario: Confirm sends the delete request

- **GIVEN** the Delete confirmation dialog is open for `claude-code`
- **WHEN** the user clicks the dialog's Confirm button
- **THEN** the client posts `{ action: "delete", name: "claude-code" }` to `/api/agents/config`
- **AND** on success the row disappears from the Configured list

#### Scenario: Cancel dismisses the dialog without firing

- **GIVEN** the Delete confirmation dialog is open for `claude-code`
- **WHEN** the user clicks the dialog's Cancel button
- **THEN** the dialog closes
- **AND** the row remains in the Configured list
- **AND** no `POST /api/agents/config` request is fired

#### Scenario: `[+ Add agent]` button opens the modal

- **GIVEN** the agents registry is loaded successfully
- **WHEN** the Agents tab renders
- **THEN** a `[+ Add agent]` button appears below the Configured (idle) section
- **AND** clicking it opens the AgentConfigModal in Add mode

#### Scenario: `[+ Add agent]` button hidden on registry error

- **GIVEN** the agents registry failed to load (`agentConfigError` is set on the store)
- **WHEN** the Agents tab renders
- **THEN** the `[+ Add agent]` button is NOT rendered
- **AND** the error banner explains the config problem instead
