# build-system Specification

## Purpose
TBD - created by archiving change add-dev-test-script. Update Purpose after archive.
## Requirements
### Requirement: Test-Run Script Preserves Agent Processes
The project SHALL provide an npm script `dev:test` that starts the
Fastify server without `tsx --watch` while keeping Vite's web-side HMR,
so long-running child processes spawned by the agent runner (worktree
agents, embedded PTY sessions) are not killed by inadvertent server-file
saves during UI or dogfood testing.

#### Scenario: Script exists
- **WHEN** the developer runs `npm run dev:test`
- **THEN** the server starts via `tsx server/index.ts` (no `--watch` flag) and the Vite web dev server (`npm:dev:web`) starts in parallel

#### Scenario: Server survives UI edits
- **WHEN** the developer is running `dev:test` and edits a file under `web/` that triggers a Vite HMR update
- **THEN** the server process is unaffected and any live worktree agents continue running

#### Scenario: Server does not restart on server-file edits
- **WHEN** the developer is running `dev:test` and edits a file under `server/`
- **THEN** the server process does not restart automatically; the change is picked up only on the next manual restart

#### Scenario: Dev-mode Origin allow-list is on
- **WHEN** `dev:test` starts the server
- **THEN** the server runs with `OPENSPEC_DEV=1` so the WebSocket upgrade from `http://localhost:5173` (Vite dev) is permitted, matching the existing `dev` script's behavior

#### Scenario: Default dev script is unchanged
- **WHEN** the developer runs `npm run dev`
- **THEN** the server runs with `tsx watch` as before (server-file edits restart the process), preserving the actively-editing-server workflow

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

