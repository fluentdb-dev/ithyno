## MODIFIED Requirements

### Requirement: 2-branch decision on Open Project of a non-openspec folder

When the user opens a folder that does NOT contain an `openspec/` directory, the dashboard SHALL replace the current dead-end "No OpenSpec project found" copy with a decision panel exposing two clear next actions: **Initialize openspec here** and **Open dashboard anyway** (the second action was previously "Browse read-only" and mounted a markdown-tree viewer; it now opens the empty dashboard directly).

#### Scenario: Decision panel renders for non-openspec folder

- **GIVEN** the user opens a folder that has no `openspec/` subdirectory
- **WHEN** the dashboard loads
- **THEN** a decision panel is shown, headed with the folder path
- **AND** it presents two buttons: `Initialize openspec here`, `Open dashboard anyway`

#### Scenario: Initialize action creates openspec and reloads

- **WHEN** the user clicks `Initialize openspec here`
- **THEN** the dashboard invokes `POST /api/init` for the current folder
- **AND** on success it refetches `/api/state`
- **AND** the dashboard transitions to the standard Kanban view for the newly-initialized project

#### Scenario: Open dashboard anyway renders empty Kanban

- **WHEN** the user clicks `Open dashboard anyway`
- **THEN** the dashboard sets a client-side `browseMode = true` flag
- **AND** the app renders its normal chrome (topbar + Routes) as if `state.exists === true`
- **AND** the Overview page (Kanban) renders with zero changes; the standard "no changes" empty-state copy is shown
- **AND** the dedicated `<ReadOnlyBrowse />` markdown-tree component is NOT mounted
- **AND** the dashboard does NOT auto-launch the embedded terminal unless `agents.yaml` is present (guard from `guard-terminal-autolaunch-on-agents-yaml` still applies)

#### Scenario: Openspec-present folder is unaffected

- **WHEN** the user opens a folder that already contains `openspec/`
- **THEN** the decision panel is NOT shown
- **AND** the standard Kanban view loads as before this requirement

#### Scenario: CLAUDE.md hint

- **GIVEN** the picked folder contains `CLAUDE.md` at its root
- **WHEN** the decision panel renders
- **THEN** a short informational line appears beneath the buttons noting that CLAUDE.md was detected and will be picked up as agent-facing context once openspec is initialized
- **AND** when `CLAUDE.md` is absent, no such hint appears

<!--
  Originally we planned to REMOVED the "Browse endpoints for markdown"
  requirement, but the openspec archive validator rejects a bare REMOVED
  section without a valid replacement body. Since the endpoint code
  itself stays in place (as inert), we leave the requirement in the
  main spec for now and rely on ReadOnlyBrowse's file-level UNUSED
  header to signal the inert status. A future cleanup change can do a
  proper propose to remove the requirement AND the code together.
-->

