## 1. CLI Capability Research and Contracts

- [ ] 1.1 Convert the verified CLI findings in `docs/ideas/2026-10-06-agent-cli-command-builder-research.md` into sanitized parser fixtures for Claude Code, Codex, Agy, and Copilot.
- [ ] 1.2 Implement and test the verified model discovery paths (`agy models` and Codex app-server `model/list`) plus manual interactive fallback behavior for Claude Code and Copilot.
- [ ] 1.3 Define shared capability, field, model-discovery, conflict, and inspection-error response types used by the server and web UI.

## 2. Safe CLI Inspection Adapters

- [ ] 2.1 Implement an allow-listed adapter registry for Claude Code, Codex, Agy/Antigravity, and Copilot with command aliases, probe argv, field descriptors, serializers, and dispatcher-owned argument exclusions.
- [ ] 2.2 Implement bounded no-shell version/help/model probes with timeout, output cap, process termination, sanitized errors, and cache keys based on resolved executable plus version.
- [ ] 2.3 Add a local authenticated Agent-capabilities endpoint that accepts only supported adapter identifiers or recognized commands and never arbitrary probe argv.
- [ ] 2.4 Add adapter and endpoint tests for successful discovery, missing executables, timeouts, oversized output, malformed model output, and CLI-version flag differences on macOS/Linux and Windows command aliases.

## 3. Argument Parsing and Serialization

- [ ] 3.1 Implement per-adapter parsing of recognized builder fields from existing `args[]` while retaining unknown argv elements and their relative order.
- [ ] 3.2 Implement conflict detection and deterministic merging of edited structured values with preserved Advanced args.
- [ ] 3.3 Ensure prompt/non-interactive transport, change IDs, and artifact-contract values remain excluded from persisted builder args.
- [ ] 3.4 Add round-trip tests for quoted/space-containing values, repeated flags, `--flag=value`, unknown options, option values, empty args, and Windows paths.

## 4. Agent Configuration UI

- [ ] 4.1 Replace the primary whitespace Args input with CLI-aware controls for supported model, reasoning/effort, approval/permission, sandbox, and adapter-specific fields.
- [ ] 4.2 Add asynchronous inspection states for loading, unavailable executable, timeout, discovery failure, and manual model entry with CLI-specific model-check guidance.
- [ ] 4.3 Add a collapsible argv-aware Advanced args editor that preserves unsupported options and surfaces recognized-option conflicts.
- [ ] 4.4 Add an exact persisted command/argv preview and clearly identify dangerous approval or sandbox bypass selections.
- [ ] 4.5 Preserve the existing manual configuration experience for unknown commands and verify add/edit dialog focus, paste, and save behavior.

## 5. Verification and Documentation

- [ ] 5.1 Add component tests for each supported CLI, model-list/manual fallback states, dangerous-option warnings, conflict handling, and lossless edit/save behavior.
- [ ] 5.2 Add integration tests proving generated `agents.yaml` remains compatible with `AgentRegistry` and that runtime prompt injection is not duplicated.
- [ ] 5.3 Document the supported builder fields, how each CLI's models are discovered, version-dependent behavior, and the Advanced args fallback.
- [ ] 5.4 Run typecheck, unit tests, build, and strict OpenSpec validation.
