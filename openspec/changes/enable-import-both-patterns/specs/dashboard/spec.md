## MODIFIED Requirements

### Requirement: Import endpoint generates openspec specs from code and docs

The system SHALL expose `POST /api/import/spec-generation` that, given a project root, dispatches a Claude Code sub-agent (via the Task tool inside the ithyno-side Manager session) to read the project's code and docs and produce a first-draft `openspec/specs/` set. The endpoint SHALL run preflight checks (existing openspec/, size cap, path authorization, AND doctor readiness) and hand the job off to Manager for execution. Completion is signaled via the workspace file-watch WS broadcast; the response SHALL include the `pattern` classification ("A" when `targetPath !== PROJECT_ROOT`, "B" when equal).

#### Scenario: Preflight blocks existing openspec/

- **WHEN** a client sends `POST /api/import/spec-generation` with `projectRoot: <path>` for a directory whose `openspec/` already exists
- **AND** the request body does NOT include `force: true`
- **THEN** the endpoint returns 409 with a clear message naming the existing `openspec/` path
- **AND** no generation job is dispatched

#### Scenario: Preflight blocks oversized projects

- **WHEN** the projectRoot has combined code + docs size above the configured cap (default 50 MB)
- **THEN** the endpoint returns 400 with the actual size and the cap
- **AND** no generation job is dispatched

#### Scenario: Doctor gate — no agent CLI installed

- **GIVEN** the doctor reports `readyForManager: false`
- **WHEN** the client sends `POST /api/import/spec-generation`
- **THEN** the endpoint returns 409 with a message pointing at the doctor / Settings > Prerequisites
- **AND** no generation job is dispatched

#### Scenario: Successful dispatch — Pattern B (in-place)

- **GIVEN** `targetPath === PROJECT_ROOT` (the current ithyno session's project)
- **WHEN** the endpoint accepts a `POST /api/import/spec-generation` request
- **THEN** it returns 202 with `{ jobId, targetPath, pattern: "B" }`
- **AND** the server injects `/ithy-opsx:import <targetPath>` into the ithyno-side Manager's PTY
- **AND** the workspace file watcher already watches PROJECT_ROOT; the standard `state-replaced` broadcast fires on `openspec/GENERATED.md` creation

#### Scenario: Successful dispatch — Pattern A (external target)

- **GIVEN** `targetPath !== PROJECT_ROOT` (a different project)
- **WHEN** the endpoint accepts the request
- **THEN** it returns 202 with `{ jobId, targetPath, pattern: "A" }`
- **AND** the server registers an extra ProjectRootWatcher scoped to `targetPath` for the job's duration
- **AND** the server injects the slash-command into the Manager PTY as in Pattern B
- **AND** on marker detection at `targetPath/openspec/GENERATED.md`, the server broadcasts an `import-completed` WS event with `{ jobId, targetPath, pattern: "A" }` instead of `state-replaced`

## ADDED Requirements

### Requirement: `import-completed` WS event

The server SHALL broadcast a WS event `import-completed` with payload `{ jobId, targetPath, pattern: "A" | "B" }` when an Import sub-agent writes `openspec/GENERATED.md` at the target root. Dashboards SHALL subscribe and handle it per pattern.

#### Scenario: Pattern B — dashboard transitions to Kanban

- **GIVEN** the client receives `import-completed { pattern: "B", targetPath: <same as PROJECT_ROOT> }`
- **WHEN** the client handles it
- **THEN** the ImportProgress component (or store) triggers state refetch
- **AND** the dashboard transitions to Kanban with the LLM-generated banner (existing flow)

#### Scenario: Pattern A — dashboard shows a persistent notification

- **GIVEN** the client receives `import-completed { pattern: "A", targetPath: <different> }`
- **WHEN** the client handles it
- **THEN** an `<ImportedProjectNotification />` card is added to a top-right region
- **AND** the card contains: "Import complete for `<targetPath>`", an [Open imported project] button, and a [Dismiss] button
- **AND** clicking Open triggers the project-switch handler (Electron / VS Code) with `targetPath`; browser mode shows a copy-path fallback

### Requirement: Import job registry with TTL and concurrency cap

The server SHALL maintain an in-memory registry of active Import jobs. The registry SHALL cap concurrent jobs at 20; excess requests SHALL be rejected with 429. Abandoned jobs SHALL be cleaned up after a TTL of 1 hour.

#### Scenario: 20-job cap

- **GIVEN** 20 Import jobs are already in flight
- **WHEN** a client sends a 21st request
- **THEN** the endpoint returns 429 with a message naming the cap and the current count
- **AND** no dispatch occurs

#### Scenario: TTL sweep

- **GIVEN** a job has been in the registry for over 1 hour with no completion signal
- **WHEN** any new job is registered
- **THEN** the TTL-expired entry is removed and its watcher scope deregistered
