## ADDED Requirements

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
