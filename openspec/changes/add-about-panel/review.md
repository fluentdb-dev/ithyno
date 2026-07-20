---
verdict: needs-rework
---

# Review: add-about-panel

## Findings
- [high] electron/src/main.ts:60 — The Electron shell hardcodes its own `sponsors` array instead of consuming the shared About payload/source, so adding a second sponsor entry server-side will **not** appear in the Help menu without editing Electron code. That violates the spec's extensible-sponsors scenario and the "single AboutInfo payload" requirement.
- [high] vscode-extension/src/extension.ts:310 — The VS Code About panel hardcodes repository/issues/releases/license URLs and its own `sponsors` array instead of deriving them from the extension manifest/shared About source. This diverges from the change tasks/spec, reintroduces cross-surface drift risk, and also breaks the requirement that new sponsor entries render on all surfaces without client-side changes.

## Verdict rationale
The web surface and basic About affordances are present, but the change does not fully realize the spec's shared-data contract. Two shells still duplicate About metadata instead of consuming a single source of truth, so required future scenarios — especially "append a sponsor entry with no client changes" and manifest-driven URL consistency — are not satisfied.
