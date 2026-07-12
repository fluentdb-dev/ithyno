# Delta: dashboard — soften Manager fallback copy

## MODIFIED Requirements

### Requirement: Agents Tab Manager Section

The Agents tab SHALL render a dedicated `Manager` section between
the Runtimes section and the Live section. The section SHALL render
exactly one of three states based on `GET /api/manager/status`:

1. **Declared**: `agentEntry !== null`. The section SHALL render a
   row for the manager showing name, `MANAGER` role badge,
   `resolvedStartup` (typewriter-styled `command args…`), and the
   `initialInput` (if any). The row SHALL have an `Edit` button
   opening the AgentConfigModal in Edit mode. NO `Delete` button.

2. **Not configured**: `agentEntry === null` AND
   `terminalActive === true`. The section SHALL render a muted
   card containing:
   - `Manager (not configured in agents.yaml):
     <resolvedStartup>` — the typewriter command line
   - A short explanation of what's running: `Currently running the
     built-in default startup command.` when
     `fallbackSource === "default"`, or `Currently running the
     command from ITHYNO_TERMINAL_STARTUP.` when `"env"`.
   - A `[Declare in agents.yaml]` button opening the
     AgentConfigModal in Add mode with `role: "manager"`,
     `command`, `args`, and `initialInput` prefilled from the
     resolved values.

3. **Idle**: `agentEntry === null` AND `terminalActive === false`.
   The section SHALL render a muted empty state:
   `No manager declared. Opening a change view launches the
   Terminal panel, which will run the built-in default until you
   declare one.` No button.

The section SHALL be present on the tab regardless of state —
`resolvedStartup: null` is the only case where the section MAY be
suppressed (empty-string env override; raw shell mode).

The Configured (idle) section SHALL filter out `role: manager`
entries so a declared Manager appears in the Manager section only,
not both.

#### Scenario: Declared manager appears in the Manager section
- **GIVEN** `agents.yaml` has a `role: manager` entry
- **WHEN** the Agents tab renders
- **THEN** the Manager section shows the entry with an `Edit` button
- **AND** the Configured (idle) section does NOT list that entry

#### Scenario: Not-configured state shows what's currently running
- **GIVEN** no manager entry AND the Terminal panel is open
- **WHEN** the Agents tab renders
- **THEN** the Manager section shows `Manager (not configured in agents.yaml): claude --continue`
- **AND** an explanation line reads `Currently running the built-in default startup command.`
- **AND** a `[Declare in agents.yaml]` button is visible

#### Scenario: Declare button prefills the modal
- **GIVEN** the Not-configured state is shown
- **WHEN** the user clicks `[Declare in agents.yaml]`
- **THEN** the AgentConfigModal opens in Add mode
- **AND** role is preselected to `manager`
- **AND** command / args / initialInput are prefilled from the resolved values

#### Scenario: Idle state when no manager and no terminal
- **GIVEN** no manager entry AND no Terminal panel is currently open
- **WHEN** the Agents tab renders
- **THEN** the Manager section renders the muted empty state with no CTA
