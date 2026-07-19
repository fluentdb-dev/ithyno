---
tags: [feature/init, area/vscode-extension]
---

# VS Code: ithyno: New Project command (webview onboarding)

## Why

`add-new-project-onboarding-window` (2026-07-19 archived) landed the
shared `/onboarding?target=<path>&channel=<c>` React page, with
`onboardingChannel.ts` already wired for `channel=vscode`. But the
follow-up it explicitly named (`add-vscode-new-project-command`)
was never opened. Today VS Code users have no in-editor path to
create a project — they must open a terminal, run `ithyno init`
manually, then `File → Open Folder…` back into VS Code.

This change closes that gap by adding a Command Palette entry
`ithyno: New Project` that:

1. Prompts for a target folder via `vscode.window.showOpenDialog`.
2. Spawns a short-lived ithyno server pointing at the target's
   **parent** directory (or the current workspace as fallback).
3. Opens a `WebviewPanel` loading the onboarding URL and forwards
   `onboarding-open` / `onboarding-close` postMessages between the
   iframed React app and the extension host.
4. On `onboarding-open`, calls
   `vscode.commands.executeCommand('vscode.openFolder', uri, false)`
   which reloads the current VS Code window pointed at the new
   project. The reloaded extension can then run
   `ithyno: Show Dashboard` normally.

This composes with `vscode-terminal-uses-project-session-id`
(landed today) — when the user then opens the dashboard and Runs
something in the terminal, the injected terminal exercises the new
`.ithyno/session-id` flow. So this change also verifies task 5.4 of
that change as a byproduct.

## What Changes

### 1. `ithyno.newProject` command

Contributed in `vscode-extension/package.json` alongside the
existing `ithyno.show`. Title: `ithyno: New Project`, category
`ithyno`.

### 2. Folder picker → target resolution

`vscode.window.showOpenDialog({
  canSelectFolders: true,
  canSelectFiles: false,
  canSelectMany: false,
  openLabel: 'Create ithyno project here',
  title: 'Select a folder for the new ithyno project',
})` returns the parent-or-target folder. Follow-up
`vscode.window.showInputBox({ prompt: 'Project name (leave empty
to use the selected folder as the project root)' })` lets the user
name a subdirectory. Empty input → the picked folder becomes the
target. Non-empty input → `<picked>/<name>` is the target.

Cancel at either step aborts silently.

### 3. Server spawn for the onboarding session

The existing `spawnServer` helper needs a `workspaceRoot`. For
onboarding, use the target's **parent directory** — the target
folder itself may not exist yet, and the server's project root is
irrelevant to the `/api/init/stream` endpoint (it's a stateless
orchestrator). If a dashboard-owned server is already alive for
the same workspace root, reuse it; otherwise spawn a temporary one
tied to the onboarding panel's lifetime.

### 4. Onboarding webview panel

New `renderOnboardingHtml(serverUrl, target)` in
`vscode-extension/src/webview-html.ts` (or sibling
`onboarding-html.ts`). Same iframe pattern as `renderWebviewHtml`
but the bridge forwards `onboarding-*` messages (not `pty.*`) in
both directions, and the iframe URL is
`<server>/onboarding?target=<path>&channel=vscode`.

Iframed React → parent `postMessage(onboarding-open|close)` →
`acquireVsCodeApi().postMessage(...)` → extension
`panel.webview.onDidReceiveMessage` handler.

### 5. Iframe-safe onboardingChannel

`web/src/lib/onboardingChannel.ts` currently checks
`typeof window.acquireVsCodeApi === "function"` before posting to
the VS Code host. Inside an iframe that check is false, so the
`vscode` branch never fires and it falls through to the browser
`?dir=…` navigation. Fix: when in an iframe (`window !==
window.parent`) AND `channel === "vscode"`, use
`window.parent.postMessage(msg, "*")` instead. The parent-side
bridge in `renderOnboardingHtml` forwards to the VS Code host.

### 6. Extension-side message handling

`panel.webview.onDidReceiveMessage`:

- `{ type: "onboarding-open", target }` → validate `target` is an
  absolute path under a real directory → `vscode.commands.
  executeCommand('vscode.openFolder', vscode.Uri.file(target),
  false)` → dispose the panel.
- `{ type: "onboarding-close" }` → dispose the panel.
- Any other type → ignore (defensive).

### 7. What this change does NOT touch

- **`ithyno.show` (dashboard command)** — unchanged.
- **Server code / `/api/init/stream`** — unchanged.
- **Onboarding React page** — only `onboardingChannel.ts`'s iframe
  branch changes; UI unchanged.
- **Electron / browser channels** — unchanged.
- **PTY terminal session-id logic** — this change only exercises it
  as a byproduct; the code lives in
  `vscode-terminal-uses-project-session-id`.
- **Auto-open dashboard after `openFolder`** — deferred. VS Code
  reloads clear extension state; a "show dashboard on next
  activation" flag would need workspace-level state. Left as a
  follow-up; users manually run `ithyno: Show Dashboard`.

## Spec deltas

- **`vscode-extension`** — **ADDED** `New Project Command` — the
  `ithyno.newProject` command, its folder-pick → server-spawn →
  onboarding-panel → openFolder flow, and its message contract.
- **`dashboard`** — **MODIFIED** `Onboarding Project Page` (only if
  the archived spec's `onboardingChannel` requirement fixes the
  iframe behavior; if it's captured as internal implementation
  only, no delta needed here — decide during impl).

## Impact

- **Affected specs**: `vscode-extension` 1 ADDED (possibly
  `dashboard` 1 MODIFIED — TBD)
- **Affected code**:
  - `vscode-extension/package.json`: `contributes.commands` +
    `activationEvents`
  - `vscode-extension/src/extension.ts`: `ithyno.newProject`
    handler + onboarding panel session
  - `vscode-extension/src/webview-html.ts` (or new
    `onboarding-html.ts`): `renderOnboardingHtml` bridge
  - `vscode-extension/README.md`: one paragraph on the new command
  - `web/src/lib/onboardingChannel.ts`: iframe-aware vscode branch
- **Risk**:
  - **`vscode.openFolder` reloads the extension host** — the
    onboarding panel's `dispose()` might race the reload. Order:
    dispose first, then executeCommand. Same pattern as extensions
    that use `openFolder`.
  - **Short-lived server survives openFolder** — reload SIGKILLs
    the extension process; `panel.onDidDispose` triggers our
    `server.dispose()`. Verify during impl that the SIGTERM lands
    before the process dies.
  - **Absolute-path validation** — `onboarding-open`'s `target`
    comes from the webview (untrusted-ish). Validate: must be
    absolute + parent must exist + must not contain traversal
    tokens. If invalid, `showErrorMessage` and don't openFolder.
- **Migration**: none.

## Related

- `openspec/changes/archive/2026-07-19-add-new-project-onboarding-window/`
  — the parent that named this as follow-up.
- `openspec/changes/archive/2026-07-19-add-electron-new-project-flow/`
  — the Electron equivalent this mirrors.
- `openspec/changes/archive/2026-07-19-vscode-terminal-uses-project-session-id/`
  — session-id smoke test this change exercises.
