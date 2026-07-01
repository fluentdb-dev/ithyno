## ADDED Requirements

### Requirement: Cross-platform Path Handling
The system SHALL resolve a file path to its owning change using OS-native path
semantics, so change detection works on Windows backslash paths as well as POSIX.

#### Scenario: Windows path under a change
- **WHEN** a watched path uses backslash separators inside openspec\changes\<id>
- **THEN** the system resolves it to change id `<id>`

#### Scenario: Path outside changes
- **WHEN** a path is not under openspec/changes
- **THEN** the system resolves it to no change (null)
