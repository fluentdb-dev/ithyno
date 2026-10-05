## ADDED Requirements

### Requirement: GitHub Copilot receives native skills and explicit prompts
For every portable ithyno skill whose manifest supports `copilot`, the Copilot renderer SHALL generate both a native `.github/skills/<skill-id>/SKILL.md` file and a `.github/prompts/<namespace>-<command>.prompt.md` file. Both files SHALL be derived from the same universal source, translate all capability tokens, and carry generated-file provenance.

#### Scenario: Copilot installation emits both surfaces
- **WHEN** ithyno skills are installed for GitHub Copilot
- **THEN** each supported portable skill is written under `.github/skills/<skill-id>/SKILL.md`
- **AND** its explicit command prompt is written under `.github/prompts/<namespace>-<command>.prompt.md`
- **AND** neither file contains unresolved capability or namespace placeholders

#### Scenario: Copilot reinstallation is current only when both ithyno outputs match
- **GIVEN** a Copilot project has current generated prompts but is missing the corresponding native ithyno skills
- **WHEN** ithyno skill state is inspected
- **THEN** the component is reported as `partial`
- **AND** reinstalling writes the missing native skills without removing the prompts

### Requirement: GitHub Copilot OpenSpec inspection accepts native and command layouts
The OpenSpec component inspector SHALL recognize both OpenSpec native skills under `.github/skills` and OpenSpec command prompts under `.github/prompts` as supported GitHub Copilot layouts. A complete native-skill layout or a complete command-prompt layout SHALL be sufficient for `installed`; incomplete layouts with no complete alternative SHALL be `partial`.

#### Scenario: Native OpenSpec Copilot skills are installed
- **GIVEN** `.github/skills/openspec-propose/SKILL.md` and `.github/skills/openspec-apply-change/SKILL.md` exist
- **WHEN** GitHub Copilot OpenSpec state is inspected
- **THEN** the component status is `installed`

#### Scenario: Prompt-only OpenSpec Copilot delivery remains supported
- **GIVEN** `.github/prompts/opsx-propose.prompt.md` and `.github/prompts/opsx-apply.prompt.md` exist
- **AND** no native OpenSpec skill files exist
- **WHEN** GitHub Copilot OpenSpec state is inspected
- **THEN** the component status is `installed`

#### Scenario: Incomplete Copilot OpenSpec layout is partial
- **GIVEN** only one required native skill or one required command prompt exists
- **WHEN** GitHub Copilot OpenSpec state is inspected
- **THEN** the component status is `partial`
- **AND** diagnostics list the expected native and prompt paths

