---
tags: [feature/vscode-extension, area/web, area/server]
---

## Why

Today the dashboard runs as a standalone CLI (`openspec-ui`) and a localhost
browser tab. That's good for power users but adds friction for VS Code users
who already have the project open in an IDE: switch windows, run a terminal,
remember the port. A VS Code extension fixes that — installation is a
Marketplace click, the dashboard opens inside the editor as a webview, and
the **workspace folder is automatically the OpenSpec project root**, no
picker required.

VS Code's extension host is Node.js with workspace + terminal APIs, so almost
the entire codebase ports over unchanged. The only structural decision is
**delegating the embedded terminal to VS Code's built-in terminal panel**,
which replaces our xterm.js pane in this delivery channel and uses the
familiar terminal users already have at the bottom of their editor.

## What Changes

Add a new `vscode-extension/` package that wraps the existing dashboard:

- **Activation**: on `openspecUI.show` command, the extension spawns the
  Fastify server (existing `server/index.ts`) on a random free port with
  `OPENSPEC_PROJECT_ROOT` set to the workspace folder, then creates a
  webview panel pointing at `http://localhost:<port>/`.
- **Webview**: hosts the existing React UI verbatim. A runtime flag
  (`acquireVsCodeApi` detection) toggles two things only:
  - The embedded `<Terminal />` component is not mounted.
  - `injectPty()` posts a message to the extension host instead of hitting
    `/api/pty/inject`.
- **Terminal delegation**: the extension creates (or reuses) a VS Code
  Terminal named "OpenSpec UI", `cwd` = workspace folder. On
  `pty.inject` messages from the webview, the extension calls
  `terminal.sendText(data, terminate)`. The user sees the command typed
  into VS Code's own terminal panel, exactly like our embedded one.
- **Distribution**: the package builds a `.vsix` via `vsce package`,
  side-loadable today; Marketplace publishing is later work.

The existing standalone CLI is **unchanged** and remains the production path
for non-VS Code users (and for the Electron shell if we ever ship one).

## Capabilities

### New Capabilities
- `vscode-extension`: VS Code extension lifecycle — activate, spawn server
  on a free port, open the webview pointing at the spawned server, dispose
  on deactivate

### Modified Capabilities
- `embedded-terminal`: terminal pane is rendered only when not running
  inside a VS Code webview; VS Code mode delegates to the editor's terminal
- `ui-orchestration`: `injectPty()` gains a runtime branch — posts a
  message to the VS Code extension when in a webview, hits the existing
  HTTP endpoint otherwise

## Impact

- New `vscode-extension/` workspace package with its own `package.json`
  (VS Code manifest), `src/extension.ts`, `src/server-spawner.ts`,
  `src/webview-html.ts`, and a `tsconfig.json`
- New top-level npm scripts for building / packaging the VSIX
- Devdeps: `@types/vscode`, `@vscode/vsce` (Marketplace packaging tool)
- `web/src/api.ts`: small `acquireVsCodeApi` detection + branch in
  `injectPty()`
- `web/src/App.tsx`: skip `<Terminal />` mount when runtime is VS Code
- Existing CLI (`bin/openspec-ui.js`) and standalone Fastify server: **no
  change**
