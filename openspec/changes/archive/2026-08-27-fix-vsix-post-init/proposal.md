---
id: fix-vsix-post-init
title: Fix VS Code onboarding theme detection and auto-launch terminal after init
status: implementing
tags: [feature/vscode-extension, area/windows]
---

## Why

Two issues remained after `fix-vsix-onboarding-theme`:

1. The onboarding iframe URL lacked `?vscode=1`, so `isVsCodeShell()` returned false
   inside the React app — `useAppliedTheme()` never subscribed to `vscode:theme-changed`
   and the page stayed white.

2. After a project is initialized from the "No OpenSpec project" decision panel,
   the VS Code extension had no way to know initialization completed — so the terminal
   was never auto-launched even though `agents.yaml` now existed.

A third fix addressed the PATH key-casing bug in `buildServerEnv()`: on Windows,
`process.env.PATH` may be stored as `Path`, so the previous code wrote a duplicate
`PATH` entry and left `Path` with the original full value — causing the augmented
additions-only entry to be unused or, worse, to shadow the original PATH.

## What Changes

- `renderOnboardingHtml`: adds `?vscode=1` to the iframe URL so `isVsCodeShell()` is
  true inside the onboarding page.
- `OnboardingProject`: calls `useAppliedTheme()` to apply `data-theme` on mount.
- `OnboardingProject`: "Open Project" click sends `ithyno:init-complete` to
  `window.parent` before navigating, letting the extension auto-launch the terminal.
- `renderWebviewHtml`: forwards `ithyno:init-complete` to the extension host.
- `extension.ts`: handles `ithyno:init-complete` — auto-launches terminal when
  `agents.yaml` now exists.
- `server-spawner.ts`: uses the actual PATH key name (case-insensitive search) to
  avoid creating a duplicate `Path`/`PATH` env entry.

## Capabilities

- Modified: `vscode-extension`
