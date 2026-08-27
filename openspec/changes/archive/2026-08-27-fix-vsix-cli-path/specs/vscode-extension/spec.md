## MODIFIED Requirements

### Requirement: Lazy Server Activation

The server process spawned on first `ithyno.show` SHALL receive a `PATH`
environment that includes the common Windows user-level CLI installation
directories (`%APPDATA%\npm`, `%USERPROFILE%\.local\bin`) in addition to
the extension host's inherited `PATH`, so that agent CLIs installed via npm
global are discoverable by `commandExistsOnPath`. On non-Windows platforms
the environment is passed through unchanged.

#### Scenario: Agent CLI installed via npm global on Windows

- **GIVEN** the user has `claude` installed at `%APPDATA%\npm\claude.cmd`
- **AND** `%APPDATA%\npm` is not in the VS Code extension host's `process.env.PATH`
- **WHEN** the ithyno server is spawned by `spawnServer()`
- **THEN** the server process's `PATH` includes `%APPDATA%\npm`
- **AND** `commandExistsOnPath("claude")` returns `true`

#### Scenario: Non-Windows platform

- **GIVEN** the host OS is macOS or Linux
- **WHEN** `spawnServer()` is called
- **THEN** the server process receives `process.env` unchanged (no PATH augmentation)
