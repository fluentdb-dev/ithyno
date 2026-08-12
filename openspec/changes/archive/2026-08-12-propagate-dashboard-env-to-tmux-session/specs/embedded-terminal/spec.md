## ADDED Requirements

### Requirement: Tmux Session Receives Authoritative Dashboard Environment
When tmux is enabled for the Manager, the system SHALL propagate the attaching PTY's `ITHYNO_PORT`, `ITHYNO_BASE`, and `ITHYNO_SESSION_TOKEN` values into the project tmux session environment.

#### Scenario: Manager starts in a new tmux session
- **WHEN** ithyno creates a project tmux session
- **THEN** the `new-session` arguments explicitly set `ITHYNO_PORT`, `ITHYNO_BASE`, and `ITHYNO_SESSION_TOKEN` in the tmux session environment
- **AND** the generated startup string contains environment-variable references rather than the resolved session token value

#### Scenario: Manager attaches to an existing tmux session
- **GIVEN** a project tmux session already exists
- **WHEN** ithyno starts the Manager with `new-session -A`
- **THEN** tmux's `update-environment` includes `ITHYNO_PORT`, `ITHYNO_BASE`, and `ITHYNO_SESSION_TOKEN`
- **AND** tmux copies the attaching PTY's authoritative values into the session environment

#### Scenario: Manager CLI selection does not change propagation
- **WHEN** any supported Manager CLI is started with tmux enabled
- **THEN** the same three environment variables are propagated before the resolved CLI command
- **AND** the CLI's configured arguments and initial input remain unchanged
