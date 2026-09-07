## ADDED Requirements

### Requirement: AgentRunner workers receive the selected development environment
Before spawning a worker, AgentRunner SHALL resolve the same selected project
profile used by the Manager PTY and include its code-development variables in
the worker environment. The source files SHALL be resolved from the dashboard
project root even when execution occurs in an isolated worktree.

#### Scenario: Worktree worker starts with selected profile
- **WHEN** AgentRunner starts a worker in `.worktrees/<change-id>` while a development profile is selected
- **THEN** the worker receives the profile's effective code-development variables resolved from the dashboard project root

#### Scenario: Dashboard variables remain authoritative
- **WHEN** a selected profile and AgentRunner both provide an `ITHYNO_*` key
- **THEN** the worker receives the authoritative AgentRunner/dashboard value and the project value is ignored

#### Scenario: Profile changes between jobs
- **WHEN** the selected profile changes after one worker completes
- **THEN** the next worker resolves the new selection without mutating the completed or running worker
