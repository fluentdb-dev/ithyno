---
verdict: pass
reviewer: manager-hand-review
reason: copilot policy error on 2 attempts, Manager fallback per updated dispatch skill Section 1
---

# Review: hide-start-in-progress-column

## Findings
- no blocking issues found

## Verdict rationale

Diff cleanly implements the narrowed spec:

- `Kanban.tsx` — the header-action ternary that previously mounted `ParallelStartLauncher` for IN-PROGRESS now returns `null` for both IN-PROGRESS and DONE. TODO retains its `new-change` action. Import of `ParallelStartLauncher` correctly removed as unused. Column-title + count badge (`<h3>{title} <span>{count}</span></h3>`) inside `Column` untouched, as required.
- Extraction of `columnHeaderActionType()` and `perCardStartEligible()` as **exported pure functions** is a strong choice — the spec's intent is now testable at the unit level without wiring an entire Kanban render harness. Both functions match the spec's mental model.
- `Kanban.test.ts` — 8 new tests across 2 describe blocks. Coverage is per-scenario faithful:
  - TODO/IN-PROGRESS/DONE all three exercised for the header-action rule.
  - Per-card Start eligibility explicitly asserted unchanged (Requirement: Per-card actions are unchanged).
  - Job-running cases covered (any slot with a live job → not eligible).
- All automated checks pass: `openspec validate --strict`, 305 tests pass, typecheck clean, build clean.
- No accidental scope creep — per-card `Start` button rendering is untouched, matching the tightly narrowed spec.

Manual browser inspection (4.5-4.7) deliberately deferred to operator — acceptable, the code-level regression tests catch the logic.

Change is ready to archive.
