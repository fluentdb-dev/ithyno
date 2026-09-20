## ADDED Requirements

### Requirement: Namespaced agent bridge CLI
The existing `ithyno` executable SHALL provide namespaced commands for bridge status, project/change queries, phase and Manager-activity updates, AgentRunner dispatch, job inspection and cancellation, and needs-human answers. Every command SHALL call the shared bridge client rather than construct a raw authenticated HTTP request.

#### Scenario: Query a change from the current project
- **WHEN** a user runs an ithyno change query from within a registered project
- **THEN** the CLI derives the project identity from cwd and returns the bridge result

#### Scenario: Dispatch through the CLI
- **WHEN** a Manager invokes the documented dispatch command with a change ID and role
- **THEN** the CLI submits the corresponding allow-listed bridge operation and returns its job identity

### Requirement: Explicit project selection
The CLI SHALL accept `--project <path>` for callers outside a project and otherwise derive the nearest owning project from cwd. The resolved path SHALL be canonicalized and SHALL be checked against the server-reported project identity before results are accepted.

#### Scenario: Explicit project matches server
- **WHEN** `--project` resolves to a live registered project
- **THEN** the CLI performs the operation against that project

#### Scenario: Explicit project does not match
- **WHEN** the selected descriptor reports a different canonical project root
- **THEN** the CLI fails with a project-mismatch error and performs no operation

### Requirement: Stable output and exit contract
The CLI SHALL provide concise human-readable output by default and a versioned JSON response envelope with `--json`. It SHALL use distinct documented non-zero exit codes for usage, unavailable or stale session, permission, validation, timeout, and operation failure.

#### Scenario: JSON success
- **WHEN** a supported command succeeds with `--json`
- **THEN** stdout contains one parseable versioned success envelope and no explanatory prose

#### Scenario: Session is unavailable
- **WHEN** discovery finds no live session for the selected project
- **THEN** the CLI exits with the documented unavailable-session code and a remediation message that does not suggest a default port

### Requirement: CLI credential containment
The CLI SHALL NOT accept dashboard session tokens as command-line options, SHALL NOT require them in its environment, and SHALL NOT print tokens, secret values, IPC authorization material, or unredacted internal errors in normal or verbose output.

#### Scenario: Process arguments and environment are inspected
- **WHEN** an ithyno bridge CLI operation is running
- **THEN** its argv and required environment contain no dashboard session token

#### Scenario: Diagnostic output is requested
- **WHEN** the user requests verbose or status diagnostics
- **THEN** all credential-bearing fields are absent or redacted

### Requirement: CLI lifecycle diagnostics
The CLI SHALL provide status and doctor output that reports project resolution, descriptor liveness, protocol compatibility, IPC reachability, and adapter availability without exposing credentials. It SHALL distinguish an app-not-running condition from a sandbox permission denial and a stale registration.

#### Scenario: Sandbox denies socket access
- **WHEN** the descriptor is live but IPC access is denied
- **THEN** diagnostics identify a permission or sandbox problem instead of reporting that ithyno is not installed or not running
