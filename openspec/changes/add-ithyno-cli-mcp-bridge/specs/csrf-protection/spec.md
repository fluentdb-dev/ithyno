## ADDED Requirements

### Requirement: Local bridge credential containment
The local agent bridge SHALL keep the dashboard session token within the owning ithyno server process and SHALL NOT return it through runtime descriptors, IPC responses, CLI output, MCP tool results, generated configuration, logs, or audit events. Existing dashboard HTTP and WebSocket requests SHALL continue to use the current session-token requirements.

#### Scenario: Bridge performs a workflow write
- **WHEN** an authorized local bridge operation maps to a token-gated internal action
- **THEN** the owning server performs the action without disclosing or forwarding the raw dashboard session token to the bridge caller

#### Scenario: Existing browser mutation
- **WHEN** the dashboard sends a mutating HTTP request
- **THEN** the existing session-token and Origin protections remain in force

### Requirement: Local IPC is not an HTTP authentication bypass
The system SHALL expose only the bridge's allow-listed operation catalog through local IPC and SHALL NOT provide an unrestricted route to invoke arbitrary token-gated HTTP endpoints.

#### Scenario: Caller supplies a raw HTTP path
- **WHEN** a local caller attempts to use the bridge as a generic HTTP proxy
- **THEN** the bridge rejects the request before any HTTP endpoint is invoked

