## 1. Per-Agent Skill Inspection

- [x] 1.1 Add shared types and a single Agent skill adapter table that maps
  doctor CLI names, OpenSpec tool names, ithyno renderer IDs, and expected
  output paths.
- [x] 1.2 Implement OpenSpec path inspection that returns
  `missing | partial | installed | unsupported` plus missing paths.
- [x] 1.3 Compare universal-source renderer output with project files and
  classify ithyno as
  `missing | partial | installed | update-available | unsupported`.
- [x] 1.4 Add unit coverage for adapter support, missing and partial output,
  content differences, and unsupported identifiers across every supported CLI.

## 2. Installation API and Execution Control

- [x] 2.1 Add `GET /api/agent-skills` and client types that report per-Agent
  OpenSpec and ithyno state for the current project.
- [x] 2.2 Add a `POST /api/agent-skills/install` SSE endpoint that accepts only
  `cli` and one or more `components`, with validation for invalid enums and
  unexpected path input.
- [x] 2.3 Run the official OpenSpec CLI with an argument array and invoke
  `installSkills()` for one renderer CLI, continuing with the other component
  if either one fails.
- [x] 2.4 Add a project-root-plus-CLI execution lock, progress,
  component-result, and done events, and a `success | partial | failed`
  aggregate result.
- [x] 2.5 Test API authentication, local-only enforcement, duplicate 409
  responses, partial failures, global-path isolation, and the guarantee that
  unselected renderers do not run.

## 3. Settings UI and Dialog

- [x] 3.1 Load Agent skill state when Settings mounts or refreshes and keep
  doctor failures independent from skill-inspection failures in the store and
  API client.
- [x] 3.2 Add OpenSpec and ithyno status to every Agent CLI row in
  Prerequisites, plus a `Manage skills` button for installed Agent CLIs, while
  excluding non-Agent rows.
- [x] 3.3 Add a dialog with selected installed CLI, project root, current
  states, output summary, OpenSpec and ithyno checkboxes, and Install and Cancel
  actions.
- [x] 3.4 Display SSE progress, component success and failure, partial success,
  and retry controls, then refresh the selected row without reloading the page.
- [x] 3.5 Match existing modal conventions for focus management, Escape and
  Cancel behavior, ARIA attributes, narrow-screen scrolling, and visible
  actions.

## 4. UI and Integration Tests

- [x] 4.1 Test Settings row state combinations, non-Agent rows, unknown state,
  and Refresh behavior.
- [x] 4.2 Test dialog defaults, component-only requests, unavailable actions for
  missing CLIs, SSE success and partial failure, retry, and post-completion
  refresh.
- [x] 4.3 Run Settings-triggered installation in temporary projects for each
  CLI and verify OpenSpec and ithyno paths, idempotent reruns, and project
  boundary enforcement.

## 5. Verification and Documentation

- [x] 5.1 Document Agent-specific skill inspection and reinstallation from
  Settings, including that the Agent CLI and authentication remain separate
  prerequisites.
- [x] 5.2 Run `npm run typecheck && npm test && npm run build`.
- [x] 5.3 Run
  `npm run openspec -- validate add-settings-agent-skill-installer --strict`
  and validate related specifications.
- [x] 5.4 Exercise every Agent row, dialog success and partial failure, and
  responsive behavior in the development server, then write `outcome.md`.
