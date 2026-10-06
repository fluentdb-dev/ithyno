## Why

Agent configuration currently exposes `args` as a whitespace-separated text field, forcing users to know each CLI's model, reasoning, approval, and sandbox flags and making quoting errors easy. ithyno should inspect the installed CLI and present a CLI-aware command builder while preserving an advanced escape hatch for options it does not understand.

## What Changes

- Add a CLI capability inspection layer for Claude Code, Codex, Antigravity CLI (`agy`), and GitHub Copilot CLI that runs bounded, argument-safe discovery commands and reports the installed version, supported builder fields, and discoverable models.
- Add a structured command builder to the Agent add/edit dialog for model, reasoning/effort, approval/permission, sandbox, and other supported CLI-specific options.
- Render an exact command/argument preview and serialize builder selections into the existing `agents.yaml` `command` and `args[]` fields without adding dispatcher-owned prompt or non-interactive flags.
- Preserve unrecognized and manually entered arguments through an Advanced args editor so upgrading ithyno does not erase valid CLI options.
- Treat live model discovery as optional: use CLI-provided model enumeration when available, otherwise allow manual model entry and show the CLI-specific way to inspect models interactively.
- Add timeout, output-size, and executable allow-list safeguards so capability inspection cannot become an arbitrary-command endpoint or block the dashboard.

## Capabilities

### New Capabilities

- `agent-cli-command-builder`: CLI-aware capability discovery and structured construction of Agent command arguments in the dashboard.

### Modified Capabilities

- None.

## Impact

- Agent configuration UI and its tests.
- Local server endpoints and CLI adapter modules used to inspect installed agent CLIs.
- `agents.yaml` argument parsing and round-trip behavior; the persisted schema remains compatible because generated values continue to use `command` plus `args[]`.
- Documentation for supported CLI fields, discovery limitations, and manual fallback behavior.
