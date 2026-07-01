---
tags: [feature/electron, feature/vscode-extension, area/server]
---

# Parallel shells: Electron + VS Code extension

OpenSpec UI's north-star is **UI-driven parallel agent execution in
isolated git worktrees**. The two shell-packaging changes
(`add-electron-shell`, `add-vscode-extension`) are the first real-world
test of that workflow: both are independent in scope, both want to land,
and both can run as separate agents in separate worktrees thanks to
`add-agent-runner`.

This document explains the moving parts and where to look.

## The three changes

| change | role |
|---|---|
| `prep-parallel-shells` | **This change.** Lays down workspaces, the `build:server` script, and gitignore entries so the two parallel runs do not collide on the root `package.json`. |
| `add-electron-shell` | Adds `electron/` — a desktop app shell that spawns the existing server and loads it in a BrowserWindow. Embedded terminal stays. |
| `add-vscode-extension` | Adds `vscode-extension/` — an extension that spawns the server and loads it in a webview, delegating the terminal to VS Code's terminal panel. |

## Shared substrate (already in place)

- `bin/openspec-ui.js` — both shells spawn this.
- `add-csrf-protection` — both shells consume the session-token launch URL.
- `add-agent-runner` — both shells will themselves be implemented by agents
  running in `.worktrees/add-electron-shell/` and
  `.worktrees/add-vscode-extension/`.

## Why this preparation exists

Before this change, both shell proposals quietly assumed they'd be the
only one adding `electron/` (or `vscode-extension/`) to the root
`workspaces` array. The first to merge wins; the second's `git merge`
hits a conflict on a single line. Pre-staging both entries up-front
removes that contention.

## Reading order

For someone new joining the parallel-shells story:

1. [Electron folder layout idea](../ideas/2026-06-29-electron-shell-folder-layout.md)
2. [add-electron-shell proposal](../../openspec/changes/add-electron-shell/proposal.md)
3. [add-vscode-extension proposal](../../openspec/changes/add-vscode-extension/proposal.md)
4. [add-agent-runner spec](../../openspec/changes/archive/) (once archived) or
   [add-agent-runner](../../openspec/changes/add-agent-runner/) while in flight
