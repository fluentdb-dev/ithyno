## ADDED Requirements

### Requirement: New Manager PTYs receive the selected development environment
Before spawning a Manager PTY, the server SHALL resolve the selected project
profile through the shared development-environment resolver and include its
code-development variables in the child environment. Authoritative dashboard
session variables SHALL take precedence over all project values.

#### Scenario: Manager starts with selected profile
- **WHEN** a profile containing `APP_MODE=development` is selected and a new Manager PTY starts
- **THEN** the Manager process receives `APP_MODE=development`

#### Scenario: Project attempts to override dashboard identity
- **WHEN** the selected profile contains an `ITHYNO_*` key
- **THEN** the Manager receives the authoritative server-provided value rather than the profile value

#### Scenario: No profile is selected
- **WHEN** a Manager PTY starts without a selected development profile
- **THEN** its existing environment behavior remains unchanged
