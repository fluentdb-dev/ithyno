## 1. CLI Capability Research and Contracts

- [x] 1.1 Convert the verified CLI findings in `docs/ideas/2026-10-06-agent-cli-command-builder-research.md` into sanitized parser fixtures for Claude Code, Codex, Agy, and Copilot.
- [x] 1.2 Implement and test the verified model discovery paths (`agy models` and Codex app-server `model/list`) plus manual interactive fallback behavior for Claude Code and Copilot.
- [x] 1.3 Define shared capability, field, model-discovery, conflict, and inspection-error response types used by the server and web UI.

## 2. Safe CLI Inspection Adapters

- [x] 2.1 Implement an allow-listed adapter registry for Claude Code, Codex, Agy/Antigravity, and Copilot with command aliases, probe argv, field descriptors, serializers, and dispatcher-owned argument exclusions.
- [x] 2.2 Implement bounded no-shell version/help/model probes with timeout, output cap, process termination, sanitized errors, and cache keys based on resolved executable plus version.
- [x] 2.3 Add a local authenticated Agent-capabilities endpoint that accepts only supported adapter identifiers or recognized commands and never arbitrary probe argv.
- [x] 2.4 Add adapter and endpoint tests for successful discovery, missing executables, timeouts, oversized output, malformed model output, and CLI-version flag differences on macOS/Linux and Windows command aliases.

## 3. Argument Parsing and Serialization

- [x] 3.1 Implement per-adapter parsing of recognized builder fields from existing `args[]` while retaining unknown argv elements and their relative order.
- [x] 3.2 Implement conflict detection and deterministic merging of edited structured values with preserved free-form args.
- [x] 3.3 Ensure prompt/non-interactive transport, change IDs, and artifact-contract values remain excluded from persisted builder args.
- [x] 3.4 Add round-trip tests for quoted/space-containing values, repeated flags, `--flag=value`, unknown options, option values, empty args, and Windows paths.

## 4. Agent Configuration UI

- [x] 4.1 Replace the primary whitespace Args input with CLI-aware controls for supported model, reasoning/effort, approval/permission, sandbox, and adapter-specific fields.
- [x] 4.2 Add asynchronous inspection states for loading, unavailable executable, timeout, discovery failure, and manual model entry with CLI-specific model-check guidance.
- [x] 4.3 Add a dedicated free-form args editor, explicit category disclosure indicators, and a read-only Advanced argv preview while preserving unsupported options and surfacing recognized-option conflicts.
- [x] 4.4 Add an exact persisted command/argv preview and clearly identify dangerous approval or sandbox bypass selections.
- [x] 4.5 Preserve the existing manual configuration experience for unknown commands and verify add/edit dialog focus, paste, and save behavior.

## 5. Verification and Documentation

- [x] 5.1 Add component tests for each supported CLI, model-list/manual fallback states, dangerous-option warnings, conflict handling, and lossless edit/save behavior.
- [x] 5.2 Add integration tests proving generated `agents.yaml` remains compatible with `AgentRegistry` and that runtime prompt injection is not duplicated.
- [x] 5.3 Document the supported builder fields, how each CLI's models are discovered, version-dependent behavior, and the free-form args fallback.
- [x] 5.4 Run typecheck, unit tests, build, and strict OpenSpec validation.

## 6. Structured field categorization and grouped UI

- [x] 6.1 Add category metadata to the shared server/web field contracts with deterministic ordering for Model, Reasoning, Permissions, Sandbox, Execution, Context, Tools & Access, Unattended / Dangerous, and Advanced.
- [x] 6.2 Show only populated categories, open Model and Reasoning by default, keep other normal categories collapsed, and keep the Unattended / Dangerous section independent and explicit.
- [x] 6.3 Preserve unknown argv exactly while previewing and saving the generated command and args array, and keep the final Advanced section as the last collapsible editor.
- [x] 6.4 Validate the category logic with focused unit/component tests for assignment, ordering, omission, open/closed state, dangerous separation, and lossless save behavior.

## 7. Catalog-only architecture and maintainer refresh

- [x] 7.1 Replace runtime inspection with a checked-in JSON capability catalog for Claude Code, Codex, Agy/Antigravity, and GitHub Copilot CLI.
- [x] 7.2 Add a maintainer-only generator script and npm script that require an explicit `--write` opt-in and prohibit runtime probing of user environments.
- [x] 7.3 Keep `/api/cli/capabilities` as a pure bundled lookup, preserving the existing `command` + `args[]` contract while keeping manual free-form args and editable model entry intact.
- [x] 7.4 Confirm runtime route and UI modules invoke no subprocess functions, while the explicit developer generator remains the only place that may probe the allow-listed installed CLIs.
- [x] 7.5 Strengthen drift coverage so the checked-in catalog is compared against both the server adapter definitions and the web adapter/category/danger definitions, while preserving deterministic bundle content for npm/Electron/VSIX packaging.
- [x] 7.6 Update design and documentation to explain the maintainer regeneration workflow and to state that end users are not scanned or inspected.
