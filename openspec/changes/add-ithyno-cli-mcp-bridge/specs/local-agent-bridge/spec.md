## ADDED Requirements

### Requirement: Canonical per-project session discovery
The system SHALL register each running ithyno server under an identity derived from its canonical realpath-resolved project root and SHALL resolve callers only to an exact matching project session. The registry SHALL NOT select a session by fixed port, recency, or global active-project state.

#### Scenario: Two projects are running simultaneously
- **WHEN** callers from two different canonical project roots invoke bridge operations
- **THEN** each request is routed only to the server registered for its own project root

#### Scenario: Symlinked path resolves to its owning project
- **WHEN** a caller supplies a symlinked path whose realpath matches a registered project root
- **THEN** the bridge resolves it to that project without creating a second identity

#### Scenario: No exact project session exists
- **WHEN** no live descriptor exactly matches the caller's canonical project root
- **THEN** the bridge returns an unavailable-session error and does not guess an endpoint or another project

### Requirement: Secret-free runtime registry lifecycle
The system SHALL maintain atomic, user-scoped runtime descriptors containing only the canonical project identity, local IPC address, PID, process-start identity, protocol version, and session generation. A descriptor SHALL NOT contain a dashboard token, development-environment secret, dotenvx private key, or other reusable credential.

#### Scenario: Server registers successfully
- **WHEN** an ithyno server becomes ready
- **THEN** it atomically publishes a descriptor for its canonical project root with no secret-bearing field

#### Scenario: Orderly server shutdown
- **WHEN** the owning server shuts down normally
- **THEN** it removes only its own matching generation descriptor

#### Scenario: Stale descriptor is encountered
- **WHEN** a descriptor's process identity, generation, or IPC handshake no longer identifies its owning live server
- **THEN** the client rejects it as stale and may prune it without contacting the recorded HTTP endpoint

### Requirement: User-scoped local IPC
The system SHALL expose bridge operations only over a local OS IPC endpoint restricted to the current user. macOS and Linux SHALL use a Unix-domain socket in a mode-`0700` directory with a mode-`0600` socket where supported. Windows SHALL use a local named pipe that rejects remote clients and is ACL-scoped to the owning user SID.

#### Scenario: Owning user connects locally
- **WHEN** a process owned by the registered user connects through the project endpoint
- **THEN** the server accepts the connection and performs protocol validation

#### Scenario: Remote or unauthorized user attempts connection
- **WHEN** a remote client or an OS identity outside the endpoint's user boundary attempts to connect
- **THEN** the operating-system boundary or bridge rejects the connection before an operation executes

### Requirement: Versioned and bounded bridge protocol
The bridge SHALL use a versioned request/response protocol with request IDs, allow-listed operation names, schema-validated inputs and outputs, request deadlines, and bounded payload sizes. It SHALL reject unknown operations, malformed messages, and oversized payloads without invoking application behavior.

#### Scenario: Valid request completes
- **WHEN** a supported protocol version submits a schema-valid allow-listed operation within its deadline
- **THEN** the bridge returns a bounded response carrying the same request ID

#### Scenario: Arbitrary API proxy is requested
- **WHEN** a caller supplies an unknown operation or raw HTTP path
- **THEN** the bridge rejects it and does not proxy the request

#### Scenario: Request deadline expires
- **WHEN** an operation does not complete before its declared server-side deadline
- **THEN** the bridge returns a timeout result without leaking internal credentials or stack data

### Requirement: Shared operation policy and audit
The bridge SHALL classify every operation as read-only, workflow-write, or privileged and SHALL enforce that policy server-side for both CLI and MCP callers. The initial catalog SHALL exclude arbitrary shell execution, raw filesystem access, Secrets values, dotenvx private keys, and dashboard-token retrieval. Every successful workflow-write SHALL produce a redacted audit event.

#### Scenario: Read-only change query
- **WHEN** a caller invokes an allow-listed change or job query
- **THEN** the bridge returns the sanitized result without requiring access to dashboard credentials

#### Scenario: Workflow mutation
- **WHEN** a caller invokes an allowed phase, activity, dispatch, cancellation, or needs-human answer operation
- **THEN** the server validates the operation policy, performs the mutation, and records a redacted audit event

#### Scenario: Caller requests a secret
- **WHEN** a caller attempts to retrieve a session token or development-environment secret through the bridge
- **THEN** the bridge rejects the request because no such operation exists

### Requirement: Environment-independent bridge access
The bridge client SHALL operate without `ITHYNO_BASE`, `ITHYNO_PORT`, or `ITHYNO_SESSION_TOKEN` in the caller environment and SHALL never scan ports or fall back to port `4321` when discovery fails.

#### Scenario: Remote-style process has no dashboard variables
- **WHEN** a process in the registered project invokes the bridge with all `ITHYNO_*` contact variables absent
- **THEN** the bridge resolves the project through the runtime registry and completes the operation

#### Scenario: Sandbox blocks the IPC endpoint
- **WHEN** the caller cannot access the resolved local IPC endpoint because of sandbox policy
- **THEN** the bridge returns a specific permission error and does not fall back to direct token discovery or guessed HTTP access
