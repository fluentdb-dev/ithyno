## ADDED Requirements

### Requirement: Project License Posture
The repository SHALL declare its license posture explicitly. The
application code (everything outside the MIT-licensed subtrees
listed below) is licensed under **GPL-3.0-or-later**. Files
intended for verbatim injection into user projects — the entire
`templates/` tree and the canonical `.claude/skills/openspec-flow/`
directory it mirrors — are licensed under the **MIT License**, so
that projects initialized via `ithyno init` do not inherit
copyleft obligations from a boilerplate workflow file.

#### Scenario: Root LICENSE names the primary license
- **WHEN** a reader opens `/LICENSE`
- **THEN** the file contains the canonical GPL-3.0 text
- **AND** a "Subtree license exceptions" note points at `templates/LICENSE` and `.claude/skills/openspec-flow/LICENSE`

#### Scenario: Subtree LICENSE files carry MIT text
- **GIVEN** the reader inspects `/templates/LICENSE` or `/.claude/skills/openspec-flow/LICENSE`
- **THEN** the file contains the standard MIT License text with a concrete copyright line (year + owner)

#### Scenario: Templated files declare their license
- **GIVEN** any file under `templates/**` or `.claude/skills/openspec-flow/**` that gets copied into user projects
- **THEN** for plain markdown, its first line is `<!-- SPDX-License-Identifier: MIT -->`
- **AND** for YAML, its first line is `# SPDX-License-Identifier: MIT`
- **AND** for SKILL.md files (frontmatter-driven), the frontmatter block includes a `license: MIT` field (SPDX comments before `---` collide with the Claude Code skill loader; the frontmatter field is the equivalent declaration)
- **AND** the license declaration survives file duplication (i.e. a user lifting a single file still sees it)

#### Scenario: package.json fields agree with the subtree they represent
- **WHEN** the reader inspects `/package.json`, `/electron/package.json`, or `/vscode-extension/host/package.json`
- **THEN** each declares `"license": "GPL-3.0-or-later"`
- **AND** no package.json under `templates/**` claims a license (nothing there ships as an npm package)

#### Scenario: README explains the split
- **WHEN** the reader opens `/README.md`
- **THEN** a "License" section states the two-tier license split
- **AND** points at `LICENSE`, `templates/LICENSE`, and `.claude/skills/openspec-flow/LICENSE` for the license texts

#### Scenario: Dependency licenses stay GPL-3.0-compatible
- **GIVEN** the lockfile at the time of any release
- **WHEN** an auditor scans runtime dependency licenses
- **THEN** every dependency is one of: MIT / ISC / BSD-2-Clause / BSD-3-Clause / Apache-2.0 / BlueOak-1.0.0 / Python-2.0 / Artistic-2.0 / WTFPL / CC0 / 0BSD / MPL-2.0
- **AND** no dependency is under AGPL, SSPL, BUSL, or a proprietary / unstated license
