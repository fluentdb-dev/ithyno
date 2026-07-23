## MODIFIED Requirements

### Requirement: Import endpoint generates openspec specs from code and docs

The system SHALL expose `POST /api/import/spec-generation` that, given a project root, dispatches a Claude Code sub-agent (via the Task tool inside the ithyno-side Manager session) to read the project's code and docs and produce a first-draft `openspec/specs/` set. The endpoint SHALL run preflight checks and hand the job off to Manager for execution. Completion is signaled via the existing workspace file-watch WS broadcast (not a subprocess SSE stream).

#### Scenario: Preflight blocks existing openspec/

- **WHEN** a client sends `POST /api/import/spec-generation` with `projectRoot: <path>` for a directory whose `openspec/` already exists
- **AND** the request body does NOT include `force: true`
- **THEN** the endpoint returns 409 with a clear message naming the existing `openspec/` path
- **AND** no generation job is dispatched

#### Scenario: Preflight blocks oversized projects

- **WHEN** the projectRoot has combined code + docs size above the configured cap (default 50 MB)
- **THEN** the endpoint returns 400 with the actual size and the cap
- **AND** no generation job is dispatched

#### Scenario: Successful dispatch

- **GIVEN** a projectRoot without `openspec/` under the size cap
- **WHEN** the endpoint accepts a `POST /api/import/spec-generation` request
- **THEN** it returns 202 with `{ jobId, targetPath }`
- **AND** the server injects `/ithy-opsx:import <targetPath>` into the ithyno-side Manager's PTY (using the same inject mechanism the Kanban Start button uses)
- **AND** the server does NOT spawn a `claude -p` subprocess
- **AND** no SSE endpoint is exposed for subprocess stdout — progress is observed via the workspace file-watch WS broadcast

#### Scenario: Completion is observed via workspace file watch

- **GIVEN** the Manager's Task-tool sub-agent has written `openspec/GENERATED.md` in the target project
- **WHEN** the server's workspace file watcher detects the write
- **THEN** the server broadcasts a `state-replaced` WS event as it does for any workspace change
- **AND** the dashboard reacts to that event: refetches state, exits the ImportProjectFlow overlay, transitions to the Kanban view of the newly-initialized project
- **AND** the dashboard renders the LLM-generated banner (unchanged from prior spec)

### Requirement: Import uses the ithyno tool's own agents.yaml

The import sub-agent SHALL be spawned via the Task tool inside the ithyno-side Manager's Claude Code session — the Manager itself is configured by ithyno's own `agents.yaml`. The target project (which by definition has no `agents.yaml`) is only the sub-agent's working directory, not its dispatch context.

#### Scenario: Target agents.yaml is not required

- **GIVEN** the target project has no `agents.yaml` (the common case for import)
- **WHEN** the import sub-agent is spawned
- **THEN** the spawn happens via Task tool inside Manager, using Manager's configured role (from ithyno's `agents.yaml`)
- **AND** no error is raised for the target's missing `agents.yaml`

#### Scenario: Manager session is required

- **GIVEN** ithyno's own Manager PTY is not running (e.g., ithyno's own `agents.yaml` is absent or terminal auto-launch was disabled)
- **WHEN** the client hits `POST /api/import/spec-generation`
- **THEN** the endpoint returns 503 with a message pointing at the missing Manager, and no dispatch is attempted

### Requirement: Import does not auto-commit

The import sub-agent SHALL leave the project's git working tree with the openspec/ files untracked or added (not committed). The user reviews and commits manually.

#### Scenario: No auto-commit

- **GIVEN** the import job has completed on a git-repo projectRoot
- **WHEN** the user inspects `git status` in that projectRoot
- **THEN** the `openspec/` tree and `openspec/GENERATED.md` appear as untracked files (or as `A`-marked staged files if the user pre-staged), and no new commit exists on the current branch attributable to the import
- **AND** the Task-tool sub-agent's boot prompt includes an explicit "DO NOT commit" instruction

## REMOVED Requirements

### Requirement: SSE stream of subprocess progress

**Reason**: The `POST /api/import/spec-generation` no longer spawns a `claude -p` subprocess whose stdout would be streamed. Progress is now observed via the workspace file-watch WS broadcast (see the new "Completion is observed via workspace file watch" scenario). The dedicated `GET /api/import/spec-generation/:jobId/events` SSE endpoint is removed.

**Migration**: dashboard `ImportProgress.tsx` replaces its EventSource consumer with a subscription to the existing WS `state-replaced` broadcast. No client-visible SSE endpoint remains.

## ADDED Requirements

### Requirement: `/ithy-opsx:import <target-path>` skill

The Manager's slash-command surface SHALL include a new skill `/ithy-opsx:import <target-path>` that, when invoked, uses the Task tool to spawn a code sub-agent whose boot prompt encodes the import task (target path + no-commit rule + capability-discovery guidance + `openspec init` + `openspec/specs/` write instructions + `openspec/GENERATED.md` marker write instruction).

#### Scenario: Skill invocation spawns a Task-tool sub-agent

- **GIVEN** Manager receives the string `/ithy-opsx:import /path/to/target` on its PTY
- **WHEN** Manager executes the skill
- **THEN** Manager calls Task tool with `subagent_type: "claude"` and a boot prompt tailored for the import task
- **AND** the sub-agent's `cwd` is `/path/to/target`
- **AND** the sub-agent's boot prompt includes the target path, the no-commit invariant, the capability-discovery guidance, and the `openspec/GENERATED.md` write instruction
- **AND** Manager's context is NOT flooded with the sub-agent's discovery Read/Grep/Bash calls — only the sub-agent's returned summary reaches Manager's context

#### Scenario: Sub-agent is autonomous

- **GIVEN** the import sub-agent has been spawned
- **WHEN** it needs to decide which docs / code files to sample for capability discovery
- **THEN** it uses its own Read / Grep / Bash tools to explore the target project autonomously
- **AND** the parent Manager does not receive per-file progress signals — Manager sees only the final summary
