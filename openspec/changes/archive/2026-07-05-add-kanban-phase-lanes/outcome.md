# Outcome — add-kanban-phase-lanes

## ✅ Worked

- **`Slot` vs. `DropTargetId` split.** Two coordinate systems modeled
  as distinct types kept the refactor honest: `Slot = Phase |
  UnphasedSubBucket` describes where a card *lives* (drives button
  visibility, ready-dot rendering), and `DropTargetId = Phase`
  describes what drop targets *are*. The old `ColumnId` conflated
  these — one string doing double duty for "which bucket" and "which
  drop target" — and the code fought back every time a case had to
  distinguish them. Removing the conflation shrank `onDragEnd` from
  20 lines of `fromCol`/`dropId` mapping to 8 lines.
- **`bucketize()` collapsed to a pure phase router.** No jobs, no
  progress, no per-change conditional cascade — just
  `isPhase(c.phase) ? b[c.phase].push(c) : b.unphased.push(c)`. The
  legacy progress-derived logic moved to
  `bucketizeByProgress()`, called only from the Unphased section.
  Two functions, two responsibilities. Vitest tests for both are
  ~50 lines total and cover the interesting cases directly.
- **Progress-Independent Phase Placement (the ADDED requirement)**
  falls out of the `bucketize()` shape almost for free — the
  function literally cannot consult progress because it doesn't
  receive `jobByChange` or peek at `.progress`. That makes the
  ADDED spec impossible to violate without a substantial rewrite,
  which is the invariant I wanted.
- **Unphased section as a full-width grid row.** Using
  `grid-column: 1 / -1` on `.kanban-unphased` inside the same
  `.kanban-board-phases` grid keeps the 4 phase lanes and the
  Unphased section in one layout container, so alignment stays
  clean across breakpoints. The Unphased section gets its own
  internal 3-column mini-grid for the todo/inprogress/done
  sub-buckets — matches the visual language the pre-existing
  layout established.
- **`<PhaseControl>` `<select>` needed zero changes.** It was
  already keyboard-accessible, already called `setChangePhase`,
  already stopPropagation'd its click. Preserving it as the
  secondary affordance was a no-op — the spec asked for it,
  add-phase-state-machine shipped it, this change just doesn't
  break it.

## ⚠️ Surprises

- **Removing `draggingFrom` state simplified the layout more than
  expected.** The old flow had per-column `allowedFrom` /
  `draggingFrom` props flowing through `<Column>` to render
  `.over-legal` / `.over-blocked` visual hints. With drop targets
  being freeform (any lane can accept any card), the entire visual
  cue mechanism collapsed into "the lane you're hovering over
  gets `.over-legal`" — one boolean from `useDroppable`'s `isOver`.
  I expected to keep `.over-blocked` for illegal drops but there
  ARE no illegal drops in phase view (except same-lane and
  outside-target, both of which are pointer-outside states that
  don't render feedback). Two CSS classes removed effectively.
- **The Start button visibility rules got less symmetric.** Before:
  Start shows on cards in TODO or IN-PROGRESS columns (progress
  states). After: Start shows on cards in any phase lane except
  `done`, PLUS the Unphased sub-buckets except `unphased-done`.
  Five slots to check instead of two. Not wrong — it accurately
  reflects "Start is legal until the user marks it done" — but the
  conditional in `ChangeCard` is uglier than the pre-refactor
  version. Could be extracted into a helper if it grows again.
- **`docs/ideas/2026-07-04-phase-gates-and-putback.md` sat
  untracked in the main tree from a prior session.** Left it
  alone — it's out of scope for this change and belongs to
  whatever was in flight when it was written. Anyone auditing
  the branch will see the untracked file and can decide.

## 🔁 Differently

- **Would test `<KanbanBoard>` with @testing-library/react.** The
  vitest coverage is bucketing-only (pure functions) because the
  test environment is `node`, not `jsdom`. A DOM-level test would
  catch layout regressions and the drag-drop-then-persist wiring
  end-to-end, but adding jsdom + testing-library to this change
  would triple the scope. Deferred to whenever `add-sidecar-tests`
  or a broader UI test setup lands.
- **Would consider consolidating the Unphased sub-bucket labels
  with the phase lane labels.** Right now Unphased says "Todo /
  In-progress / Done" (mixed case, legacy names) while the phase
  lanes say "PROPOSED / CODED / REVIEWED / DONE" (upper case, new
  vocabulary). A future pass could align them, but the visual
  distinction is intentional here — Unphased-Done ≠ Phase-Done
  and the naming reflects that.

## 🌱 Follow-ups

- **`add-needs-human-phase`** — the next change on
  `phase-workflow`. Now that the lane layout exists, the escalated
  card affordance can slot in without competing with a 3-column
  layout. Note that `bucketize()` here currently sends
  `phase === "needs-human"` to the Unphased section (because
  `isPhase()` returns false for it — needs-human is a
  `PersistedPhase` but not a `Phase`). `add-needs-human-phase` will
  either add a distinct row/badge affordance for these cards or
  extend `bucketize()` with an explicit "needs-human" bucket. The
  test in `Kanban.test.ts::bucketize` locks in current behavior
  so the follow-up change will visibly break it and force a
  decision.
- **`add-sidecar-tests`** — still open from add-phase-state-machine.
  Independent from this change but worth doing before
  `add-needs-human-phase` writes `priorPhase` / `escalatedAt` to
  the sidecar, since those tests are the regression net for the
  sidecar contract.
- **`add-phase-menu-accessibility`** — the `<PhaseControl>`
  `<select>` still doesn't render phase-color hints or transition
  history. Now that the lanes have concrete visual identities
  (dashed border for Unphased, solid for phases), the select could
  echo those cues.
- **Bulk phase transitions** — no user has asked, but the API
  supports it trivially and the drag gesture doesn't. Worth an
  idea note if it ever surfaces.

## Notes for the reviewer

- The refactor removed ~90 LOC from `Kanban.tsx` and added ~130
  (net +40 LOC), most of the growth in the new `<PhaseLane>` and
  `<UnphasedSection>` components which are small and single-purpose.
- CSS growth is confined to the new `.kanban-board-phases`,
  `.kanban-unphased*` rules; the pre-existing `.kanban-col*`
  classes are reused unchanged by `<PhaseLane>`.
- No server-side changes. The whole change lives in
  `web/src/components/Kanban.tsx`, `web/src/components/Kanban.test.ts`,
  and `web/src/styles.css`.
