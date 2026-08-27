---
id: fix-vsix-onboarding-theme
---

## Context

The VS Code extension has two webview HTML shells:

- `renderWebviewHtml` — the main dashboard iframe. Has `sendTheme()`, a
  `MutationObserver` on `document.body.classList`, and responds to
  `vscode:get-theme` requests from the iframe.
- `renderOnboardingHtml` — the "New Project" onboarding webview. Was missing
  all theme-forwarding code.

The React app's `useAppliedTheme` hook detects `isVsCodeShell()` via the
`?vscode=1` URL parameter, sets up a `vscode:theme-changed` listener, and
sends `vscode:get-theme` to `window.parent` to request the current theme.
Without a responding parent, `vsCodeTheme` stays `null` and the app falls back
to the OS `prefers-color-scheme` (light on most Windows machines), ignoring the
VS Code theme entirely.

## Goals

- The onboarding webview respects the active VS Code theme on open.
- Theme changes while the panel is open are reflected live.

## Non-Goals

- Changing the theme system itself or the React app's `useAppliedTheme` hook.

## Decisions

- Paste the same `sendTheme()` + MutationObserver + `vscode:get-theme` handler
  pattern from `renderWebviewHtml` directly into `renderOnboardingHtml`. Both
  shells have the same iframe structure; the pattern is small enough that
  extraction is not warranted.

## Risks

- None: purely additive script change in the parent HTML document.
