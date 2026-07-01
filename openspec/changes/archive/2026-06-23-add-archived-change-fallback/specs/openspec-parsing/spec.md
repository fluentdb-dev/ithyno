## ADDED Requirements

### Requirement: Archive Date in Archive Summary
The system SHALL parse the date prefix from each archive directory name and
include it in the archive summary returned from the workspace state, so the UI
can display when a change was archived without re-parsing directory names.

#### Scenario: Directory follows the YYYY-MM-DD-<id> pattern
- **WHEN** an archive directory is named `2026-06-22-add-foo`
- **THEN** the archive summary entry for `add-foo` carries archivedAt = "2026-06-22"

#### Scenario: Directory does not follow the pattern
- **WHEN** an archive directory has been hand-renamed and lacks a leading YYYY-MM-DD prefix
- **THEN** the archive summary entry uses the directory name as the id and archivedAt is null
