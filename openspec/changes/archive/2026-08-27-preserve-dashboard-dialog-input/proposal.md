## Why

Switching focus away from and back to the dashboard currently triggers an unconditional workspace refresh. In VS Code this can recreate the embedded webview, close an open dialog, and discard partially entered agent configuration; the same nested webview also does not provide a reliable paste path for dialog fields.

## What Changes

- Stop treating every window-focus or visibility-restoration event as a reason to reload workspace state or recreate the shell.
- Recover only when the dashboard is actually disconnected, and distinguish an explicit authentication rejection from a transient network failure.
- Preserve open dialogs and their unsaved input across ordinary focus changes in browser, Electron, and VS Code shells.
- Add a VS Code extension clipboard bridge so `Cmd+V` / `Ctrl+V` can paste into focused dashboard `input` and `textarea` controls inside the nested iframe.
- Add regression coverage for focus recovery decisions, dialog continuity, authentication outcomes, and clipboard message routing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ui`: Require ordinary focus changes and background session checks to preserve mounted dialogs and unsaved form input.
- `vscode-extension`: Require reliable clipboard paste into dashboard form controls hosted by the VS Code webview iframe.

## Impact

- Affects dashboard recovery logic in `web/src/App.tsx`, authentication checking in `web/src/api.ts`, and related store/UI tests.
- Affects the VS Code iframe bridge in `vscode-extension/src/webview-html.ts` and Extension Host message handling in `vscode-extension/src/extension.ts`.
- Uses the existing VS Code `vscode.env.clipboard` API; no new dependency or external API is introduced.
- Does not change server session-token generation, Electron session identity, or normal initial dashboard loading.
