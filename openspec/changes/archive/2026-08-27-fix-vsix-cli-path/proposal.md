---
id: fix-vsix-cli-path
title: Augment PATH in VSIX server so agent CLIs are discoverable
status: implementing
tags: [feature/vscode-extension, area/windows]
---

## Why

VS Code's Extension Host process does not source the user's shell profile
(`~/.bashrc`, PowerShell `$PROFILE`, etc.). On Windows this means directories
like `%APPDATA%\npm` (npm global bin — where `@anthropic-ai/claude-code` lands)
and `%USERPROFILE%\.local\bin` are absent from `process.env.PATH` in the
extension host. As a result `commandExistsOnPath("claude")` (which calls
`spawnSync("where", ["claude"])`) returns `false`, and `InitDialog` shows every
agent CLI as ○ (not installed) even when they are installed.

## What Changes

- `spawnServer()` augments the PATH it passes to the spawned ithyno server
  process with the common Windows user-level directories that the extension host
  omits.
- Non-Windows platforms are unchanged.

## Capabilities

- Modified: `vscode-extension`
