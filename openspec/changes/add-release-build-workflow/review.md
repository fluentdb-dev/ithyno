---
verdict: needs-rework
---

# Review: add-release-build-workflow

## Findings
- [high] scripts/release-version.mjs:37 — `release:version` treats `vscode-extension/host/package.json` as one of the four required source manifests, but this change never adds that file to git and `.gitignore` ignores the whole `vscode-extension/host/` tree. On a clean checkout the file does not exist, so the documented first release step (`npm run release:version -- <next-version>`) fails immediately and the "all four owned package.json files agree" requirement is not actually satisfied by the diff.

## Verdict rationale
The release workflow is close, but the diff still misses a core spec requirement: it promises a coordinated version source across four owned manifests and a `release:version` helper that updates them, yet one of those manifests is not part of the repository and is ignored on fresh clones. Because that makes the documented release flow fail before any build starts, this change should remain at needs-rework.
