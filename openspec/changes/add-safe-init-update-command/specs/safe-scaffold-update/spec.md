## ADDED Requirements

### Requirement: Explicit update command
The CLI SHALL provide `ithyno update [directory]` as a command separate from
`ithyno init`.

#### Scenario: Update an initialized project
- **WHEN** a user runs `ithyno update .`
- **THEN** the command evaluates the shared ithyno-managed file inventory and
  reports each created, updated, skipped, or conflicted file

#### Scenario: Dry-run update
- **WHEN** a user runs `ithyno update . --dry-run`
- **THEN** the command reports planned actions without modifying project files

### Requirement: Non-destructive synchronization
The update command MUST NOT overwrite a file whose current content differs
from the last ithyno-managed content recorded for that file.

#### Scenario: User-modified file is preserved
- **WHEN** a managed file has been edited since installation
- **THEN** update leaves it unchanged and reports it as skipped or conflicted

#### Scenario: Unchanged managed file receives a fix
- **WHEN** a managed file still matches its recorded managed hash and the
  shipped template changed
- **THEN** update replaces it with the new template and records the new hash

### Requirement: Shared inventory and hook isolation
`init` and `update` SHALL use the same managed-file inventory, and neither
command SHALL modify CLI hook configuration.

#### Scenario: Init remains create-only
- **WHEN** init runs against an existing project file
- **THEN** init preserves that file and does not perform an update

#### Scenario: Notification script is managed without enabling hooks
- **WHEN** update installs or updates the host-specific notification script
- **THEN** no Claude, Codex, Agy, or Copilot hook is enabled or modified
