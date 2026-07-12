# Delta: dashboard — Agents tab Manager section

## ADDED Requirements

### Requirement: Manager Status Endpoint

The server SHALL expose `GET /api/manager/status` returning the
current resolved Manager configuration and whether the embedded
Terminal panel is currently open. The response body SHALL be JSON
of shape:

```json
{
  "agentEntry": AgentPublic | null,
  "resolvedStartup": string | null,
  "initialInput": string | null,
  "fallbackSource": "declared" | "env" | "default",
  "terminalActive": boolean
}
```

- `agentEntry`: the first `role: manager` entry from the loaded
  registry, or `null` when none is declared.
- `resolvedStartup`: the string that would be typed into a fresh
  PTY session, derived from `ptyStartup()`'s priority chain
  (declared manager → `ITHYNO_TERMINAL_STARTUP` env → hardcoded
  `claude --continue`). `null` only when the env override is
  explicitly set to empty string (raw shell mode).
- `initialInput`: the auto-inject line resolved by the same chain,
  or `null` when none applies.
- `fallbackSource`: which stage of the chain provided the values —
  `"declared"` when `agentEntry !== null`, `"env"` when
  `ITHYNO_TERMINAL_STARTUP` is set, `"default"` otherwise.
- `terminalActive`: `true` when at least one PTY session is
  currently open (from the existing `activeTerminalCount()`).

The endpoint SHALL apply the same `isLocal` gate as the other
agents.yaml-related endpoints and return `403` for non-loopback
callers.

#### Scenario: declared entry surfaces from registry
- **GIVEN** `agents.yaml` has `name: primary, role: manager, command: claude, args: [--continue]`
- **WHEN** a client GETs `/api/manager/status`
- **THEN** the response contains `agentEntry` with `name: "primary"`
- **AND** `resolvedStartup` is `"claude --continue"`
- **AND** `fallbackSource` is `"declared"`

#### Scenario: env variable fills the fallback
- **GIVEN** no manager entry in agents.yaml AND `ITHYNO_TERMINAL_STARTUP=aider` is set
- **WHEN** a client GETs the endpoint
- **THEN** `agentEntry` is `null`
- **AND** `resolvedStartup` is `"aider"`
- **AND** `fallbackSource` is `"env"`

#### Scenario: hardcoded default fills the fallback
- **GIVEN** no manager entry in agents.yaml AND `ITHYNO_TERMINAL_STARTUP` is unset
- **WHEN** a client GETs the endpoint
- **THEN** `resolvedStartup` is `"claude --continue"`
- **AND** `fallbackSource` is `"default"`

#### Scenario: terminalActive reflects live PTY count
- **GIVEN** at least one embedded terminal is open
- **WHEN** a client GETs the endpoint
- **THEN** `terminalActive` is `true`

#### Scenario: non-local caller denied
- **WHEN** a non-loopback client GETs the endpoint
- **THEN** the response is `403` with `{ error: "local only" }`

### Requirement: Agents Tab Manager Section

The Agents tab SHALL render a dedicated `Manager` section between
the Runtimes section and the Live section. The section SHALL render
exactly one of three states based on `GET /api/manager/status`:

1. **Declared**: `agentEntry !== null`. The section SHALL render a
   row for the manager showing name, `MANAGER` role badge,
   `resolvedStartup` (typewriter-styled `command args…`), and the
   `initialInput` (if any). The row SHALL have an `Edit` button
   opening the AgentConfigModal in Edit mode. NO `Delete` button.

2. **Fallback**: `agentEntry === null` AND
   `terminalActive === true`. The section SHALL render a muted
   card containing:
   - `Manager (fallback): <resolvedStartup>` — the typewriter
     command line
   - `Source:` label — `hardcoded default` when
     `fallbackSource === "default"`, or `environment variable
     ITHYNO_TERMINAL_STARTUP` when `"env"`
   - A `[Declare in agents.yaml]` button opening the
     AgentConfigModal in Add mode with `role: "manager"`,
     `command`, `args`, and `initialInput` prefilled from the
     resolved values.

3. **Idle**: `agentEntry === null` AND `terminalActive === false`.
   The section SHALL render a muted empty state:
   `No manager declared. Opening a change view launches the
   Terminal panel, which will run the hardcoded default until you
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

#### Scenario: Fallback state shows the actual running command
- **GIVEN** no manager entry AND the Terminal panel is open (Home page reached)
- **WHEN** the Agents tab renders
- **THEN** the Manager section shows `Manager (fallback): claude --continue`
- **AND** the Source line names the hardcoded default
- **AND** a `[Declare in agents.yaml]` button is visible

#### Scenario: Declare button prefills the modal
- **GIVEN** the Fallback state is shown
- **WHEN** the user clicks `[Declare in agents.yaml]`
- **THEN** the AgentConfigModal opens in Add mode
- **AND** role is preselected to `manager`
- **AND** command / args / initialInput are prefilled from the resolved values

#### Scenario: Idle state when no manager and no terminal
- **GIVEN** no manager entry AND no Terminal panel is currently open
- **WHEN** the Agents tab renders
- **THEN** the Manager section renders the muted empty state with no CTA
