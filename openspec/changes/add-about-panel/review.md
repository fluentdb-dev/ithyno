---
verdict: pass
---

# Review: add-about-panel

## Findings
- [low] vscode-extension/src/extension.ts:308 — The VS Code About panel still gets repository and issues links from the hardcoded `REPO_URL` fallback because `vscode-extension/package.json` does not declare `repository` / `bugs`. The links are correct today, but a future repo move would require a code edit instead of staying fully manifest-driven like the other surfaces.

## Verdict rationale
The implementation matches the required shipped behavior: the server exposes `/api/about`, the web dashboard shows the About button between the git identity chip and the connection indicator, Electron wires the native About panel plus Help-menu actions, and the VS Code extension provides a static `ithyno: About` webview with external links. I did not find any blocking correctness, security, or required-scenario gaps in the reviewed diff, so this change passes.
