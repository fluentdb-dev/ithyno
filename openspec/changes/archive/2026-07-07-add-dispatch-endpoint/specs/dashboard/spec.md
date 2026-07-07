## ADDED Requirements

### Requirement: Role-Based Agent Dispatch API

The server SHALL expose `POST /api/agents/dispatch` — a role-driven,
local-only endpoint that selects a matching agent from `agents.yaml`,
runs it against the given change, and (by default) blocks until the
job completes before returning the resolved outcome. The request body
SHALL accept `{ role, changeId }` as required fields and
`{ runtime?, promptSuffix?, wait?, timeoutMs? }` as optional fields.
The response SHALL carry the resolved job id, chosen agent name and
runtime label, terminal status (`completed | failed | cancelled |
timeout`), optional exit code, stdout tail, and a list of artifact
paths generated inside the change directory.

#### Scenario: happy-path dispatch
- **WHEN** a client POSTs `{ role: "code", changeId: "add-foo" }` and an agent with `role: code` exists
- **THEN** the server runs the agent, blocks until completion, and returns `{ jobId, agentName, runtime, status: "completed", exitCode: 0, artifactPaths: [] }`

#### Scenario: role has no matching agent
- **WHEN** a client POSTs `{ role: "unknown-role", changeId: "add-foo" }`
- **THEN** the server responds 404 with a message identifying the role and change id

#### Scenario: unknown change id
- **WHEN** a client POSTs `{ role: "code", changeId: "does-not-exist" }`
- **THEN** the server responds 404 with a "change not found" message

#### Scenario: empty registry
- **WHEN** `agents.yaml` declares no agents at all
- **THEN** the endpoint responds 503 with a "no agents defined" message (matching the pre-existing `/api/agents/run` behavior)

#### Scenario: non-local origin rejected
- **WHEN** a request arrives from a non-local address
- **THEN** the server responds 403 (same guard as `/api/agents/run`)

#### Scenario: wait=false returns immediately
- **WHEN** a client POSTs `{ role: "code", changeId: "add-foo", wait: false }`
- **THEN** the server starts the job and returns immediately with `{ jobId, status: "running" }`; the caller SHALL poll `/api/agents/jobs/:id` for completion

### Requirement: Agent Selection By Role And Specialties

The dispatch selector SHALL filter agents from `agents.yaml` by
matching (a) the request `role`, (b) an intersection between the
change's frontmatter tags and the agent's `specialties`, and (c) the
requested `runtime` when supplied. An agent whose `specialties` is
empty or contains `"any"` SHALL be treated as a wildcard match. When
multiple agents satisfy all filters, the selector SHALL return the
first one in `agents.yaml` declaration order.

#### Scenario: specialty intersection selects the right agent
- **GIVEN** two agents `code-claude` (`specialties: [ts, react]`) and `code-aider` (`specialties: [python]`) both with `role: code`
- **AND** change `add-foo`'s proposal frontmatter has `tags: [python]`
- **WHEN** the client dispatches `{ role: "code", changeId: "add-foo" }`
- **THEN** `code-aider` is selected

#### Scenario: wildcard specialties always match
- **GIVEN** an agent with `role: code` and `specialties: [any]`
- **WHEN** a client dispatches for any change
- **THEN** the agent is a valid candidate regardless of the change's tags

#### Scenario: runtime filter narrows candidates
- **GIVEN** two agents with `role: code` — one `runtime: claude` and one `runtime: aider`, both matching specialties
- **WHEN** a client dispatches `{ role: "code", changeId: "add-foo", runtime: "aider" }`
- **THEN** the aider-backed agent is selected

#### Scenario: deterministic order
- **GIVEN** two agents both match role, specialties, and runtime filters
- **WHEN** the client dispatches
- **THEN** the agent that appears first in `agents.yaml` is selected

### Requirement: Synchronous Dispatch With Timeout

The dispatch endpoint SHALL default to `wait: true`, meaning the HTTP
response is held open until the underlying agent job terminates or a
timeout elapses. The default timeout SHALL be 30 minutes (1,800,000
ms). When `timeoutMs` is supplied it SHALL override the default;
values less than 1000 ms SHALL be rejected as invalid. On timeout the
server SHALL cancel the running job and return `status: "timeout"`
with a non-zero exit code marker.

#### Scenario: wait=true blocks until completion
- **GIVEN** a client dispatches `{ role: "code", changeId: "add-foo" }` (default wait)
- **WHEN** the underlying agent job runs to completion in 90 seconds
- **THEN** the server responds after ~90 seconds with the completed job status

#### Scenario: timeout cancels and reports
- **GIVEN** a client dispatches `{ role: "code", changeId: "add-foo", timeoutMs: 2000 }`
- **WHEN** the job is still running after 2 seconds
- **THEN** the server cancels the underlying job and responds with `status: "timeout"`

#### Scenario: invalid timeout rejected
- **WHEN** a client supplies `timeoutMs: 500`
- **THEN** the server responds 400 with a "timeoutMs must be >= 1000" message
