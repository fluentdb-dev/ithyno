## ADDED Requirements

### Requirement: 3-branch decision on Open Project of a non-openspec folder

When the user opens a folder that does NOT contain an `openspec/` directory, the dashboard SHALL replace the current dead-end "No OpenSpec project found" copy with a decision panel exposing three clear next actions: Initialize openspec here, Cancel, Browse read-only.

#### Scenario: Decision panel renders for non-openspec folder

- **GIVEN** the user opens a folder that has no `openspec/` subdirectory
- **WHEN** the dashboard loads
- **THEN** a decision panel is shown, headed with the folder path
- **AND** it presents three buttons: `Initialize openspec here`, `Cancel`, `Browse read-only`

#### Scenario: Initialize action creates openspec and reloads

- **WHEN** the user clicks `Initialize openspec here`
- **THEN** the dashboard invokes `POST /api/init` for the current folder
- **AND** on success it refetches `/api/state`
- **AND** the dashboard transitions to the standard Kanban view for the newly-initialized project

#### Scenario: Cancel returns to the picker

- **WHEN** the user clicks `Cancel` in the decision panel
- **THEN** on the Electron shell the File → Open Project dialog is re-opened
- **AND** on the browser shell a helper message instructs the user to relaunch with `--dir <path>`

#### Scenario: Browse read-only mode

- **WHEN** the user clicks `Browse read-only`
- **THEN** the dashboard mounts a read-only browse view
- **AND** the browse view enumerates markdown files under the project root (`README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/**/*.md`)
- **AND** the browse view does NOT show the Kanban, Specs, Archive, Agents, Docs, or Settings tabs
- **AND** the browse view does NOT auto-launch the embedded terminal
- **AND** no mutating request (init, change, dispatch, task-toggle, etc.) can be triggered from any control within the browse view

#### Scenario: Openspec-present folder is unaffected

- **WHEN** the user opens a folder that already contains `openspec/`
- **THEN** the decision panel is NOT shown
- **AND** the standard Kanban view loads as before this requirement

#### Scenario: CLAUDE.md hint

- **GIVEN** the picked folder contains `CLAUDE.md` at its root
- **WHEN** the decision panel renders
- **THEN** a short informational line appears beneath the buttons noting that CLAUDE.md was detected and will be picked up as agent-facing context once openspec is initialized
- **AND** when `CLAUDE.md` is absent, no such hint appears

### Requirement: Browse endpoints for markdown

The server SHALL expose two read-only endpoints — `GET /api/browse/markdown-tree` and `GET /api/browse/markdown?path=<rel>` — that let the Browse view enumerate and read markdown files under the current project root without requiring `openspec/` to exist.

#### Scenario: Tree endpoint returns bounded markdown listing

- **WHEN** a client sends `GET /api/browse/markdown-tree` for a project
- **THEN** the response is a JSON array of `{ path, name, kind: "file" | "dir", children? }` entries
- **AND** only files with the `.md` or `.markdown` extension appear as `kind: "file"` leaves
- **AND** directories `node_modules/`, `.git/`, `.worktrees/`, `dist/`, `build/`, `coverage/` and any `.gitignore`-declared paths are excluded from the scan
- **AND** the scan is bounded to at most 5 directory levels deep and 500 total files

#### Scenario: Markdown-file endpoint validates path

- **WHEN** a client sends `GET /api/browse/markdown?path=<rel>` with a path that resolves inside the project root
- **THEN** the response is `{ path, content }` with the file's UTF-8 content
- **AND** files above 5 MB return 413

- **WHEN** the path contains `..` segments, is absolute, or resolves outside the project root via symlink
- **THEN** the response is 400 with a clear denial message
- **AND** no file content is returned

#### Scenario: Endpoints work without openspec/

- **GIVEN** the project folder has NO `openspec/` directory
- **WHEN** the Browse view calls either endpoint
- **THEN** both endpoints succeed
- **AND** their behavior does not depend on `openspec/` existence — this is precisely what enables the Browse mode
