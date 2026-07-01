# openspec-parsing Specification

## Purpose
Parse the OpenSpec directory into a normalized, read-only model that records the
source line of every task, so edits can be applied surgically.
## Requirements
### Requirement: Task Parsing
The system SHALL parse tasks.md into sections of checkbox tasks, recording for
each task its checked state, hierarchical id, label, and 0-based source line.

#### Scenario: Sectioned checklist
- **WHEN** tasks.md groups tasks under `## N. Title` headings
- **THEN** each task is assigned to its nearest preceding heading with its line number

### Requirement: Spec Parsing
The system SHALL parse spec.md into a purpose, requirements, and Given/When/Then
scenarios, and SHALL recognize `## ADDED|MODIFIED|REMOVED Requirements` deltas.

#### Scenario: Delta spec
- **WHEN** a change spec declares `## ADDED Requirements`
- **THEN** its requirements are tagged with the ADDED delta kind

### Requirement: Parse-error Fallback
The system SHALL isolate parse failures to the affected file and expose the raw
text, so one malformed file never breaks the whole dashboard.

#### Scenario: Malformed tasks.md
- **WHEN** a tasks.md cannot be parsed
- **THEN** the file is returned with a parseError and its raw text for display

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

### Requirement: Cross-platform Path Handling
The system SHALL resolve a file path to its owning change using OS-native path
semantics, so change detection works on Windows backslash paths as well as POSIX.

#### Scenario: Windows path under a change
- **WHEN** a watched path uses backslash separators inside openspec\changes\<id>
- **THEN** the system resolves it to change id `<id>`

#### Scenario: Path outside changes
- **WHEN** a path is not under openspec/changes
- **THEN** the system resolves it to no change (null)

### Requirement: Outcome Parsing in Archive Summary
The system SHALL read `outcome.md` (when present) from each archive directory
and include its body in the archive summary returned from the workspace state,
so the UI can display outcomes without a separate round-trip.

#### Scenario: Archive directory contains outcome.md
- **WHEN** an archive directory has an `outcome.md` file
- **THEN** the archive summary entry for that change carries `outcome.body` equal to the file's contents

#### Scenario: Archive directory has no outcome.md
- **WHEN** an archive directory has no `outcome.md`
- **THEN** the archive summary entry has `outcome` set to null

