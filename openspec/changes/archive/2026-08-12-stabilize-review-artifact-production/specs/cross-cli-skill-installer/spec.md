## ADDED Requirements

### Requirement: Codex Review and Verify Worker Entrypoints

The installer SHALL materialize discoverable Codex Skills when ithyno review and verify Prompts are installed. The Skills are named `ithy-opsx-review` and
`ithy-opsx-verify`. Each Skill SHALL direct Codex to the corresponding generated
Prompt and SHALL preserve an absolute artifact path supplied by the dispatcher.

#### Scenario: Codex review worker is installed
- **GIVEN** `.codex/prompts/ithy-opsx-review.md` is generated
- **WHEN** ithyno skills are installed for Codex
- **THEN** `.codex/skills/ithy-opsx-review/SKILL.md` is generated
- **AND** invoking `ithy-opsx-review <change-id>` resolves an exact Skill
- **AND** the Skill executes the review Prompt for that change

#### Scenario: Codex verify worker is installed
- **GIVEN** `.codex/prompts/ithy-opsx-verify.md` is generated
- **WHEN** ithyno skills are installed for Codex
- **THEN** `.codex/skills/ithy-opsx-verify/SKILL.md` is generated
- **AND** the Skill executes the verify Prompt for the supplied change

#### Scenario: Prompt is missing
- **GIVEN** a generated worker Skill is present but its referenced Prompt is missing
- **WHEN** Codex invokes the Skill
- **THEN** it stops with an actionable missing-Prompt message
- **AND** it does not invent a review or verify procedure
