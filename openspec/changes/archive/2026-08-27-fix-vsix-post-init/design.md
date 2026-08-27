---
id: fix-vsix-post-init
---

## Context

Three bugs were discovered post-archive of `fix-vsix-onboarding-theme` and
`fix-vsix-cli-path`:

### 1. `isVsCodeShell()` false in onboarding iframe

`renderOnboardingHtml` set `channel=vscode` in the URL but not `?vscode=1`.
`isVsCodeShell()` checks `?vscode=1` first, then `sessionStorage`. When the
separate onboarding panel loads, it has a fresh sessionStorage — so neither
check passes. `useAppliedTheme()` therefore never subscribes to
`vscode:theme-changed`, leaving the page white.

Fix: add `url.searchParams.set("vscode", "1")` in `renderOnboardingHtml` so
the iframe URL carries the flag.

### 2. Terminal not auto-launched after initialization

`NoProjectDecisionPanel` navigates the main webview iframe to
`/onboarding?channel=browser`. After initialization, `openProject("browser", target)`
does `window.location.href = /?dir=<encoded>` — an iframe-internal navigation.
The extension host never learns that initialization completed, so the terminal
auto-launch check (`workspaceHasAgentsYaml`) is never re-evaluated.

Fix: just before calling `openProject`, send `{type: "ithyno:init-complete"}` to
`window.parent`. The outer webview document forwards it via `vscode.postMessage`.
The main panel's `onDidReceiveMessage` handler auto-launches the terminal if
`agents.yaml` now exists. The iframe's own navigation is preserved unchanged.

### 3. PATH key casing (Windows)

`buildServerEnv()` read `env["PATH"]` directly. On Windows the key is often
`Path` (title case). The spread `{ ...process.env }` copies the original key
name, so `env["PATH"]` is undefined — `currentPath` becomes `""` — and the new
`env["PATH"]` entry contains only the additions, while `env["Path"]` still holds
the full original PATH. The child process receives both; behaviour depends on
which entry the Win32 process takes.

Fix: `Object.keys(env).find(k => k.toLowerCase() === "path") ?? "PATH"` to
locate and reuse the actual key name.

## Goals

- Onboarding webview respects VS Code theme on first load.
- Terminal auto-launches after project initialization without disrupting the
  iframe navigation that shows the initialized dashboard.
- PATH augmentation on Windows correctly extends the existing PATH without
  creating a duplicate entry.

## Non-Goals

- Changing the onboarding navigation flow from iframe-internal to a full
  webview reload.

## Decisions

- Send `ithyno:init-complete` on "Open Project" click (not on `isComplete`
  becoming true) so the terminal opens at the moment the user intentionally
  commits to the project — not while they might still be on the onboarding page.

## Risks

- `ithyno:init-complete` is a new message type. If future code adds a handler
  elsewhere that also listens for it, double-handling is possible. Low risk
  given the narrow surface.
