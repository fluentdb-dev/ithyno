## ADDED Requirements

### Requirement: Copilot smoke testing validates the native skill artifact
The Agent skill smoke harness SHALL validate GitHub Copilot initialization through `.github/skills/ithy-opsx-test-probe/SKILL.md`. Prompt compatibility SHALL be covered independently by renderer tests and SHALL NOT substitute for the native skill path in the smoke preflight.

#### Scenario: Copilot probe preflight finds the native skill
- **GIVEN** a `probe` Agent uses the `copilot` command
- **WHEN** the isolated project is initialized through the normal Copilot renderer
- **THEN** the smoke preflight checks `.github/skills/ithy-opsx-test-probe/SKILL.md`
- **AND** the Agent is launched only after that native skill exists

