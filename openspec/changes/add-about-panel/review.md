---
verdict: needs-rework
---

# Review: add-about-panel

## Findings
- [high] web/src/components/AboutModal.tsx:52 — The topbar About modal is rendered on the VS Code shell too, but its actions always call `window.open(...)` from inside the dashboard iframe. In this shell the React app cannot call `vscode.env.openExternal` directly, and the extension bridge only forwards `pty.*` messages, so the new VS Code topbar About entry does not have a reliable path to open Repository / Issues / Sponsor / Updates / License links as required.

## Verdict rationale
The shared payload, web modal, Electron menu, and standalone VS Code About command are all present, but the implementation still misses one required cross-shell scenario: the web dashboard About button is supposed to work on all shells, including VS Code. Because the dashboard iframe never hands external-link actions to the extension host, this path can fail specifically on the VS Code surface, so the change still needs rework before it fully matches the spec.
