## ADDED Requirements

### Requirement: Init endpoint scaffolds agents.yaml with a Manager choice

`POST /api/init` SHALL, in addition to invoking `openspec init`, write `agents.yaml` at the target project root with the user-chosen Manager CLI. The endpoint SHALL consult the doctor check first and reject cleanly when the prerequisite is missing.

#### Scenario: Doctor gate — no agent CLI installed

- **GIVEN** the doctor reports `readyForManager: false` (no agent CLI installed)
- **WHEN** a client posts `POST /api/init`
- **THEN** the endpoint returns 409 with a message pointing at "ithyno doctor" and Settings > Prerequisites
- **AND** no scaffolding occurs

#### Scenario: Manager pick — invalid choice

- **GIVEN** the request body includes `{ manager: { command: "codex" } }` but doctor reports codex `installed: false`
- **WHEN** the client posts `POST /api/init`
- **THEN** the response is 400 with `{ error, installed: [...] }` listing the installed agent CLIs
- **AND** no scaffolding occurs

#### Scenario: Manager pick — default fallback

- **GIVEN** the request body omits `manager`
- **AND** the doctor reports claude and codex both installed
- **WHEN** the client posts `POST /api/init`
- **THEN** the server picks the priority-order first-installed CLI (claude before codex before agy before others) as the Manager

#### Scenario: Successful scaffolding writes agents.yaml

- **GIVEN** the doctor gate passes and Manager is picked as `claude`
- **WHEN** the client posts `POST /api/init { dir: "/path/to/fresh" }`
- **THEN** `openspec init` runs at `/path/to/fresh`
- **AND** `/path/to/fresh/agents.yaml` is created from the templated `templates/agents.yaml.tmpl` with `{{MANAGER_COMMAND}}` → `claude`
- **AND** the response is 200 with `{ managerCommand: "claude" }` alongside the existing fields

#### Scenario: agents.yaml scaffolding failure rolls back

- **GIVEN** `openspec init` succeeded but writing `agents.yaml` fails (e.g., disk full, permission denied)
- **WHEN** the Init endpoint runs
- **THEN** the server removes the openspec/ directory it just created and returns 500 with the write error
- **AND** the target directory is left in its pre-Init state

### Requirement: Init dialog shows Prerequisites and Manager picker

The dashboard's Init entry points (NoProjectDecisionPanel + OnboardingProject) SHALL render a shared `<InitDialog />` component that fetches `/api/doctor`, displays a compact Prerequisites summary, and (when ready) presents a Manager type picker limited to installed CLIs.

#### Scenario: Prerequisites block gates the Init button

- **GIVEN** the user opens the Init dialog
- **WHEN** the doctor reports `readyForManager: false`
- **THEN** the Init button is disabled
- **AND** the dialog shows a link "Settings > Prerequisites" that navigates the user to the doctor UI

#### Scenario: Manager picker defaults to the user's saved preference

- **GIVEN** the user's `defaultManager` in Settings is `codex`
- **AND** the doctor reports both claude and codex installed
- **WHEN** the Init dialog opens
- **THEN** the Manager picker is preselected on codex

#### Scenario: Manager picker only lists installed CLIs

- **GIVEN** the doctor reports claude installed and codex missing
- **WHEN** the Init dialog opens
- **THEN** the Manager picker only offers claude (not codex, not agy, etc.)

### Requirement: Default Manager preference (Settings)

The Settings page SHALL expose a "Default Manager" radio group listing installed agent CLIs. The chosen CLI SHALL be persisted (localStorage `ithyno.defaultManager`) and used as the default in the Init dialog.

#### Scenario: Default Manager persistence

- **WHEN** the user picks a Manager CLI in Settings
- **THEN** the choice is written to `localStorage["ithyno.defaultManager"]`
- **AND** the store's `defaultManager` field updates
- **AND** a subsequent Init dialog opens with this CLI preselected

#### Scenario: Default Manager falls back to priority order

- **GIVEN** localStorage has no `ithyno.defaultManager` value
- **AND** claude and codex are installed
- **WHEN** the store's `defaultManager` is read
- **THEN** it resolves to `claude` (priority: claude > codex > agy > copilot > gemini > opencode > cursor)
