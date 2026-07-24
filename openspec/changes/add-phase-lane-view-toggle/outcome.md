# Outcome — add-phase-lane-view-toggle

## ✅ Worked

- **Third toggle button + additive union**. Widening `OverviewLayout`
  from `"board" | "cards"` to `"board" | "phase" | "cards"` was a
  drop-in — no persist-schema-version bump, existing users keep their
  choice, the `setOverviewLayout` call sites all narrow correctly. The
  defensive `narrowOverviewLayout` helper (exported) both hardens
  `readOverviewLayout` and gives Overview.test.ts a pure function to
  cover all fall-back branches (unknown / null / undefined / empty).
- **Shared `<KanbanCard>` extraction**. Moving the per-card render body
  (previously the local `ChangeCard` inside `Kanban.tsx`) into a
  sibling `KanbanCard.tsx` was the cleanest way to satisfy the spec
  requirement that cards render identically across Board and Phase
  views. Bonus: the card now derives its own slot from
  `slotForChange()` instead of taking it as a prop — self-contained
  and the same rules whether it lives in a phase lane or a progress
  column.
- **Shared `useKanbanActions` hook**. The pending-modal state machine
  (`archive` / `apply` / `agent-merge` / `agent-discard`), the
  `jobByChange` map, and the `useStartFlow` wiring are all owned by a
  single hook that both boards call. Zero duplication of the modal
  block or the injectPty runner.
- **CSS reuse**. The Phase view's four lanes and the Unphased
  section's inner 3-column strip both reuse `.kanban-col*` classes
  verbatim, so the only new styles are the outer `.phase-lane-board`
  grid (with a 4→2→1 responsive collapse), the `.phase-lane-empty`
  muted placeholder, and the `.phase-unphased-section` chrome.
- **Test coverage**. Added `PhaseLaneBoard.test.ts` (8 cases exercising
  every branch of `bucketizeByPhase`, including the `needs-human`
  fall-through) and 7 new `narrowOverviewLayout` cases in
  `Overview.test.ts`. All 508 non-icons tests pass; icons test is the
  known-unrelated Node 25.8 `sharp` module-not-found from CLAUDE.md.

## ⚠️ Surprises

- **The current `Kanban.tsx` didn't import `ParallelStartLauncher`**
  even though the historical `add-kanban-phase-lanes` implementation
  did. I preserved the current behavior (no bulk-start launcher in
  either board) rather than reintroducing it. That's consistent with
  the spec's "Cards render identically to the Board view" — the Board
  view doesn't render it either.
- **The worktree HEAD was behind develop on session start.** The
  worktree was cut before the propose commit landed on develop, so
  `openspec/changes/add-phase-lane-view-toggle/` didn't exist until I
  ran `git reset --hard develop`. Documented here in case future
  invocations hit the same shape.

## 🔁 Differently

- **I'd extract the shared hook + card first**. On the second try I'd
  refactor `Kanban.tsx` into `KanbanCard.tsx` + `useKanbanActions.tsx`
  BEFORE writing `PhaseLaneBoard.tsx`, then let the new component fall
  out naturally. I did it in that order this time too, but under time
  pressure a first-pass tempted me to duplicate the modal block into
  the phase board. Extracting first is always cheaper than
  de-duplicating later.
- **The `slot` prop on `ChangeCard` was load-bearing** — I nearly
  passed a phase name into `slot` from the Phase view before
  realizing the card uses `slot` to decide Start/Archive visibility.
  Deriving the slot from `slotForChange(change)` inside the card
  keeps the caller from having to know these rules.

## 🌱 Follow-ups

- **Empty-state polish for a Phase view with zero unphased changes.**
  Right now every real workspace will show 4 phase lanes with all-
  empty bodies until phases are populated. Consider a first-time
  helper text in the top-right of the Phase view explaining "phases
  are set automatically as workers land artifacts (proposed → coded →
  reviewed → done)."
- **Keyboard navigation across the 3 tabs.** The tablist has three
  peer buttons but no `←/→` arrow-key wiring. Not a blocker for this
  change, but a future accessibility pass could add it.
- **Manual verification** (tasks 6.5–6.7) is best done by the Manager
  in the parent repo after merge — the worktree agent doesn't have a
  browser attached.
