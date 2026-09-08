## ADDED Requirements

### Requirement: Headless Hub Runtime
The system SHALL provide an independently startable headless hub runtime that exposes integration APIs and event streams without embedding the workstation PTY, Manager terminal, agent runner, or a second dashboard UI.

#### Scenario: Start the hub container
- **WHEN** an operator starts the hub with valid configuration and persistent storage
- **THEN** it exposes health, webhook, and authenticated event-stream endpoints without starting an interactive shell or agent process

### Requirement: GitLab CE-Compatible Webhook Registration
The hub SHALL support project webhooks as the baseline registration mechanism and SHALL expose group webhook registration only when the configured GitLab edition supports it.

#### Scenario: Configure a GitLab CE project
- **WHEN** an operator registers a project on a GitLab CE instance
- **THEN** setup instructions and diagnostics select a project webhook and do not require a group webhook

#### Scenario: Configure a licensed group
- **WHEN** an operator explicitly selects group registration on a GitLab edition that reports support
- **THEN** the hub can receive events for configured projects in that group through the group webhook

### Requirement: Verified and Allowlisted Webhook Intake
The hub SHALL verify every webhook using the configured signing or legacy secret mode and SHALL reject events whose GitLab instance or project is not allowlisted before any side effect is queued.

#### Scenario: Valid signed webhook
- **WHEN** a request has a valid signature and timestamp for an allowlisted project
- **THEN** the hub accepts the event for durable processing

#### Scenario: Invalid credential
- **WHEN** a webhook signature or legacy secret is missing or invalid
- **THEN** the hub rejects the request without parsing it into a job or changing GitLab state

#### Scenario: Unregistered project
- **WHEN** a validly signed webhook names a project outside the allowlist
- **THEN** the hub rejects the event and records a redacted security audit entry

### Requirement: Supported Event Filtering
The hub SHALL classify Work Item/Issue, merge request, failed pipeline, comment/note, and push events, SHALL ignore unsupported event kinds, and SHALL suppress events authored by the configured bot when they would re-trigger the same automation.

#### Scenario: Successful pipeline event
- **WHEN** GitLab sends a pipeline event whose status is not failed
- **THEN** the hub records no failure notification job

#### Scenario: Bot-generated recursive event
- **WHEN** the configured bot's own comment or merge-request update would repeat an action already performed by the hub
- **THEN** the hub acknowledges it without enqueueing the repeated action

### Requirement: GitLab-Owned Domain State
The hub SHALL derive change lifecycle state from GitLab Issues, labels, branches, and merge requests and SHALL NOT maintain a conflicting private lifecycle status as an independent source of truth.

#### Scenario: Hub restarts
- **WHEN** the hub restarts after a Draft merge request has been created
- **THEN** it reconstructs the change's domain state from GitLab while using local persistence only for delivery and job recovery
