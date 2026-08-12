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

### Requirement: Per-commit CI matrix runs on macOS, Windows, and Linux

The repository SHALL provide a `.github/workflows/test.yml` GitHub
Actions workflow that runs the per-commit test signal (`npm test`,
`npm run typecheck`, `npm run build`, and `npm run openspec --
validate --all`) across a three-OS matrix — `macos-latest`,
`windows-latest`, and `ubuntu-latest` — on every pull request and on
every push to `develop` and `main`.

The workflow SHALL be distinct from `release.yml`. `release.yml`
governs release-artifact builds and remains scoped as-is;
`test.yml` governs the per-commit test-suite matrix. The two files
SHALL NOT share concurrency groups.

The matrix strategy SHALL set `fail-fast: false` so a failure on one
OS does not cancel the other OS jobs. Each job SHALL run under Node
20 (matching `release.yml`).

Every `run:` step in `test.yml` SHALL declare `shell: bash`
explicitly so Windows uses git-bash (bundled with the `windows-latest`
runner image) rather than PowerShell. Step scripts SHALL be
single-source across all three OSes with no shell-conditional
branches.

The repository SHALL declare a root-level `.gitattributes` with
`* text=auto eol=lf` (and appropriate `-text` exceptions for binary
patterns) so that files checked out on Windows retain LF line
endings, ensuring the byte-comparison template drift guard and the
`npm pack` package-shape assertion do not fail due to CRLF
conversion.

The workflow SHALL NOT reference any repository secrets and SHALL
NOT upload artifacts (`release.yml` handles artifact production).

#### Scenario: PR triggers three-OS matrix

- **GIVEN** a pull request against `develop` or `main`
- **WHEN** the `test.yml` workflow starts
- **THEN** three jobs execute in parallel on `macos-latest`,
  `windows-latest`, and `ubuntu-latest`
- **AND** each job runs `npm ci --include=optional`, then
  `npm run typecheck`, `npm test`, `npm run build`, and
  `npm run openspec -- validate --all`, in that order
- **AND** the matrix strategy has `fail-fast: false`, so a Windows
  failure does not cancel the macOS or Linux jobs
- **AND** the workflow does NOT upload artifacts

#### Scenario: Push to `develop` triggers three-OS matrix

- **GIVEN** a push directly to `develop` (post-merge or otherwise)
- **WHEN** the `test.yml` workflow starts
- **THEN** the same three-OS matrix runs as for a pull request

#### Scenario: Push to `main` triggers three-OS matrix

- **GIVEN** a push to `main` (release promotion from `develop`)
- **WHEN** the `test.yml` workflow starts
- **THEN** the same three-OS matrix runs as for a pull request
- **AND** `release.yml` runs in parallel on the same commit (their
  concurrency groups are distinct so neither cancels the other)

#### Scenario: Every step uses bash even on Windows

- **WHEN** a reviewer opens `test.yml`
- **THEN** every `run:` step either declares `shell: bash` or the
  job-level `defaults.run.shell` is set to `bash`
- **AND** no step invokes PowerShell-only syntax (e.g. `$env:Foo`,
  backtick line-continuation, `Get-ChildItem`)

#### Scenario: `.gitattributes` enforces LF line endings

- **WHEN** a reader opens the repository's `.gitattributes` file
- **THEN** the file contains `* text=auto eol=lf` (or an equivalent
  directive that yields LF checkouts on Windows for text files)
- **AND** the template drift guard test (`server/init.test.ts`)
  passes on the Windows runner without CRLF-related byte mismatches
- **AND** the `add-init-scaffold-smoke-test` npm-pack shape test
  passes on the Windows runner without CRLF-related byte mismatches

#### Scenario: Workflow references no secrets

- **WHEN** a reviewer inspects `test.yml`
- **THEN** the file does NOT reference `secrets.*` beyond the default
  `GITHUB_TOKEN` (and does not require write scope)
- **AND** the workflow runs unchanged for external-contributor PRs
  triggered via `pull_request` (no `pull_request_target` needed)

#### Scenario: Windows-specific regression fails CI

- **GIVEN** a hypothetical change that introduces `path.join(dir,
  "sub/leaf")` where the source assumes forward-slash separators
- **WHEN** the `test.yml` workflow runs
- **THEN** the `windows-latest` job's `npm test` step fails, naming
  the file whose path assertion diverged
- **AND** the `macos-latest` and `ubuntu-latest` jobs succeed,
  identifying the failure as Windows-specific
- **AND** the PR cannot merge until the regression is corrected

### Requirement: Server Precompile Script
The system SHALL provide a `build:server` npm script that compiles the
TypeScript sources under `server/` to JavaScript in `server-dist/`, so
packaging paths (Electron, VS Code extension) can ship a runtime that does
not require `tsx`.

#### Scenario: Build the server bundle
- **WHEN** the developer runs `npm run build:server`
- **THEN** the script emits compiled `.js` files under `server-dist/` mirroring the `server/` directory structure

#### Scenario: server-dist matches the runtime
- **WHEN** `server-dist/index.js` is executed with Node
- **THEN** it boots the same Fastify server that `tsx server/index.ts` does, observing the same environment variables and exposing the same endpoints

### Requirement: Pre-staged Workspaces Array
The system SHALL declare `electron/` and `vscode-extension/` as npm
workspaces ahead of those directories existing, so the parallel changes
that create them do not have to modify the root `package.json` workspaces
field on merge.

#### Scenario: Workspaces declared
- **WHEN** a reader inspects the root `package.json`
- **THEN** `workspaces` is `["electron", "vscode-extension"]`

#### Scenario: npm install with missing workspace dirs
- **WHEN** `npm install` runs and neither `electron/` nor `vscode-extension/` exist yet
- **THEN** the install succeeds (npm may warn about the missing entries)

### Requirement: Gitignore Coverage for Shell Builds
The system's `.gitignore` SHALL exclude every shell build artifact
directory (`server-dist/`, `electron/out/`, `electron/dist/`,
`vscode-extension/out/`) so the parallel changes do not race to add them
later.

#### Scenario: Build artifacts ignored
- **WHEN** any of `server-dist/`, `electron/out/`, `electron/dist/`, or `vscode-extension/out/` exists with content
- **THEN** `git status` shows none of those paths as untracked

