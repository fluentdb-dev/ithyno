## MODIFIED Requirements

### Requirement: Workflow Standard Order and Skill Names
ithyno's spec-driven workflow SHALL prescribe three commit types
between the propose and archive boundaries: `propose:`, `impl:`,
and `archive:`. The project-local workflow skill (previously named
`openspec-flow`) SHALL be renamed to `ithy-flow` to reflect its
ownership — the `openspec-*` prefix is reserved for upstream
OpenSpec-installed skills.

#### Scenario: Three commit types define the workflow
- **GIVEN** a fresh spec-level change `X`
- **WHEN** the workflow runs to completion on the main tree
- **THEN** the git history for `X` includes three commits: `propose: X` (proposal + spec delta), `impl: X` (code implementation), and `archive: X` (file moves + outcome + spec applies)
- **AND** each commit is independent — reverting the archive does not touch the impl, reverting the impl does not touch the proposal

#### Scenario: Multi-change impl commits
- **GIVEN** two in-flight changes `A` and `B` whose implementations touch the same file
- **WHEN** the developer lands both changes' code in the same session
- **THEN** the impl commit MAY carry a compound subject `impl: A + B` with both change ids listed in the body
- **AND** the corresponding archive commits later remain per-change (`archive: A` and `archive: B` as separate commits)

#### Scenario: Renamed skill path
- **THEN** `.claude/skills/ithy-flow/SKILL.md` exists (dogfooding copy)
- **AND** `templates/.claude/skills/ithy-flow/SKILL.md` exists (installed by `ithyno init` into target projects)
- **AND** the skill's `name:` frontmatter reads `ithy-flow`
- **AND** the previous `openspec-flow` paths no longer exist in either the dogfooding tree or the templates

#### Scenario: CLAUDE.md documents the flow
- **THEN** the root `CLAUDE.md` and `templates/CLAUDE.md` both document the three-commit-type workflow in the Standard order section
- **AND** describe the multi-change impl commit convention
- **AND** reference the renamed `ithy-flow` skill instead of `openspec-flow`

#### Scenario: Upstream skills are untouched
- **THEN** the upstream OpenSpec skills (`openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-explore`, `openspec-sync-specs`) retain their original names and locations
- **AND** the `/opsx:*` slash commands are unchanged
- **AND** the `/ithy-opsx:*` slash commands (`apply`, `archive`, `merge`) are unchanged, though their SKILL bodies gain a one-paragraph note about the `impl:` commit boundary
