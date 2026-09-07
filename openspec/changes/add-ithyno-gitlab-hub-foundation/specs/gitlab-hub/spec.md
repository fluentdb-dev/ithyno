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

### Requirement: Explicit Issue Eligibility
The hub SHALL create an OpenSpec change only for an allowlisted Issue carrying the configured `ai:spec` label and SHALL request more information instead of generating artifacts when required Issue content is absent.

#### Scenario: Eligible Issue
- **WHEN** an Issue gains `ai:spec` and contains the required title and problem description
- **THEN** the hub queues exactly one change-generation job for that Issue

#### Scenario: Insufficient Issue
- **WHEN** an Issue gains `ai:spec` but lacks required problem information
- **THEN** the hub posts one actionable clarification comment and does not create a change branch

### Requirement: Canonical Issue-to-Change Identity
The hub SHALL derive the change id as `<issue-iid>-<slug>`, use branch `change/<change-id>`, record the Issue reference and base OpenSpec specs revision in proposal metadata, and reconcile existing canonical resources on retry.

#### Scenario: First generation attempt
- **WHEN** an eligible Issue has no canonical branch or merge request
- **THEN** the hub creates the branch from the configured default branch and writes generated OpenSpec artifacts containing the Issue reference and base spec revision

#### Scenario: Retried generation attempt
- **WHEN** the same Issue event is processed after its canonical branch or Draft merge request already exists
- **THEN** the hub reuses and reconciles those resources rather than creating a second branch or merge request

### Requirement: Draft Merge Request Review Gate
The hub SHALL open one Draft merge request for generated OpenSpec artifacts and SHALL leave implementation, Draft removal, merge, and archive to later explicitly authorized stages.

#### Scenario: Generation succeeds
- **WHEN** generated OpenSpec artifacts are committed to the canonical change branch
- **THEN** the hub opens or updates a Draft merge request linked to the Issue and reports that human specification review is required

#### Scenario: Generation fails
- **WHEN** artifact generation, commit, push, or merge-request creation fails
- **THEN** the hub records a terminal failure and leaves no lifecycle label implying that implementation is running successfully

### Requirement: GitLab-Owned Domain State
The hub SHALL derive change lifecycle state from GitLab Issues, labels, branches, and merge requests and SHALL NOT maintain a conflicting private lifecycle status as an independent source of truth.

#### Scenario: Hub restarts
- **WHEN** the hub restarts after a Draft merge request has been created
- **THEN** it reconstructs the change's domain state from GitLab while using local persistence only for delivery and job recovery
