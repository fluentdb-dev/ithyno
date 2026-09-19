## ADDED Requirements

### Requirement: Durable Webhook Acceptance
The hub SHALL persist an accepted webhook's delivery identity and payload reference before acknowledging it, and SHALL perform GitLab API, git, and generation work outside the webhook request.

#### Scenario: Event accepted
- **WHEN** a verified supported webhook is received
- **THEN** the hub durably enqueues it and returns a successful response without waiting for downstream processing

### Requirement: Idempotent Delivery Processing
The hub SHALL deduplicate webhook retries using the strongest stable delivery identifier supplied by GitLab and a deterministic fallback for supported older versions.

#### Scenario: GitLab retries a delivery
- **WHEN** two requests carry the same idempotency or event identity
- **THEN** at most one set of externally visible side effects is produced

### Requirement: Recoverable Retry Queue
The hub SHALL record attempt count, next-attempt time, terminal error category, and a lease for each operational job, and SHALL recover expired non-terminal jobs after restart.

#### Scenario: Transient GitLab API failure
- **WHEN** processing fails with a retryable GitLab or network error
- **THEN** the job is retried with bounded backoff without duplicating completed side effects

#### Scenario: Retry budget exhausted
- **WHEN** a job exceeds its configured retry limit
- **THEN** it enters a terminal failed state and emits an operator-visible notification containing no secret values

#### Scenario: Hub stops while processing
- **WHEN** a job lease expires after an unclean hub shutdown
- **THEN** a subsequent hub process can safely reclaim and reconcile the job

### Requirement: Single-Writer Lease Safety
The default persistence adapter SHALL prevent two hub workers from holding the same job lease concurrently and SHALL refuse unsupported multi-replica operation.

#### Scenario: Second SQLite-backed replica starts
- **WHEN** another hub instance attempts to use the same single-writer deployment without a supported shared lease mode
- **THEN** startup fails with a diagnostic instead of processing jobs concurrently

### Requirement: Authenticated Workstation Event Stream
The hub SHALL expose an authenticated, versioned event stream for registered workstation servers and SHALL never place the GitLab bot credential or webhook secret in an event payload.

#### Scenario: Authorized workstation subscribes
- **WHEN** a workstation server connects with a valid hub subscription credential and compatible protocol version
- **THEN** it receives allowlisted project notifications with stable event type, project identity, title, body, and target URL fields

#### Scenario: Unauthorized subscriber
- **WHEN** a client connects without a valid subscription credential
- **THEN** the hub rejects the connection without emitting project data

### Requirement: Bounded Event Retention
The hub SHALL retain operational deliveries and notification events for a configurable bounded period and SHALL purge expired records without deleting GitLab domain resources.

#### Scenario: Retention expires
- **WHEN** an operational record is older than the configured retention period and has no active lease
- **THEN** the hub removes the record while leaving Issues, branches, and merge requests unchanged
