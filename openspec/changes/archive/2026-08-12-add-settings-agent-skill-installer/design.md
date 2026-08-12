## Context

Settings > Prerequisites reports whether each Agent CLI executable is present,
but it does not show whether that CLI's OpenSpec and ithyno skills are installed
in the current project. Initialization already runs the OpenSpec CLI and
`installSkills()` in sequence, but existing projects have no explicit UI or API
for rerunning the same operations.

Skills are shared by a project and CLI type, not by Agent name. If several
entries in `agents.yaml` use the same `command`, they all read the same
project-local files. The Settings operation therefore belongs to each unique
Agent CLI row in Prerequisites rather than to each configured Agent instance.

## Goals / Non-Goals

**Goals:**

- Show project-local OpenSpec and ithyno skill state for every Agent CLI.
- Let users select components and confirm the target and output locations before
  reinstalling them.
- Reuse the official OpenSpec initialization path and the existing cross-CLI
  renderer.
- Preserve useful progress and diagnostics for partial failures.
- Make repeated installation safe and idempotent.

**Non-Goals:**

- Installing Agent CLI executables or automating vendor authentication.
- Writing to global OpenSpec, ithyno, Codex, or Claude skill locations.
- Adding, deleting, or changing Agent roles in `agents.yaml`.
- Editing skill bodies from Settings.
- Bulk installation across multiple projects or every CLI at once.

## Decisions

### D1 — The operation targets a CLI type, not an Agent instance

Each Agent CLI row in the existing Prerequisites table receives separate
OpenSpec and ithyno status badges. Rows whose CLI executable is installed also
receive a `Manage skills` button. Multiple Agents that use the same CLI share
the same project-local files, so the UI does not duplicate the action for every
Agent name.

Putting the button on each configured row in the Agents tab was considered but
rejected because it would duplicate operations for the same CLI and would make
repair unavailable when `agents.yaml` has not yet been configured.

### D2 — Server-side CLI adapters own inspection and writing

A new service maps doctor CLI names to OpenSpec tool names and ithyno renderer
IDs. It returns `missing | partial | installed | update-available |
unsupported` and checks at least:

- OpenSpec: the required command or prompt paths produced by the selected tool
  adapter.
- ithyno: presence and byte equality of files rendered from the universal skill
  sources.

Settings does not duplicate upstream OpenSpec prompt bodies. Installation runs
the bundled OpenSpec CLI as `init <project-root> --tools <tool>` using an
executable plus argument array. ithyno installation calls
`installSkills({ projectRoot, selectedClis: [cli] })`.

### D3 — Separate the inspection API from the SSE installation API

- `GET /api/agent-skills` returns both component states, inspection time, and
  project identity for every supported CLI.
- `POST /api/agent-skills/install` accepts `{ cli, components }` and emits
  `progress`, `component-result`, and `done` SSE events.

The server validates `cli` and `components` against fixed enums. It never
accepts the project root from the request and always uses the current server
project. Subprocesses use executable and argument arrays rather than shell
command strings.

### D4 — One dialog state machine covers selection, execution, and results

The dialog displays the selected installed CLI, current OpenSpec and ithyno
states, project root, and an output-path summary, with both components selected
by default. When the CLI executable is missing, inspection reports both
components as unsupported and Settings does not offer the installation action.

Inputs are locked during execution while per-component progress is appended.
Failure of one component does not stop the other component. The final UI and
API result distinguish `success | partial | failed`. After success or partial
success, the client refetches the inspection API and updates the Settings row
without reloading the page.

### D5 — OpenSpec and ithyno retain separate success contracts

OpenSpec succeeds only when the official CLI exits successfully and expected
paths pass reinspection. ithyno succeeds according to `InstallResult` followed
by expected-content reinspection. The presence of one component is never used
as evidence that the other succeeded, preserving meaningful component-only
installation and partial-failure reporting.

## Risks / Trade-offs

- **Upstream OpenSpec adapter paths may change** → Centralize tool names and
  expected paths in one adapter table and cover every supported CLI with
  fixtures.
- **Installation may update user-edited generated files** → Show the targets in
  the dialog and follow the existing ithyno renderer conflict rules and the
  official OpenSpec CLI update behavior.
- **An SSE disconnect may hide the final result** → Let the server operation
  complete and make final state recoverable through the inspection API.
- **Skill files can remain after the CLI executable is removed** → Report the
  components as unsupported and withhold the installation action until the CLI
  is installed and authenticated again.
- **Concurrent installs can race** → Allow only one operation per project root
  and CLI; reject duplicates with HTTP 409.

## Migration Plan

No automatic migration runs for existing projects. Inspection reads the files
already present and reports only missing or outdated components. Regeneration
occurs only after the user confirms a selected CLI and component set. Rolling
back the feature removes the UI and APIs; previously generated project-local
skills remain usable by their Agent CLIs.

## Open Questions

None.
