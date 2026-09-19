## MODIFIED Requirements

### Requirement: Antigravity renderer emits CLI-native surface files

The Antigravity renderer SHALL emit workflow files to `.ithyno/antigravity/workflows/`
and rule files to `.ithyno/antigravity/rules/` instead of `.agent/workflows/` and
`.agent/rules/`. The file naming convention (`<namespace>-<command>.md`) is unchanged.

#### Scenario: Antigravity workflow output path
- **GIVEN** the Antigravity renderer processes a skill with namespace `ithy-opsx` and command `dispatch`
- **WHEN** render completes
- **THEN** the output file is `.ithyno/antigravity/workflows/ithy-opsx-dispatch.md`

### Requirement: Inspection paths for Antigravity match isolated layout

The `CLI_LAYOUTS` and `CLI_ADAPTERS` entries for `agy` SHALL reference paths under
`.ithyno/antigravity/` so that `inspectOpenspecPaths()` and `inspectIthynoState()`
correctly detect installed skills at their new locations.

#### Scenario: OpenSpec inspection finds isolated skills
- **GIVEN** `.ithyno/antigravity/skills/openspec-propose/SKILL.md` and `.ithyno/antigravity/skills/openspec-apply-change/SKILL.md` exist
- **WHEN** `inspectOpenspecPaths(projectRoot, "agy")` runs
- **THEN** the result status is `"installed"`
