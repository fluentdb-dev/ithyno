## ADDED Requirements

### Requirement: Stable Dashboard Session Endpoint
The Electron shell SHALL assign one port and one session token to the active project's dashboard session and SHALL keep both values unchanged until the application quits or switches projects.

#### Scenario: Renderer session reload preserves endpoint
- **GIVEN** an Electron dashboard session with a healthy project server
- **WHEN** the renderer requests `ithyno:reload-session`
- **THEN** Electron reloads the current authenticated launch URL without stopping or respawning the server
- **AND** the server port and session token remain unchanged

#### Scenario: Focus recovery preserves endpoint
- **GIVEN** Manager and worker CLIs are running with the current dashboard endpoint
- **WHEN** the Electron window loses focus and later recovers its renderer session
- **THEN** those CLIs retain a valid endpoint and token without being restarted

#### Scenario: Same-session child recovery reuses endpoint
- **GIVEN** recovery genuinely requires replacing the server child without switching projects
- **WHEN** Electron respawns that child inside the same dashboard session
- **THEN** it supplies the session's existing port and token to the replacement child

#### Scenario: Stable port cannot be rebound
- **GIVEN** a same-session child recovery must reuse the existing port
- **WHEN** another process prevents that port from being rebound
- **THEN** Electron reports recovery failure instead of silently selecting a different endpoint

#### Scenario: Project switch starts new endpoint identity
- **WHEN** the user switches to a different project
- **THEN** Electron ends the current dashboard session and creates a new port/token identity for the new project
