## MODIFIED Requirements

### Requirement: Frontmatter Display
The system SHALL parse YAML frontmatter from each docs file and SHALL display
known fields (`status`, `tags`, `source`, `related`, `promoted_to`) as
metadata badges above the rendered body. Tag chips SHALL navigate to the
corresponding tag page when clicked.

#### Scenario: Status badge
- **WHEN** a docs file has `status: shaped` in its frontmatter
- **THEN** the viewer shows a "shaped" badge above the body

#### Scenario: Tag chips are clickable
- **WHEN** a docs file has `tags: [feature/x, area/y]` in its frontmatter
- **THEN** each tag appears as a chip above the body, and clicking it navigates to /tags/<ns>/<name>

#### Scenario: Unknown frontmatter fields
- **WHEN** a docs file's frontmatter contains fields outside the known set
- **THEN** they are listed as plain key/value rows in a "more metadata" section without breaking the rendering
