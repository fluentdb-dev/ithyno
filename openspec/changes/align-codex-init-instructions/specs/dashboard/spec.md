## MODIFIED Requirements

### Requirement: Manager picker filters to Manager-eligible CLIs with unverified label

The Init flow's Manager-CLI picker (`web/src/components/InitDialog.tsx`) SHALL offer only Manager-eligible CLIs. The eligibility set is the union of two constants: `MANAGER_VERIFIED` (currently `["claude", "agy"]`) and `MANAGER_UNVERIFIED` (currently `["codex", "opencode"]`).

Non-eligible CLIs (`copilot`, `gemini`, `cursor`, `antigravity`) SHALL be hidden from the Manager picker. They MAY still appear in the Prerequisites list and MAY still be spawned as agmsg workers — the filter applies only to the Manager role.

Entries in `MANAGER_UNVERIFIED` SHALL render with a trailing `(unverified)` label. A CLI SHALL be moved from `MANAGER_UNVERIFIED` to `MANAGER_VERIFIED` (removing the label) once both: (a) it has a startup strategy registered in `MANAGER_STARTUP_STRATEGIES`, AND (b) its dispatch skill resolves in that CLI's command surface.

`readyForManager` SHALL be derived from `managerChoices.length > 0` (installed ∩ candidates), not from the raw doctor report's field — a project with only non-eligible CLIs installed correctly reports "no Manager-eligible CLI" and blocks Init.

The preselect logic SHALL respect the candidate filter: the stored `defaultManager` is preselected only if it is both installed AND Manager-eligible; otherwise the picker preselects the first eligible-installed CLI by `CLI_PRIORITY`.

#### Scenario: picker shows only Manager candidates
- **GIVEN** doctor reports `claude`, `copilot`, `gemini` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker shows exactly `claude` (the only eligible CLI in the installed set)
- **AND** `copilot` and `gemini` appear in the Prerequisites list but NOT in the Manager picker

#### Scenario: unverified CLIs get the unverified label
- **GIVEN** doctor reports `claude`, `codex`, `agy` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker shows all three
- **AND** the `codex` entry renders with a `(unverified)` suffix
- **AND** the `claude` and `agy` entries render without the suffix

#### Scenario: no eligible CLI installed blocks Init
- **GIVEN** doctor reports only `copilot` and `gemini` as installed
- **WHEN** the Init dialog renders
- **THEN** the Manager picker section is not shown
- **AND** `readyForManager` is false
- **AND** the "No agent CLI installed" (or equivalent) blocking message appears

#### Scenario: defaultManager honored only if eligible
- **GIVEN** the store's `defaultManager` is `gemini` (which is not Manager-eligible) AND doctor reports `claude` and `gemini` installed
- **WHEN** the Init dialog renders
- **THEN** the picker preselects `claude` (first eligible-installed by priority)
- **AND** does NOT preselect `gemini`

#### Scenario: agmsg worker path unaffected
- **GIVEN** the Manager picker filter has hidden `copilot` from the Init dialog
- **WHEN** the dispatch flow spawns a Copilot worker via agmsg (an unrelated concern)
- **THEN** the worker still spawns successfully
- **AND** the picker filter has NO effect on worker CLI selection or spawn
