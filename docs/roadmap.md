# Implementation Roadmap

This is the implementation plan for ithyno. The current baseline version is
`0.8.1-alpha.1`. Detailed specifications and progress for individual features
are tracked in `openspec/changes/`; this document presents the overall product
status by phase.

---

## Phase 0 — Project Foundation

Goal: Start the local server and display the dashboard in a browser.

- [x] npm workspace project structure (server / web / Electron / VS Code Extension)
- [x] TypeScript and ESLint configuration
- [x] Fastify server and health check
- [x] Vite + React web client
- [x] CLI port resolution, server startup, and browser launch
- [x] Development scripts for the Vite development server and API server

**Completion criteria**: The application starts locally and displays the dashboard. — **Complete**

---

## Phase 1 — Read-only Dashboard

Goal: Parse `openspec/` and display specifications and progress.

- [x] Domain model
- [x] `tasks.md` parser and task-progress calculation
- [x] Parsing for proposals, designs, delta specs, and current specs
- [x] Workspace scanning for active changes and archives
- [x] Workspace state API
- [x] Overview page with change cards, progress bars, and overall summary
- [x] Change details with Tasks / Proposal / Design / Specs views
- [x] Specs browser
- [x] Archive, Tags, and Docs views
- [x] Fallback display for parse failures

**Completion criteria**: Open an OpenSpec project and accurately visualize its specifications and progress. — **Complete**

---

## Phase 2 — Bidirectional Synchronization

Goal: Update Markdown from UI actions and reflect external edits in the UI.

- [x] Surgical editing that replaces only the checkbox state
- [x] Unit tests protecting multiline tasks, indentation, and list markers
- [x] Optimistic locking with `baseHash` and `expectedText`
- [x] Task-update API
- [x] chokidar watcher with `awaitWriteFinish`
- [x] Echo suppression for server-originated writes
- [x] Incremental parsing and WebSocket notification for external edits
- [x] Client state and WebSocket event synchronization
- [x] Conflict handling that does not overwrite unrelated Markdown

**Completion criteria**: UI actions produce minimal Markdown diffs, and the UI follows external edits made by AI agents or other tools. — **Complete**

---

## Phase 3 — Dashboard UX

Goal: Handle everyday Change management from the dashboard.

- [x] Kanban, lane, and list views
- [x] Change search and filtering
- [x] Change creation, dispatch, archive, merge, and discard actions
- [x] Diff viewer
- [x] Archive list
- [x] External-edit and agent-execution status
- [x] Dark and light themes
- [ ] Comprehensive keyboard-navigation and accessibility review
- [ ] Additional validation of dialogs across window focus loss and recovery

**Completion criteria**: Core operations are implemented. Accessibility and window-state transitions remain under validation. — **Partially ongoing**

---

## Phase 4 — Distribution Clients

Goal: Use ithyno through either the VS Code Extension or Electron App,
depending on the user's environment.

- [x] Static serving of web build artifacts from the server
- [x] SPA fallback
- [x] VS Code Extension
- [x] Electron App
- [x] Project initialization UI and prerequisite detection
- [x] Build configuration for macOS, Windows, and Linux artifacts
- [x] GitHub Releases workflow
- [x] GitHub Pages documentation for installation, onboarding, and troubleshooting
- [ ] Continuous installation testing with release artifacts on each operating system
- [ ] Decide whether npm should become a supported end-user distribution channel

**Completion criteria**: Alpha artifacts can be produced. Validation on each operating system continues. — **Alpha available**

---

## Phase 5 — Multi-agent Execution

Goal: Allow a Manager to delegate an OpenSpec Change safely to role-specific
Workers.

- [x] Manager / code / review / verify configuration in `agents.yaml`
- [x] Manager terminal and single-prompt Worker execution
- [x] Change isolation through Git worktrees
- [x] Ordered code → review → verify execution and artifact contracts
- [x] Cross-CLI Worker execution through AgentRunner
- [x] Concurrent execution of different Changes in the same phase
- [x] CLI-specific Skill / Command / Workflow rendering from Claude-authoritative sources
- [x] OpenSpec and ithyno Skill management from Settings
- [ ] Final validation of native Codex subagent delegation and model selection
- [ ] Finalize the Agy `invoke_subagent` route and unsupported Manager → Agy routes
- [ ] Continuous regression tests for the Manager / Worker compatibility matrix

**Completion criteria**: Every route documented in the README is reproducible, and unsupported routes are rejected clearly before execution. — **Stabilizing**

---

## Phase 6 — Session and Execution Reliability

Goal: Preserve Manager and Worker state across reloads, project switches, and
long-running operations.

- [x] Manager PTY recreation when switching projects
- [x] Dashboard session port and token propagation
- [x] ithyno environment propagation when starting tmux
- [x] Worker completion waiting and artifact evaluation
- [x] Worktree-aware review and verify artifacts
- [ ] Continue validating credential boundaries between same-session recovery and new sessions
- [ ] Complete the separation of startup/no-response timeouts from Worker execution timeouts
- [ ] Improve UI diagnostics for cancellation, abnormal termination, and transport failures

**Completion criteria**: The system never uses a stale port or token, and the UI and logs distinguish running, timed-out, and failed states. — **Stabilizing**

---

## Next Candidates

- [ ] Expand GitHub Copilot support
- [ ] Add a development environment-variable manager powered by dotenvx
- [ ] Discover, install, update, and remove external Skills
- [ ] Add argument builders for individual agent harnesses
- [ ] Improve tmux configuration and operation through the GUI
- [ ] Verify and document communication between Claude Code sessions
- [ ] Assist with model, approval, and sandbox configuration for each agent CLI
- [ ] Add a test mechanism for Skill and agent-environment compatibility

---

## Future Considerations (After 1.0)

> **AI-drafted ideas:** This section was generated by AI from the current
> design and lessons learned during development. It does not represent accepted
> specifications or release commitments. Every item requires human review of
> its need, priority, and safety, followed by an OpenSpec proposal before
> implementation.

- Multi-repository dashboards and remote viewing.
- Multi-user collaboration with stronger concurrent-edit coordination.
- Editing requirement and scenario bodies.
- Visibility into agent execution history, models, cost, and duration.
- Extension points for external workflow providers and agent harnesses.
- Snapshots of the CLI, model, Skills, and configuration used for an execution,
  improving reproducibility and auditing at the Change level.
- Optional remote Workers and self-hosted runners while preserving local
  execution as the default.
- Shareable workflow templates with verified source, signature, and version
  metadata.

---

## 1.0 Decision Criteria

For 1.0, stability takes priority over the number of new features.

- The compatibility contracts for `agents.yaml`, Skills, artifacts, and
  Manager → Worker routing are stable.
- The documented initialization and multi-agent workflows can be reproduced in
  end-to-end tests.
- Installation and core operations are validated with macOS, Windows, and Linux
  artifacts.
- Migration instructions exist for configuration and generated files.
- Unsupported CLI routes and missing prerequisites are explained before
  execution.
