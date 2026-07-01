# tagging Specification

## Purpose
TBD - created by archiving change add-cross-cutting-tags. Update Purpose after archive.
## Requirements
### Requirement: Tag Collection From Frontmatter
The system SHALL scan every markdown file under `docs/` and `openspec/`,
extract `tags` from YAML frontmatter when present, and produce a per-tag index
that records the artifacts carrying each tag.

#### Scenario: Idea file contributes its tags
- **WHEN** a file under docs/ideas/ declares `tags: [feature/x, area/y]`
- **THEN** both tags appear in the tag index with the file listed as an artifact of type "idea"

#### Scenario: File without frontmatter
- **WHEN** a file has no frontmatter or no `tags` field
- **THEN** it contributes no tags to the index

#### Scenario: Tag without a namespace prefix
- **WHEN** a file declares a tag with no `<namespace>/` prefix (e.g. `urgent`)
- **THEN** the tag is bucketed under the synthetic namespace "other"

### Requirement: Tag Index Endpoint
The system SHALL expose a `GET /api/tags` endpoint that returns the tag index
grouped by namespace, in a fixed display order (feature, screen, area, role,
stage, other), with per-tag counts.

#### Scenario: Retrieve the index
- **WHEN** a client requests /api/tags
- **THEN** the response is namespace-keyed; each namespace lists its tags with their total count and per-artifact-type breakdown

### Requirement: Tag Detail Endpoint
The system SHALL expose a `GET /api/tags/:ns/:name` endpoint that returns every
artifact carrying the tag `<ns>/<name>`, grouped by artifact type.

#### Scenario: Retrieve a tag's artifacts
- **WHEN** a client requests /api/tags/feature/embedded-terminal
- **THEN** the response lists every idea, doc, change, spec, archive, and outcome that declared that tag

#### Scenario: Unknown tag
- **WHEN** a client requests a tag that no artifact declares
- **THEN** the response is a 200 with an empty artifact list (not a 404), because the tag may have been valid moments ago

### Requirement: Live Tag Index Updates
The system SHALL recompute the tag index when any watched markdown file
changes and SHALL push a `tags-updated` WebSocket event so the dashboard can
refresh without a manual reload.

#### Scenario: A new tag appears
- **WHEN** an external edit adds a new tag to a markdown file
- **THEN** the watcher detects the change, the index is recomputed, and clients subscribed to /tags refresh their view

### Requirement: Tags Page
The system SHALL provide a Tags page at `/tags` listing every known tag
grouped by namespace, and a detail page at `/tags/:ns/:name` listing every
artifact carrying that tag, with a link to each artifact.

#### Scenario: Open the tags page
- **WHEN** the user clicks "Tags" in the top navigation
- **THEN** the dashboard navigates to /tags and shows namespace-grouped tags with counts

#### Scenario: Open a tag detail
- **WHEN** the user clicks a tag in the Tags page or any clickable tag chip
- **THEN** the dashboard navigates to /tags/<ns>/<name> and lists all artifacts carrying that tag, grouped by type

