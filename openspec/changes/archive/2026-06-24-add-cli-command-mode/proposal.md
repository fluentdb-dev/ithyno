---
tags: [feature/cli-mode, feature/embedded-terminal, screen/change-detail]
---

## Why

The embedded terminal can host either Claude Code or a bare shell. Today the
dashboard's command buttons send only `/opsx:*` slash commands, which assume
Claude Code is the foreground process. When a user has just a plain shell open,
the injected text does nothing useful — and the user often cannot tell which
process is running in the terminal from the dashboard alone. We need a second
command style that targets the raw OpenSpec CLI, and we need the UI to make the
active mode obvious.

## What Changes

Add a **command style** preference to the dashboard with two modes:

- `claude` (default): the current behavior — `/opsx:propose`, `/opsx:apply`,
  `/opsx:archive`.
- `cli`: target the raw CLI — `npx openspec new change <id>` and
  `npx openspec archive <id>`. Apply has no direct CLI equivalent and is
  disabled in this mode with an explanatory tooltip.

Each command modal gains a small selector to switch modes per-action, and the
selection persists in localStorage as the default for future modals. The action
buttons display a badge with the active mode (`Claude` / `CLI`) so users see
which style they are about to invoke before opening the modal.

Server behavior is unchanged: `/api/pty/inject` writes whatever line the UI
sends. The decision of which command shape to send lives entirely in the UI.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `ui-orchestration`: the dashboard buttons gain a command-style selection
  (Claude slash commands vs OpenSpec CLI) with a persisted default, and the
  Apply action is disabled in CLI mode

## Impact

- Web store gains `commandStyle: 'claude' | 'cli'` with localStorage persistence
- `CommandModal` gains a mode selector and per-mode preview
- `Overview` New Change modal asks for a description in Claude mode and a
  kebab-case id in CLI mode (different shapes per mode)
- `ChangeDetail` Apply button disables in CLI mode with a tooltip; Archive
  button switches between `/opsx:archive` and `npx openspec archive`
- No server changes; no new dependencies
