# Proposal: Add Session Expired Auto Recovery

## Why

When a session expires (due to PC sleep/wake, server restart, or network interruption), the dashboard currently renders a static text banner instructing the user to manually find the launch URL in their terminal logs.

This creates friction for operators across all distribution channels (Web, Electron, and VS Code extension). Users should be provided with direct, one-click recovery options ("Reload Dashboard" / "Reconnect") and shell-aware automatic token re-synchronization.

## What Changes

- Add a prominent primary "Reload Dashboard" action button to the `Session Expired` screen in `App.tsx`.
- In Electron (`isElectronShell()`), clicking "Reload Dashboard" triggers `window.location.reload()` or requests Electron main process to refresh the session token URL.
- In VS Code extension (`isVsCodeShell()`), clicking "Reload Dashboard" posts a message to the extension host to refresh the webview panel.
- In Standalone Web Browser, clicking "Reload Dashboard" executes `window.location.reload()`.

## Capabilities

- Modified: `dashboard`

## Impact

- `web/src/App.tsx`, `web/src/styles.css`
- `electron/src/preload.ts`, `electron/src/main.ts`
- `vscode-extension/src/extension.ts`
