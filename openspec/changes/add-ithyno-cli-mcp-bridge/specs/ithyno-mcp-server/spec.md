## ADDED Requirements

### Requirement: Stdio MCP adapter
The system SHALL provide an `ithyno mcp serve` stdio MCP server whose tools map to the shared bridge operation schemas. The adapter SHALL NOT implement a second runtime-discovery, authentication, or application-operation layer.

#### Scenario: MCP tool invokes a read operation
- **WHEN** an MCP client calls an ithyno change-query tool with a valid project identity
- **THEN** the adapter invokes the shared bridge client and returns sanitized structured content

#### Scenario: MCP process has no dashboard variables
- **WHEN** the MCP server starts without `ITHYNO_BASE`, `ITHYNO_PORT`, or `ITHYNO_SESSION_TOKEN`
- **THEN** it remains able to resolve registered projects through the bridge

### Requirement: Explicit and bounded MCP tool catalog
The MCP server SHALL expose only the documented bridge operations needed for project status, changes, phase/activity updates, dispatch, jobs, cancellation, and needs-human answers. It SHALL NOT expose a raw HTTP tool, arbitrary command execution, Secrets retrieval, environment dumping, or dashboard-token retrieval.

#### Scenario: Client lists MCP tools
- **WHEN** an MCP client initializes the server
- **THEN** every advertised tool has a bounded input schema, sanitized output schema, and read/write metadata matching the bridge policy

### Requirement: MCP approval metadata
Read-only MCP tools SHALL be identified as read-only. Tools that mutate workflow state or start or cancel agents SHALL be identified as writes and SHALL default to an approval behavior consistent with the host's MCP policy unless the user explicitly configures a narrower trusted policy.

#### Scenario: Dispatch tool is inspected
- **WHEN** the MCP client reads the dispatch tool definition
- **THEN** the tool is marked as mutating and is not represented as a read-only operation

### Requirement: Secret-free MCP configuration lifecycle
The system SHALL provide explicit, idempotent MCP install, status, and remove operations for supported Codex hosts. Generated user- or project-scoped MCP configuration SHALL contain the server command and non-secret options only, SHALL NOT contain live ports or credentials, and SHALL NOT be silently enabled by ordinary project initialization.

#### Scenario: Install MCP integration
- **WHEN** a user explicitly installs the ithyno MCP integration for a Codex host
- **THEN** the resulting configuration starts `ithyno mcp serve` without embedding a dashboard endpoint or token

#### Scenario: Repeat installation
- **WHEN** installation is run again for an equivalent existing entry
- **THEN** the operation is idempotent and does not duplicate configuration

#### Scenario: Ordinary project init
- **WHEN** a user initializes an ithyno project without choosing MCP installation
- **THEN** init does not silently add or enable an MCP server

### Requirement: MCP instructions prohibit endpoint guessing
The MCP server SHALL publish concise server instructions telling agents to resolve exact projects through tools and to treat unavailable, stale, mismatch, and permission responses as explicit failures. Instructions SHALL forbid fixed-port fallback, port scanning, and attempts to discover or print the dashboard session token.

#### Scenario: Project is unavailable
- **WHEN** a tool call cannot resolve the requested project
- **THEN** the adapter returns the bridge error and its instructions do not permit the model to try `localhost:4321`
