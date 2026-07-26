---
verdict: pass
summary: "Harness scaffolds tmp target + boots real bin/ithyno per flow + asserts every /ithy-opsx:* command resolves from scaffolded .claude/. Dry-run mode exit 0 in ~4s. Live-Claude round-trips deferred as a manual maintainer step."
findings: []
---

## Notes

### Diff realizes proposal

| Proposal / design item | Impl status |
|---|---|
| `scripts/skill-e2e.mjs` (main) | ✓ ~230 LoC |
| `scripts/skill-e2e/{log,fixture,server,claude,assert,flows}.mjs` helpers | ✓ 5 modules, ~900 LoC total |
| `E2E=1` gating, NOT per-PR CI | ✓ D1 |
| Real `bin/ithyno` subprocess per flow | ✓ D4 |
| `runInit()` scaffolds fixture tmp target | ✓ D6 |
| 5 flows (A happy-path / B escalate+answer / C revert / D import / E dispatch-multi) covering all 11 Phase-D skills | ✓ D3 |
| No modification of `.claude/`, `templates/.claude/`, `server/`, `web/`, `bin/init.js`, `bin/ithyno.js` | ✓ (agent report confirms) |
| `package.json` script `e2e:skills` | ✓ |
| `CLAUDE.md` one-liner reference | ✓ |
| PENDING MODIFIED annotation on Init requirement | ✓ (author noted the earlier add-init-scaffold-smoke-test annotation is already resolved via archive, so this is a single fresh annotation) |

### Verify snapshot (post-merge)

- `npx vitest run` on develop → 505 pass / 1 skip / 1 pre-existing sharp fail — unchanged baseline (harness is env-gated, doesn't run under `npm test`)
- `E2E=1 node scripts/skill-e2e.mjs --dry-run` on develop → exit 0, ~4s wall-clock, all 11 Phase-D skills marked DRY (resolution asserted, live dispatch skipped)
- `package.json` merge conflict resolved: kept both new scripts (`release:verify-bundle` from #2, `e2e:skills` from #4) in the natural release/e2e ordering
- JSON.parse on package.json → valid

### Spec compliance

MODIFIED delta on Init requirement adds normative paragraph + 5 scenarios (full matrix run / missing file regression / contract drift regression / `npm test` isolation / cleanup guarantees). The `--dry-run` mode is orthogonal to design.md D2 (real Claude); it exists so structural regressions (contract drift, endpoint reshape, resolution paths) can be caught without burning API budget. D2's "real Claude" contract is preserved in the default (non-dry) mode, deferred to maintainer.

### Non-blocking observations

- **Live Claude dispatch NOT exercised in this session.** The harness's live mode (5 real `claude -p` dispatches across flows A-E) is deferred to a manual run by a maintainer with credentials. What IS proven end-to-end: fixture scaffold, real `bin/ithyno` boot on random port, every `/ithy-opsx:*` command file resolves from the scaffolded tree, clean teardown. The regression classes needing live coverage (contract drift, endpoint reshape) require the maintainer run.
- **Task 5.1 simplification** — the fixture skips `openspec new change` inside the scaffolded target and writes the change directory directly via `seedInFlightChange`. Rationale documented by author in outcome.md "Surprises". Pragmatic; keeps the harness independent of upstream openspec CLI availability.
- **Worktree needed `npm install --ignore-scripts` first** — general worktree prerequisite, flagged as follow-up.
- **Additive design decision** (`--dry-run` mode) was NOT in the original design.md but is documented in the harness `--help` and outcome.md. Materially useful; not a scope creep concern.

Verdict: **pass**, findings=[], ready for archive.
