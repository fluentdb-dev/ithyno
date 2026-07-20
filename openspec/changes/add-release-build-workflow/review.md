---
verdict: needs-rework
---

# Review: add-release-build-workflow

## Findings
- [high] scripts/release-build.mjs:33 — `release:build` never runs the Electron workspace build before packaging, but `electron/package.json` expects compiled files under `electron/out/` (`main: "out/main.js"` and `build.files: ["out/**/*", ...]`). On a clean checkout/CI runner, `electron/out/main.js` is absent, so this workflow cannot reliably produce a working Electron artifact and does not meet the spec's clean-checkout release-build scenario.
- [medium] scripts/release-version.mjs:45 — the coordinated bump helper skips `vscode-extension/host/package.json` when it is missing and then writes the remaining manifests in place one by one. That diverges from the spec/proposal requirement that `release:version` update all four owned manifests atomically; on a fresh clone it updates only three, and any later write failure would leave a partial version bump behind.

## Verdict rationale
The change covers most of the requested release workflow, but two blocking spec mismatches remain: the root release orchestrator does not include the Electron compile step needed for clean-checkout packaging, and the version-bump helper does not satisfy the promised all-four-manifests atomic update behavior. Because those gaps affect the core release scenarios this change is supposed to guarantee, the review should stay at needs-rework.
