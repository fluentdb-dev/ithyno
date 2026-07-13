# Delta: dashboard — Modal command picker + args presets

## ADDED Requirements

### Requirement: System Executable Picker Endpoint

The server SHALL expose `POST /api/system/pick-executable` that
opens a native OS file-selection dialog on the server's host machine
and returns the selected path. The endpoint SHALL apply `isLocal`
gating and return `403` for non-loopback callers.

The implementation SHALL dispatch by `process.platform`:

- `darwin` — uses `osascript -e 'choose file ...'`
- `linux` — uses `zenity --file-selection`, and when `zenity` is
  not installed SHALL return `{ path: null, error: "native picker
  unavailable on this host" }` with HTTP 200
- `win32` — uses PowerShell's
  `System.Windows.Forms.OpenFileDialog`

When the user cancels the dialog, the endpoint SHALL return
`{ path: null }` with HTTP 200 (not an error). When the underlying
helper command errors, the response SHALL be HTTP 500 with a
descriptive `error` string.

#### Scenario: Picker returns a path on success
- **GIVEN** a local user calls `POST /api/system/pick-executable`
- **AND** they pick `/opt/homebrew/bin/claude` in the dialog
- **THEN** the response is HTTP 200 with `{ path: "/opt/homebrew/bin/claude" }`

#### Scenario: User cancels the dialog
- **GIVEN** a local user calls the endpoint
- **WHEN** the user closes the dialog without picking
- **THEN** the response is HTTP 200 with `{ path: null }`

#### Scenario: No native helper installed
- **GIVEN** the host is Linux without `zenity` on PATH
- **WHEN** the endpoint is called
- **THEN** the response is HTTP 200 with `{ path: null, error: "native picker unavailable on this host" }`

#### Scenario: Non-loopback caller denied
- **WHEN** a non-loopback client POSTs the endpoint
- **THEN** the response is `403` with `{ error: "local only" }`

### Requirement: Agents Config Modal Command Picker

The AgentConfigModal SHALL render an inline `[Browse…]` button
directly to the right of the `command` text input. Clicking the
button SHALL call `POST /api/system/pick-executable`. When the
response returns a non-null `path`, the modal SHALL replace the
`command` field's value with that path. When the response returns
`{ path: null }` (cancel or unavailable), the field's value SHALL
be preserved as-is. When the response includes a non-empty `error`
string, the modal SHALL surface it as an inline hint below the
command input; other errors (network failure, non-200) SHALL
surface a generic toast.

#### Scenario: Browse fills the command field
- **GIVEN** the modal is open with `command = ""`
- **WHEN** the user clicks `[Browse…]` and picks `/usr/local/bin/aider`
- **THEN** the `command` field's value becomes `/usr/local/bin/aider`

#### Scenario: Cancel leaves the field alone
- **GIVEN** the modal is open with `command = "claude"`
- **WHEN** the user clicks `[Browse…]` and cancels the dialog
- **THEN** the `command` field's value remains `"claude"`

#### Scenario: Missing native picker shows inline hint
- **GIVEN** the modal is open on a Linux host without `zenity`
- **WHEN** the user clicks `[Browse…]`
- **THEN** the field is unchanged
- **AND** an inline hint reading "Native picker unavailable — type the path manually" appears below the input

### Requirement: Agents Config Modal Args Presets

Presets in this Modal SHALL apply ONLY to the Legacy shape
(`command + args + initialInput`). The Runtime-backed shape
(`runtime + prompt`) does not need presets: the `runtimes:` block
in `agents.yaml` already carries the `command`, `baseArgs`,
`promptStyle`, and `promptFlag` for each declared runtime, so an
agent picking a runtime automatically inherits those values via
`registry.resolve()`.

The AgentConfigModal SHALL maintain a client-side preset table
keyed by `(commandBasename, role)`. Supported commandBasenames are
`claude`, `aider`, `codex`, `gh`, and `agy`. Each preset SHALL be
of shape `{ args: string[]; initialInput?: string }`.

The preset button SHALL render **only while the Legacy shape is
active in the Modal**. When the shape is Runtime-backed, no preset
button SHALL appear (regardless of command / role); the runtime
dropdown is the equivalent affordance.

When the shape is Legacy AND the current `command` and `role`
values match a preset (via `path.basename(command)` lookup — full
paths like `/opt/homebrew/bin/claude` and bare names like `claude`
both match), the modal SHALL render an inline `[Use preset for
<cmd> / <role>]` button below the args field. Clicking the button
SHALL replace the `args` and `initialInput` fields with the
preset values. Displaying the button SHALL NOT auto-apply — the
user's existing edits stay untouched until an explicit click.

Preset entries whose flags are unknown at ship time SHALL carry a
visible `TODO` marker in the button label (e.g., `[Use preset for
agy / code — TODO fill flags]`) so users understand the preset is
a stub.

#### Scenario: Preset button shows for known command + role
- **GIVEN** the modal has `command = "claude"` and `role = "code"`
- **WHEN** the modal renders
- **THEN** a `[Use preset for claude / code]` button appears below the args field

#### Scenario: Preset button hidden for unknown command
- **GIVEN** the modal has `command = "myscript"` and `role = "code"`
- **WHEN** the modal renders
- **THEN** no preset button is visible

#### Scenario: Basename lookup handles full paths
- **GIVEN** the modal has `command = "/opt/homebrew/bin/claude"` and `role = "review"`
- **WHEN** the modal renders
- **THEN** the preset button reads `[Use preset for claude / review]`

#### Scenario: Clicking replaces args and initialInput
- **GIVEN** the preset for `(claude, code)` is `{ args: ["--dangerously-skip-permissions"], initialInput: "/opsx:apply ${change_id}" }`
- **AND** the user has typed `--verbose` into the args field
- **WHEN** the user clicks the preset button
- **THEN** the args field's value becomes `--dangerously-skip-permissions`
- **AND** the initialInput field's value becomes `/opsx:apply ${change_id}`

#### Scenario: Preset shapes respect the Legacy-mode -p invariant
- **GIVEN** a Legacy-shape preset for a CLI that accepts prompts via `-p <value>` (e.g., `claude`)
- **WHEN** the preset table is queried
- **THEN** its `args` value MUST NOT contain `-p`
- **AND** the prompt value MUST be delivered via `initialInput`
- **AND** the runner's auto-`-p`-unshift path is what places the flag into the spawn arguments at runtime
- **NOTE**: Runtime-backed shape does not go through this preset table — its `-p` is declared once in the `runtimes:` block via `promptFlag`.

#### Scenario: No preset button in Runtime-backed shape
- **GIVEN** the modal has shape set to Runtime-backed with runtime=`claude` and role=`code`
- **WHEN** the modal renders
- **THEN** no `[Use preset for ...]` button appears
- **AND** the runtime dropdown is the sole affordance for picking a CLI's canonical flags

#### Scenario: TODO stub preset labels itself
- **GIVEN** the preset for `(agy, code)` is a stub with unknown flags
- **WHEN** the modal renders that combination
- **THEN** the button label includes a `TODO fill flags` suffix
