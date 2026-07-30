## MODIFIED Requirements

### Requirement: Bundled Templates
The system SHALL keep the scaffold templates inside this package under a `templates/` directory so they evolve alongside the code and version with each release.

`templates/` SHALL hold ONLY CLI-neutral fixtures — files that get copied verbatim into every scaffolded project regardless of the Manager CLI the user picked (e.g. `CLAUDE.md` as agent-facing context, `openspec/README.md`, `agents.yaml.tmpl`). CLI-specific skill surface files (`.claude/commands/opsx/…`, `.claude/skills/ithy-opsx-*/`, and any other CLI's equivalent) SHALL NOT live under `templates/` — they are emitted by the per-CLI renderers described in the `cross-cli-skill-installer` capability.

#### Scenario: Templates resolved relative to package root
- **WHEN** the init handler reads its templates
- **THEN** it resolves the path from the package's own location, not from the user's working directory

#### Scenario: Generic CLAUDE.md template
- **WHEN** the CLAUDE.md template is copied
- **THEN** it contains generic placeholders for project-specific commands (no `npm test`-style references that would mislead non-Node projects)

#### Scenario: templates directory holds only CLI-neutral fixtures
- **GIVEN** the packaged `templates/` tree
- **WHEN** the init flow walks it
- **THEN** it finds only files that apply to every Manager CLI (e.g. `CLAUDE.md`, `openspec/README.md`, `agents.yaml.tmpl`, top-level dotfile scaffolds)
- **AND** it finds no `templates/.claude/commands/opsx/`, `templates/.claude/commands/ithy-opsx/`, or `templates/.claude/skills/ithy-opsx-*` subtrees (those are renderer output)
