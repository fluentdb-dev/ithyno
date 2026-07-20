---
verdict: needs-rework
---

# Review: add-release-build-workflow

## Findings
- [high] scripts/release-version.mjs:69 — The spec requires `release:version` to update the owned manifests atomically, but this implementation rewrites them one by one in place. If any later write fails (for example due to permissions, a full disk, or an interrupted process), earlier manifests stay on the new version while later ones stay old, leaving the repository in the partially bumped state the spec explicitly forbids.

## Verdict rationale
This change is close, but the coordinated version-bump helper still diverges from the release spec's atomicity requirement. Because a mid-write failure can leave the repository with mismatched manifest versions, the diff does not yet satisfy the required release contract and should be reworked before approval.
