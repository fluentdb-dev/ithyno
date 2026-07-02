## MODIFIED Requirements

### Requirement: Agent Process I/O
The agent runner SHALL spawn each child process with a **writable
stdin** in addition to the existing captured stdout/stderr, so the
dashboard can relay user input to interactive prompts (e.g. permission
confirmations) without having to preconfigure the agent for YOLO
non-interaction.

#### Scenario: Stdin pipe available for the lifetime of the child
- **WHEN** the runner spawns an agent
- **THEN** the child is spawned with `stdio: ["pipe", "pipe", "pipe"]` and the runner keeps the `stdin` handle attached to the job entry until the child exits

#### Scenario: Existing agents unaffected
- **WHEN** an agent that never reads stdin runs
- **THEN** the pipe remains open and empty; the agent's behavior is identical to the pre-change baseline

## ADDED Requirements

### Requirement: Job Input Endpoint
The system SHALL expose `POST /api/agents/jobs/:id/input` accepting
`{ data, appendNewline? }` and writing the payload to the child's stdin
pipe, so the UI can respond to interactive prompts from a running agent.

#### Scenario: Send input to a running job
- **WHEN** the client posts `{ data: "Option A" }` to a running job's input endpoint
- **THEN** the server writes `"Option A\n"` to the child's stdin (default `appendNewline: true`), returns 200, and emits an `agent-job-output` event with `stream: "stdin", chunk: "Option A\n"` so all connected clients see the echo

#### Scenario: Raw input without newline
- **WHEN** the client posts `{ data: "y", appendNewline: false }`
- **THEN** the server writes exactly `"y"` (no newline appended) and the echo mirrors the raw bytes

#### Scenario: Reject when job is not running
- **WHEN** the client posts to an input endpoint for a job whose status is not `running`
- **THEN** the endpoint returns 409 with a reason indicating the job is not accepting input

#### Scenario: Reject on non-local caller
- **WHEN** the request originates from a non-loopback address
- **THEN** the endpoint returns 403 (matches existing local-only gate)

#### Scenario: Reject on missing session token
- **WHEN** the request omits or fails the session-token / Origin gate
- **THEN** the endpoint returns 401 / 403 (matches the existing CSRF gate on mutating endpoints)

#### Scenario: Reject unknown job
- **WHEN** the target job id does not exist in the runner
- **THEN** the endpoint returns 404

#### Scenario: Pipe write failure
- **WHEN** writing to the child's stdin throws (e.g. EPIPE)
- **THEN** the endpoint returns 500 with the error message and the job continues (no crash of the runner or server)

### Requirement: Stdin Echo in Job Output
The system SHALL echo user-sent input into the job's output ring buffer
as a distinct `stream: "stdin"` line, so the transcript remains
self-contained for post-hoc review.

#### Scenario: Echo appears in the ring buffer
- **WHEN** input is accepted via the endpoint
- **THEN** the job's `output` array gains an entry `{ stream: "stdin", chunk: <bytes-written>, ts: <server-time> }` in append order

#### Scenario: Echo is broadcast to all listeners
- **WHEN** input is accepted
- **THEN** every connected WebSocket client receives `{ type: "agent-job-output", jobId, stream: "stdin", chunk }` — identical shape to stdout/stderr broadcast, only the `stream` field differs

### Requirement: Agent Input UI
The dashboard's Agents page SHALL provide an input field on each
running job so the user can type responses to interactive prompts
without leaving the dashboard.

#### Scenario: Input field visible on running jobs
- **WHEN** the Agents page renders a job with `status === "running"` and the Output tab is open
- **THEN** an input field appears with placeholder `"Send input to agent (Enter = send)"`

#### Scenario: Enter submits, Shift-Enter inserts a newline
- **WHEN** the user presses Enter without Shift
- **THEN** the client sends the current value with `appendNewline: true` and clears the field
- **AND WHEN** the user presses Shift-Enter
- **THEN** a literal newline is inserted into the field (no send)

#### Scenario: Input field disabled when job is not running
- **WHEN** the job's status is not `running`
- **THEN** the input field is disabled with a tooltip explaining that finished jobs cannot receive input

#### Scenario: Sent input is visually distinct in the transcript
- **WHEN** stdin-stream lines appear in the output view
- **THEN** they render with a `[stdin]` marker (or equivalent styling) so the user can distinguish their own input from the agent's output on scroll-back
