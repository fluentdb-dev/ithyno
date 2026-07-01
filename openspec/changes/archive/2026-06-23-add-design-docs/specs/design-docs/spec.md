## ADDED Requirements

### Requirement: Docs Navigation
The system SHALL provide a Docs page accessible from the dashboard's top
navigation, and SHALL list every markdown file under `docs/` in a sidebar
tree that mirrors the on-disk directory structure.

#### Scenario: Open the docs page
- **WHEN** the user clicks "Docs" in the top navigation
- **THEN** the dashboard navigates to /docs and the sidebar shows every docs/**/*.md grouped by directory

#### Scenario: Open a docs file
- **WHEN** the user clicks a file in the sidebar
- **THEN** the right pane shows the file's frontmatter metadata and the rendered markdown body

### Requirement: Frontmatter Display
The system SHALL parse YAML frontmatter from each docs file and SHALL display
known fields (`status`, `tags`, `source`, `related`, `promoted_to`) as metadata
badges above the rendered body.

#### Scenario: Status badge
- **WHEN** a docs file has `status: shaped` in its frontmatter
- **THEN** the viewer shows a "shaped" badge above the body

#### Scenario: Tag chips
- **WHEN** a docs file has `tags: [feature/x, area/y]` in its frontmatter
- **THEN** each tag appears as a chip above the body (non-clickable in this change; clickable navigation arrives with cross-cutting tags)

#### Scenario: Unknown frontmatter fields
- **WHEN** a docs file's frontmatter contains fields outside the known set
- **THEN** they are listed as plain key/value rows in a "more metadata" section without breaking the rendering

### Requirement: Live Docs Updates
The system SHALL detect external edits to any `docs/**/*.md` file and SHALL
update the Docs page without requiring a manual refresh.

#### Scenario: External edit refreshes the open document
- **WHEN** the currently-open docs file is edited outside the UI
- **THEN** the watcher detects the change and the viewer updates the body and frontmatter in place

#### Scenario: New file appears in the sidebar
- **WHEN** a new `docs/**/*.md` file is created outside the UI
- **THEN** it appears in the sidebar tree at the next state update without a manual refresh

### Requirement: Idea File Status Indication
The system SHALL show the `status` field of files under `docs/ideas/` as a
small indicator in the sidebar so users can see lifecycle state at a glance.

#### Scenario: Idea status indicator
- **WHEN** a sidebar entry is under docs/ideas/ and its frontmatter declares a status value
- **THEN** the entry shows that status next to the filename (color or short label)

#### Scenario: Idea with no status
- **WHEN** an idea file has no `status` field
- **THEN** a neutral indicator is shown instead of failing to render the entry

### Requirement: Read-only Rendering
The system SHALL render docs files as read-only. The Docs page MUST NOT offer
any editing affordance in this change.

#### Scenario: No edit controls
- **WHEN** the user views any docs file
- **THEN** no edit, save, or new-file UI elements are present
