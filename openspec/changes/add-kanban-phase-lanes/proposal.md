---
tags: [kanban, phase-workflow, ui, dnd-kit]
---

## Why

`add-phase-state-machine` shipped the phase substrate — persistence in
`.openspec.yaml`, the `GET/POST /api/changes/:id/phase` API, and a
`<PhaseControl>` `<select>` for manual transitions. It also landed
three UI requirements in `openspec/specs/dashboard/spec.md` that
describe the *target* end-state:

- **Kanban Phase Swim Lanes** — four lanes in pipeline order.
- **Manual Phase Transitions In The UI** — drag between lanes (primary)
  + Phase menu (secondary).
- **Legacy Fallback For Unphased Changes** — an Unphased section using
  the pre-existing `bucketize()` grouping.

The implementation deferred the layout work because replacing the
3-column layout with phase lanes is a ~500 LOC `Kanban.tsx` refactor
touching `bucketize()`, the `ColumnId` type, and the `@dnd-kit/core`
drop-target wiring. Landing it in the same commit as the backend
substrate would risk the whole substrate rolling back on a UI
regression.

This change closes that gap. It is *implementation-only* against
requirements that already exist in the current spec — no requirement
text needs to change. The one small ADDED requirement below pins down
a behavioral decision that the existing spec left implicit.

## What

- Replace the 3-column layout (TODO / IN-PROGRESS / DONE) with 4 phase
  swim lanes in pipeline order: **proposed → coded → reviewed → done**.
- Add an **"Unphased"** fallback section below the lanes that groups
  its members using the existing `bucketize()` (todo / inprogress /
  done sub-columns).
- Register every phase lane as a `useDroppable` drop target. Dropping
  a card into a different lane calls `setChangePhase(change.id, next)`.
- Support opting an unphased change into the phase system by dragging
  its card from the Unphased section into a phase lane.
- Preserve the `<PhaseControl>` `<select>` as the keyboard-accessible
  secondary transition affordance.
- Preserve per-card Start / Merge / Discard / Archive buttons; their
  behavior is independent of phase.

## Out of scope

- **Removing `<PhaseControl>`.** The `<select>` remains as the
  secondary transition path (existing spec calls for exactly this).
  Any accessibility polish beyond what's already there is deferred to
  `add-phase-menu-accessibility`.
- **Removing the drag-from-TODO-to-IN-PROGRESS start gesture.** The
  gesture goes away as a natural consequence of dropping the
  `ColumnId` bucketing — this is not a behavior the spec pins down —
  but Start is still one click via the existing card button. If we
  later want a "drag into `proposed` starts implementation" shortcut,
  it's a separate change.
- **Reserved-phase (`validated` / `verified`) treatment.** Deferred to
  Phase 4 (see `docs/ideas/2026-07-04-phase-gates-and-putback.md`).
- **The `needs-human` phase's visual treatment.** Deferred to
  `add-needs-human-phase` (this change is a strict prerequisite).
- **Vitest for `bucketize()` or the new phase bucketing.** The
  bucketing pure-function will get formal tests as part of
  `add-sidecar-tests` (already flagged as a follow-up).

## Sequencing

- **Preconditions:** `add-phase-state-machine` is merged (provides
  `Phase` type in `web/src/phases.ts`, `setChangePhase` in `api.ts`,
  the `<PhaseControl>` component, and the sidecar substrate).
- **Sequence within Phase 2:** ship this BEFORE `add-needs-human-phase`.
  Rationale: `add-needs-human-phase` will decide how to render an
  escalated card — that decision is cleaner when it can slot into a
  phase-lane layout than when it has to defer to the 3-column view.
- **After the phase branch is complete:** batch-merge
  `phase-workflow` → `main` (Phase 2 delivery boundary).

## Notes on spec impact

The three UI requirements already exist in
`openspec/specs/dashboard/spec.md` (lines 689, 708, 736 at time of
writing). No requirement text needs to change; this change makes the
implementation catch up. The single ADDED requirement below —
"Progress-Independent Phase Placement" — is a design decision worth
locking in as spec now that we're actually implementing it: a change
in `phase: done` sits in the `done` lane regardless of whether its
tasks are all ticked, and vice versa. Before this change, "done"
meant "progress complete"; after, it means "user marked done". Two
different concepts collide on the same word, and pinning this
distinction in spec keeps future changes honest.
