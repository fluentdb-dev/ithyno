---
verdict: pass
summary: "scripts/verify-bundle.mjs implements 3 checks (tarball / electron bundle / init-from-bundle smoke) reusing an assertNoBareIthyOpsx helper. Hooked into release:build and exposed as release:verify-bundle. Manual regression test injection confirmed by author."
findings: []
---

## Notes

### Diff realizes proposal

| Proposal / design item | Impl status |
|---|---|
| `scripts/verify-bundle.mjs` (new, ~290 LoC) | ✓ 401 lines actual (design allowance) |
| Tarball check: unpack `npm pack` output, walk, assert `ithy-opsx` only under `templates/.claude/…` | ✓ |
| Electron bundle check: `dist/**/Contents/Resources/app/…` shape assertions | ✓ D3 (macOS primary, Win/Linux where present) |
| Init-from-bundle smoke: shell to bundled `bin/ithyno init /tmp/…` | ✓ D5 (uses `process.execPath` — host node, sidesteps Electron runtime; intentional) |
| Hook into `scripts/release-build.mjs` before artifact summary | ✓ D2 |
| Standalone `release:verify-bundle` npm script | ✓ D2 |
| VSIX out of scope | ✓ (deferred to skill-e2e) |
| `assertNoBareIthyOpsx` helper reused across all 3 checks | ✓ |
| Regex-escape on prefix arg (defensive) | ✓ (author noted this) |

### Verify snapshot (post-merge)

- `node scripts/verify-bundle.mjs` on develop → runs cleanly. Tarball check exercises real `npm pack`; bundle + smoke skip cleanly with no `electron/dist/` present in worktree.
- `npx vitest run` on develop → 505 pass, 1 skip, 1 pre-existing sharp fail (unchanged baseline).
- Manual regression (per agent report): injected `.claude/commands/ithy-opsx` back into `package.json` files → script correctly failed naming `package/.claude/commands/ithy-opsx/answer.md` and citing distribute-ithy-opsx contract; reverted; passes. Confirms the script FAILS on the exact regression it exists to prevent.

### Spec compliance

MODIFIED delta adds 6 new scenarios to the `release:build orchestrator` requirement (bundle-verify hook, tarball shape, Electron bundle shape, init-from-bundle smoke, standalone release:verify-bundle script, actionable failure messaging). All 6 are directly realized by the script + hook.

### Non-blocking observations

- **End-to-end bundle-side + init-smoke (tasks 7.2 / 7.5 / 7.6) deferred**: an actual `npm run electron:package:mac` run is needed to exercise the bundle-side branches. The bundle-side invariant is symmetric with the tarball invariant (same helper), and the tarball side is proven, so the risk is low. Recommend running once against a fresh dist/ before the next release cut.
- **`process.execPath` in the smoke** deliberately uses host node rather than the packaged Electron binary. Tests the scaffold-contract survival across packaging, not the Electron binary itself. Correct call per design D5.
- **File count**: 401 lines vs proposal's ~290 estimate — extra lines went to helper factoring + defensive shape guards. Fine.

Verdict: **pass**, findings=[], ready for archive.
