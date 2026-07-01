## ADDED Requirements

### Requirement: Diff Endpoint Per Job
The system SHALL expose `GET /api/agents/jobs/:id/diff` that returns the
structured diff of the agent job's branch against its merge-base with the
project's default branch, so the UI can render it without shelling out.

#### Scenario: Successful diff fetch
- **WHEN** a local client requests `/api/agents/jobs/:id/diff` for an existing job
- **THEN** the server returns `{ jobId, branch, base, files: [...] }` where each file has its kind, hunks, and stats

#### Scenario: Job has no commits yet
- **WHEN** the agent has not yet committed to its branch
- **THEN** the server returns an empty `files` array (not an error)

#### Scenario: Unknown job
- **WHEN** the requested job id does not exist
- **THEN** the server returns 404

### Requirement: Structured Diff Shape
The system SHALL produce diff payloads with per-file `kind` (added /
modified / deleted / renamed), unified hunks with line classification
(context / addition / deletion), and per-file stats.

#### Scenario: Modified file shape
- **WHEN** a file has both insertions and deletions in the diff
- **THEN** its descriptor reports `kind: "modified"`, contains hunks with `add` and `del` lines, and stats with non-zero `insertions` and `deletions`

#### Scenario: Renamed file shape
- **WHEN** a file is renamed
- **THEN** the descriptor reports `kind: "renamed"` with both `oldPath` and `newPath` set

#### Scenario: Binary file
- **WHEN** the diff touches a binary file
- **THEN** the descriptor reports `isBinary: true` with empty hunks

### Requirement: Per-job Diff Cache
The system SHALL cache the diff payload per job and SHALL invalidate the
cache when the job transitions between states, so repeated requests during
review are fast and the cache never serves stale data after a re-run.

#### Scenario: Cache hit
- **WHEN** the diff for a finished job is requested twice
- **THEN** the second request returns the cached payload without re-running `git diff`

#### Scenario: Cache invalidation on state change
- **WHEN** a job transitions from running to a terminal state after a diff was cached
- **THEN** the next request recomputes the diff

### Requirement: Hunk Truncation
The system SHALL cap the number of rendered lines per file at a configured
limit (default 5000) and SHALL mark the file as truncated so the UI can
surface a hint to view the full diff in a terminal.

#### Scenario: Large file diff truncated
- **WHEN** a file's diff exceeds the per-file line cap
- **THEN** the payload includes only the capped number of lines and a `truncated: true` flag on that file
