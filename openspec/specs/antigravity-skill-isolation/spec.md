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

### Requirement: Global skills.json connects Antigravity to the isolated root

The skill installer SHALL emit `~/.gemini/config/skills.json` with an absolute
path entry pointing to `<projectRoot>/.ithyno/antigravity/skills` when
Antigravity is among the selected CLIs. This MUST use absolute paths because
Antigravity's global config cannot resolve project-relative paths.

#### Scenario: Global skills.json created on Antigravity install
- **GIVEN** `installSkills()` is called with `antigravity` in the selected CLIs
- **WHEN** rendering completes
- **THEN** `~/.gemini/config/skills.json` exists and contains an entry whose `"path"` is the absolute path to `.ithyno/antigravity/skills`

#### Scenario: Existing user entries in skills.json are preserved
- **GIVEN** `~/.gemini/config/skills.json` already contains a user-authored entry
- **WHEN** `installSkills()` runs with `antigravity` selected
- **THEN** the resulting `skills.json` contains both the user's entry and the ithyno entry

#### Scenario: Stale relative-path entries are removed
- **GIVEN** `~/.gemini/config/skills.json` contains a stale entry with relative path `.ithyno/antigravity/skills`
- **WHEN** `installSkills()` runs with `antigravity` selected
- **THEN** the stale relative entry is removed and replaced with the absolute-path entry

### Requirement: OpenSpec output is NOT relocated

The install flow SHALL NOT relocate OpenSpec-generated files from `.agent/` or
`.agents/`. OpenSpec's install destination MUST remain under its default location
and is outside ithyno's responsibility.

#### Scenario: OpenSpec files remain in place after install
- **GIVEN** `openspec init --tools antigravity` wrote `.agent/workflows/opsx-propose.md`
- **WHEN** `installSkills()` runs
- **THEN** `.agent/workflows/opsx-propose.md` remains at its original location
