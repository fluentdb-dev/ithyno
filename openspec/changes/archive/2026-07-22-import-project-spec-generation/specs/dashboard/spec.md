## ADDED Requirements

### Requirement: Import endpoint generates openspec specs from code and docs

The system SHALL expose `POST /api/import/spec-generation` that, given a project root, dispatches an LLM-driven subagent to read the project's code and docs and produce a first-draft `openspec/specs/` set. The endpoint SHALL run preflight checks and stream progress via SSE.

#### Scenario: Preflight blocks existing openspec/

- **WHEN** a client sends `POST /api/import/spec-generation` with `projectRoot: <path>` for a directory whose `openspec/` already exists
- **AND** the request body does NOT include `force: true`
- **THEN** the endpoint returns 409 with a clear message naming the existing `openspec/` path
- **AND** no generation job is dispatched

#### Scenario: Preflight blocks oversized projects

- **WHEN** the projectRoot has combined code + docs size above the configured cap (default 50 MB)
- **THEN** the endpoint returns 400 with the actual size and the cap
- **AND** no generation job is dispatched

#### Scenario: Successful generation

- **GIVEN** a projectRoot without `openspec/` under the size cap
- **WHEN** the endpoint accepts a `POST /api/import/spec-generation` request
- **THEN** it returns 202 with `{ jobId, estimatedContextBytes, scanCounts, filesToScan }`
- **AND** an LLM subagent is dispatched to read the project and write `openspec/specs/`
- **AND** progress is streamable via `GET /api/import/spec-generation/:jobId/events` (SSE)

### Requirement: Generated specs validate cleanly

Every capability spec.md written by the import subagent SHALL be valid OpenSpec — passing `openspec validate --all --strict` without modification.

#### Scenario: Generated specs pass validation

- **GIVEN** a completed import job for a projectRoot
- **WHEN** `openspec validate --all --strict` is invoked in that projectRoot
- **THEN** the exit code is 0
- **AND** at least one capability spec.md exists under `openspec/specs/`

### Requirement: Import banner + GENERATED marker

The dashboard SHALL surface a persistent, dismissible banner after import completes indicating the specs are LLM-generated drafts. The generated tree SHALL include a top-level `openspec/GENERATED.md` recording the generation.

#### Scenario: Post-import banner

- **GIVEN** the import job has just completed for the current project
- **WHEN** the dashboard transitions to the Kanban view of the newly-initialized project
- **THEN** a top-of-page banner reads "Specs are LLM-generated drafts — review before relying on them"
- **AND** the banner has a dismiss button that hides it for the current session

#### Scenario: GENERATED.md marker

- **GIVEN** a completed import job
- **WHEN** a reader opens the project's `openspec/GENERATED.md`
- **THEN** the file exists and includes: a header noting LLM generation, the timestamp of generation, and a list of every capability directory that was drafted

### Requirement: Import does not auto-commit

The import subagent SHALL leave the project's git working tree with the openspec/ files untracked or added (not committed). The user reviews and commits manually.

#### Scenario: No auto-commit

- **GIVEN** the import job has completed on a git-repo projectRoot
- **WHEN** the user inspects `git status` in that projectRoot
- **THEN** the `openspec/` tree and `openspec/GENERATED.md` appear as untracked files (or as `A`-marked staged files if the user pre-staged), and no new commit exists on the current branch attributable to the import

### Requirement: Import uses the ithyno tool's own agents.yaml

The import subagent SHALL be dispatched using the ithyno tool's own `agents.yaml` — NOT the target project's (which by definition doesn't have one). The generation runs on the ithyno-side Claude Code session, not on the target project's session.

#### Scenario: Target agents.yaml is not required

- **GIVEN** the target project has no `agents.yaml` (which is the common case for import)
- **WHEN** the import subagent is dispatched
- **THEN** the dispatch uses the ithyno installation's own `agents.yaml` code role
- **AND** no error is raised for the target's missing `agents.yaml`
