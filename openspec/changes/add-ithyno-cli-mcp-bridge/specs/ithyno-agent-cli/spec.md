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

### Requirement: Explicit dashboard startup command
The CLI SHALL expose `ithyno start` as the canonical dashboard startup command. During the compatibility window, bare `ithyno` MAY continue to start the dashboard only when it prints a deprecation notice identifying `ithyno start`. Startup SHALL validate the requested port before spawning the server and SHALL report an occupied port with actionable session-inspection and alternate-port commands instead of a raw runtime stack trace.

#### Scenario: Start the dashboard explicitly
- **WHEN** a user runs `ithyno start` with an available valid port
- **THEN** the CLI starts the dashboard without a deprecation notice

#### Scenario: Use the legacy bare command
- **WHEN** a user runs bare `ithyno` during the compatibility window
- **THEN** the dashboard starts and the CLI identifies `ithyno start` as the replacement command

#### Scenario: Requested port is occupied
- **WHEN** the requested dashboard port is already bound
- **THEN** the CLI exits before spawning the server and prints commands for bridge status and an alternate port without exposing a Node.js stack trace

### Requirement: Project-local CLI installation during initialization
The project initialization chain SHALL install ithyno as a project-local development dependency alongside OpenSpec. The launcher or build SHALL select the package source explicitly: source development runs use the current checkout, locally packaged debug clients use a bundled tarball created from that checkout, and release clients use the running version's GitHub Release tarball. The chain SHALL NOT infer the package channel from `.git`, `NODE_ENV`, or the target project. Newly rendered ithyno workflows SHALL invoke that project-local CLI without downloading a different release at execution time, so Electron, VS Code Extension, and standalone initialization produce the same executable contract. Initialization SHALL NOT enable MCP implicitly.

#### Scenario: Initialize a new project
- **WHEN** ithyno initializes a project and installs the OpenSpec development dependency
- **THEN** it also installs the matching ithyno release and the generated workflows can invoke its project-local executable

#### Scenario: A global ithyno installation differs
- **WHEN** a generated workflow runs in a project whose globally installed ithyno version is missing or different
- **THEN** the workflow uses the initialized project's local ithyno executable rather than the global installation

#### Scenario: Initialize from a development or debug client
- **WHEN** initialization is launched from `npm run dev`, Electron development, VS Code Extension F5, or a locally packaged debug client
- **THEN** the project-local dependency is installed from that explicit checkout or its bundled tarball rather than requiring a published release asset

#### Scenario: Initialize from a release client
- **WHEN** initialization is launched from a release Electron, VS Code Extension, or CLI build
- **THEN** the project-local dependency is installed from the version-matched GitHub Release tarball

#### Scenario: VS Code initializes a fresh project directory
- **WHEN** VS Code New Project targets a directory that does not exist yet or is not yet a Git repository
- **THEN** the initialization preflight creates the directory and initializes Git before writing `agents.yaml` and starting the streamed OpenSpec installation chain
- **AND** the temporary onboarding server does not report the expected absence of Git or `openspec/` as a startup failure
