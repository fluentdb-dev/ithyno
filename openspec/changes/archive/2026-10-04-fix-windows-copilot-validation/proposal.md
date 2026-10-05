## Why

Windows Electron sessions could start Copilot but did not reliably render its
full-screen terminal UI, scroll its timeline, invoke the OpenSpec-native Skill
names, or install portable notification hooks. Dispatch also risked creating a
worktree without uncommitted change artifacts, leaving workers without their
proposal or task contract.

## What Changes

- Make the Windows Electron terminal render and scroll Copilot's full-screen UI.
- Expose Copilot as a Manager choice and emit Copilot/OpenSpec-native Skill names.
- Install Copilot notification and pre-tool hooks without bypassing normal
  permission handling.
- Require dispatch and dispatch-multi to copy the complete change directory into
  each new worktree before starting workers.
- Cover the command mapping, Skill rendering, notification setup, and terminal
  compatibility behavior with tests.

## Capabilities

### New Capabilities

- `windows-copilot-integration`: Windows Electron support for Copilot terminal,
  OpenSpec Skills, and notifications.
- `dispatch-worktree-change-artifacts`: Complete change definitions in dispatched
  worktrees.

### Modified Capabilities

- `agent-manager`: Copilot can be selected as Manager and receives native Skill
  invocations.

## Impact

- Electron/Vite terminal packaging and input handling.
- Manager command generation and Copilot Skill rendering.
- Notification hook installation and PowerShell templates.
- Single- and multi-change dispatch instructions and templates.

