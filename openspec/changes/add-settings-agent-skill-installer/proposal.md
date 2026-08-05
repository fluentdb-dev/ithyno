---
tags: [feature/cross-cli, screen/settings, role/manager]
---

## Why

Even when an Agent CLI is installed, Settings cannot show whether OpenSpec and
ithyno skills are installed in the current project using that CLI's native
format. Users need a safe way to inspect each Agent CLI's skill state and
install only the missing or outdated components before running the Agent.

## What Changes

- Add project-local OpenSpec and ithyno skill status plus an action button to
  each Agent CLI row in Settings > Prerequisites.
- Open an Agent-specific dialog that shows the selected CLI, current OpenSpec
  and ithyno states, target paths, and planned operations before installation.
- Allow the user to select OpenSpec only, ithyno only, or both, and display
  progress, success, partial failure, diagnostics, and retry controls.
- Use the official OpenSpec CLI tool initialization for the selected Agent CLI
  and the existing cross-CLI renderer for ithyno's project-local output.
- Add Settings-facing APIs for per-Agent skill inspection and installation
  without writing outside the project or into a user's global skill locations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dashboard`: Add skill status, an installation button, and a confirmation and
  progress dialog to each Agent CLI row in Settings.
- `cross-cli-skill-installer`: Add a safe Settings-triggered reinstall path that
  invokes the existing renderer for one selected Agent CLI.

## Impact

- `web/src/pages/Settings.tsx`, a new skill installation dialog, and API/store
  types.
- Per-Agent skill-state inspection and authenticated local HTTP endpoints.
- OpenSpec CLI tool-adapter invocation and reuse of the existing
  `installSkills()` implementation.
- Tests for Settings, APIs, CLI-specific output paths, partial failures, and
  project-boundary enforcement.
- No change to Agent definitions in `agents.yaml`, Agent CLI installation, or
  vendor authentication.
