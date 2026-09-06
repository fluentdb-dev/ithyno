# antigravity-skill-isolation Specification

## Purpose

Defines how ithyno isolates Antigravity-rendered skill files under `.ithyno/antigravity/` so they do not pollute the `.agent/` root that other AI tools may scan, and how discovery bridge files and a post-init fixup connect the isolated subtree back into Antigravity's discovery mechanism.

## Requirements

### Requirement: Antigravity renderer output is isolated under .ithyno/

The Antigravity skill renderer SHALL emit all workflow and rule files under
`.ithyno/antigravity/` instead of the shared `.agent/` root. This MUST prevent
ithyno-rendered Antigravity files from appearing in the directory tree that other
AI tools scan for their own skills.

#### Scenario: Workflow files land in isolated path
- **GIVEN** the Antigravity renderer processes a skill source with namespace `ithy-opsx` and command `apply`
- **WHEN** render completes
- **THEN** the output file path is `.ithyno/antigravity/workflows/ithy-opsx-apply.md`
- **AND** no file is written to `.agent/workflows/`

#### Scenario: Dispatch rule lands in isolated path
- **GIVEN** the Antigravity renderer processes the `ithy-opsx-dispatch` skill
- **WHEN** render completes
- **THEN** the dispatch execution rule is written to `.ithyno/antigravity/rules/ithy-opsx-dispatch.md`
- **AND** no file is written to `.agent/rules/`

### Requirement: Discovery bridge files connect .agents/ to the isolated root

The skill installer SHALL emit `.agents/skills.json` and `.agents/plugins.json`
when Antigravity is among the selected CLIs, directing Antigravity's discovery
mechanism to the isolated `.ithyno/antigravity/` subtree.

#### Scenario: skills.json created on Antigravity install
- **GIVEN** `installSkills()` is called with `antigravity` in the selected CLIs
- **WHEN** rendering completes
- **THEN** `.agents/skills.json` exists and contains an entry with `"path": ".ithyno/antigravity/skills"`

#### Scenario: plugins.json and plugin.json created on Antigravity install
- **GIVEN** `installSkills()` is called with `antigravity` in the selected CLIs
- **WHEN** rendering completes
- **THEN** `.agents/plugins.json` exists and contains an entry with `"path": ".ithyno/antigravity"`
- **AND** `.ithyno/antigravity/plugin.json` exists with `{"name": "ithyno"}`

#### Scenario: Existing user entries in skills.json are preserved
- **GIVEN** `.agents/skills.json` already contains a user-authored entry `{"path": "custom/skills"}`
- **WHEN** `installSkills()` runs with `antigravity` selected
- **THEN** the resulting `.agents/skills.json` contains both the user's entry and the ithyno entry

### Requirement: Post-init fixup relocates OpenSpec output

After `openspec init --tools antigravity` writes its files to the default
`.agent/` location, the install flow SHALL relocate those files to
`.ithyno/antigravity/` so the inspection paths match the isolated layout.

#### Scenario: OpenSpec skills relocated after init
- **GIVEN** `openspec init --tools antigravity` wrote `.agent/skills/openspec-propose/SKILL.md`
- **WHEN** the post-init fixup runs
- **THEN** `.ithyno/antigravity/skills/openspec-propose/SKILL.md` exists with the same content
- **AND** `.agent/skills/openspec-propose/SKILL.md` no longer exists

#### Scenario: OpenSpec workflows relocated after init
- **GIVEN** `openspec init --tools antigravity` wrote `.agent/workflows/opsx-propose.md`
- **WHEN** the post-init fixup runs
- **THEN** `.ithyno/antigravity/workflows/opsx-propose.md` exists with the same content
- **AND** `.agent/workflows/opsx-propose.md` no longer exists
