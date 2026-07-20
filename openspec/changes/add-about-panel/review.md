---
verdict: needs-rework
---

# Review: add-about-panel

## Findings
- [high] vscode-extension/src/extension.ts:297 — The VS Code About panel reads `vscode-extension/package.json` instead of the shared root-derived AboutInfo source. Because that manifest carries its own description text, the VS Code panel will drift from the web/Electron About content and misses the cross-surface "same content" requirement.
- [high] server/about-config.ts:9 — The change explicitly keeps three parallel `about-config` copies that all need manual updates. That means appending a sponsor entry server-side will not reach Electron or VS Code without extra client edits, so the extensible-sponsors scenario and "single AboutInfo payload" contract are still unmet.
- [medium] LICENSE:1 — The repo-root LICENSE file begins with project-specific prose and subtree exceptions before the GPL body, so it is not the canonical GPL-3.0 text verbatim as required by the LICENSE scenario in this change.

## Verdict rationale
The About entry points are present, but the implementation still diverges from the spec in required behavior. The metadata is not actually sourced from one shared root-derived AboutInfo payload, the future sponsor-expansion scenario still requires per-surface code edits, and the LICENSE artifact does not match the canonical GPL text the change promises. Those are spec-level misses, so this change needs rework.
