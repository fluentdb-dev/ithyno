## ADDED Requirements

### Requirement: Settings page does not offer a Default Manager selector

The Settings page (`web/src/pages/Settings.tsx`) SHALL NOT render a `Default Manager` section or any radio-group for selecting the cross-project default Manager CLI. The Agents tab's Manager section is the sole UI for viewing or editing the current project's Manager entry.

The `defaultManager` store slice and its `localStorage["ithyno.defaultManager"]` persistence layer SHALL remain intact. InitDialog SHALL continue to consult `defaultManager` when preselecting the Manager CLI at Init time (honored only when both installed and Manager-eligible). The `setDefaultManager` setter SHALL remain exported from the store so future implicit-set paths (e.g., auto-remember the CLI picked at the most recent Init) can wire it without a UI addition.

**Rationale**: The Settings picker duplicated the Agents tab's Manager UI with a non-obvious scope difference (cross-project preference vs current-project entry), and the two pickers filtered differently after `fix-manager-startup-per-cli-dispatch` — a user could set `gemini` as default in Settings, then discover Init did not offer it. Removing the Settings UI eliminates the contradiction while preserving preference persistence for existing users.

#### Scenario: Settings page renders without Default Manager section
- **WHEN** the user opens the Settings page
- **THEN** the page renders Prerequisites, Appearance, Execution, Agmsg, and New Project sections
- **AND** no `Default Manager` section or radio group is rendered

#### Scenario: Existing localStorage preference is honored at Init
- **GIVEN** a user has `localStorage["ithyno.defaultManager"] = "claude"` from before this change
- **WHEN** the Init dialog opens
- **THEN** the picker preselects `claude` (assuming it is installed and Manager-eligible)
- **AND** no user action in Settings is required (the section no longer exists)

#### Scenario: Fresh user with no preference gets sensible preselect
- **GIVEN** a user with no `localStorage["ithyno.defaultManager"]` value AND `claude` + `codex` installed
- **WHEN** the Init dialog opens
- **THEN** the picker preselects `claude` (first Manager-eligible installed by priority)
- **AND** the Settings page does NOT prompt the user to configure a default

#### Scenario: setDefaultManager stays available for future implicit wiring
- **GIVEN** the `setDefaultManager` action exported from the store
- **WHEN** code (this change or a future one) invokes it programmatically
- **THEN** the store slice updates and the value persists to `localStorage["ithyno.defaultManager"]`
- **AND** the next Init dialog opening honors the new preference

#### Scenario: Agents tab Manager section is unaffected
- **GIVEN** a project with a manager entry in `agents.yaml`
- **WHEN** the user opens the Agents tab
- **THEN** the Manager section renders the current entry, resolved startup line, and Edit button as before
- **AND** editing writes to `agents.yaml` (per-project) with no dependency on `defaultManager` state
