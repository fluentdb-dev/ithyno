---
id: fix-vsix-onboarding-theme
title: Fix VS Code theme not forwarded to onboarding webview
status: done
tags: [feature/vscode-extension, area/ui]
---

## Why

`renderOnboardingHtml` (used by the `ithyno.newProject` command's webview panel)
was missing the VS Code theme bridge script that `renderWebviewHtml` has. The
React app inside the iframe sends `vscode:get-theme` requests and listens for
`vscode:theme-changed` messages, but the onboarding shell silently dropped these
messages. As a result the UI always rendered in the system OS theme (typically
light / white) regardless of the VS Code theme setting.

## What Changes

- `renderOnboardingHtml` gains the same `sendTheme()` helper and MutationObserver
  that `renderWebviewHtml` already has.
- The message handler now responds to `vscode:get-theme` from the iframe before
  passing `onboarding-open` / `onboarding-close` messages to the extension host.

## Capabilities

- Modified: `vscode-extension`
