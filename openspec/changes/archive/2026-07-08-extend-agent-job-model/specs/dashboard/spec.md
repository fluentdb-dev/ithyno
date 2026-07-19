## ADDED Requirements

### Requirement: Job Model Includes Role And Runtime

Every agent job SHALL carry `role: string` and `runtime: string` fields set at spawn time. The runner SHALL populate `role` from the agent definition's `role` field, `runtime` from the runtime name for runtime-backed agents, and `runtime = "legacy"` for command-based agents. For jobs synthesized by orphan adoption where no agent definition is available, the runner SHALL set `role = "orphan"` and `runtime = "unknown"`. These fields SHALL NOT change during the job's lifetime.

#### Scenario: role and runtime on a runtime-backed spawn
- **GIVEN** an agent defined as `{ runtime: claude, prompt: "…", role: code }`
- **WHEN** the runner starts a job for it
- **THEN** the job's `role` is `"code"` and `runtime` is `"claude"`

#### Scenario: legacy agent gets "legacy" runtime
- **GIVEN** an agent defined as `{ command: claude, args: […], role: apply }`
- **WHEN** the runner starts a job for it
- **THEN** the job's `role` is `"apply"` and `runtime` is `"legacy"`

#### Scenario: orphan adoption gets synthetic labels
- **GIVEN** the server adopts an orphan worktree with no matching agent definition
- **WHEN** the job is registered
- **THEN** the job's `role` is `"orphan"` and `runtime` is `"unknown"`

### Requirement: Job Model Includes Artifact Paths On Finish

When an agent job terminates (completed, cancelled, or crashed) the runner SHALL scan the job's worktree for changed and new files under `openspec/changes/<changeId>/` and SHALL populate the job's `artifactPaths: string[]` field with the discovered paths. While the job is still running, `artifactPaths` MAY be omitted or empty. Adopted orphan jobs SHALL NOT be scanned and their `artifactPaths` SHALL be omitted or empty.

#### Scenario: artifacts appear after completion
- **GIVEN** a job whose agent writes `openspec/changes/add-foo/review.md`
- **WHEN** the job finishes with status `completed`
- **THEN** the job's `artifactPaths` includes `openspec/changes/add-foo/review.md`

#### Scenario: no artifacts produced
- **GIVEN** a job whose agent produces no filesystem changes inside the change directory
- **WHEN** the job finishes
- **THEN** the job's `artifactPaths` is `[]` (or omitted)

#### Scenario: running job has no artifacts field
- **GIVEN** a job that is still `running`
- **WHEN** a client queries `/api/agents/jobs/:id`
- **THEN** the response's `artifactPaths` is either omitted or an empty array

#### Scenario: dispatch reads from Job
- **GIVEN** a wait=true dispatch to a role that produces an artifact
- **WHEN** the endpoint returns after the underlying job completes
- **THEN** the response's `artifactPaths` matches the job's `artifactPaths` field (the runner is the single source of truth; the dispatch endpoint does not re-scan)
