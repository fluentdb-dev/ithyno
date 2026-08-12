---
tags: [dashboard, kanban, ui, phase, toggle, restore]
execution: worktree
---

## Why

The Overview page currently exposes a two-state layout toggle
(`board` / `cards`) via the existing `overviewLayout` store field.
The `board` state renders the Kanban in three columns —
TODO / IN-PROGRESS / DONE — driven by progress. Phase state
(`change.phase`) is deliberately hidden per the Kanban's
"3 columns only" principle established by `revert-kanban-ui-lanes`
(2026-07-15).

The phase-lane rendering that once existed (delivered by
`add-kanban-phase-lanes` at commit `3e4a60f`) — **4 swim lanes in
pipeline order `proposed → coded → reviewed → done` plus an
"Unphased" fallback section** — was removed from the UI but the
underlying data model was preserved: server-side phase state
(`.openspec.yaml` sidecar, `GET/POST /api/changes/:id/phase`,
needs-human artifact + escalation API) is untouched and every
change still carries `phase` / `priorPhase` / `escalatedAt` on
its `Change` type.

Some workflows genuinely benefit from seeing the pipeline view —
"how many changes are stuck in `reviewed` waiting on verify?" is
a natural question the 3-column view can't answer. The revert
was right about the DEFAULT, not about eliminating the phase view
entirely.

This change reintroduces the phase-lane rendering as a **third
option on the existing `overviewLayout` toggle**, alongside the
current `board` and `cards`. Default remains `board` (the 3-column
progress-derived view established by `revert-kanban-ui-lanes`) so
the principle is preserved for the majority workflow. Users who
want the pipeline view opt in with one click.

Non-goal explicit at user's direction: **no needs-human
WaitBadges**, **no other phase-derived affordances**. The `phase`
option is purely a display format — the same cards, grouped and
ordered differently. Internal processing / server behavior / event
handling all unchanged.

## What Changes

### Store field — extend existing toggle

- Extend `overviewLayout` in `web/src/store.ts` from
  `"board" | "cards"` to `"board" | "phase" | "cards"`.
- The store's persistence (currently `zustand/middleware` persist)
  continues to persist the value across reloads — same mechanism
  as the existing 2-state toggle. NO new storage decision.
- Migration: legacy persisted values of `"board"` or `"cards"`
  continue to resolve. Any unknown persisted value falls back to
  `"board"` (already the default).

### Overview page toggle — add third button

- `web/src/pages/Overview.tsx`: add a third `<button role="tab">`
  inside the existing `.layout-toggle` control, positioned between
  the existing `board` and `cards` buttons in the tabstop order.
- Icon: a stacked-columns icon distinct from the existing `board`
  and `cards` glyphs (4 vertical bars of equal height suggests
  pipeline lanes; final visual asset chosen at impl time).
- `aria-label`: `"Phase lanes layout"`. `title`: `"Phase lanes"`.
- When active (`overviewLayout === "phase"`), render
  `<PhaseLaneBoard changes={visibleChanges} onNewChange={...} />`
  instead of `<KanbanBoard />` and instead of the card grid.

### Phase-lane rendering — restore from history

- Reintroduce the phase-lane rendering code that
  `revert-kanban-ui-lanes` removed. Reference implementation:
  commit `3e4a60f` (impl of `add-kanban-phase-lanes`) —
  `web/src/components/Kanban.tsx` had the `PhaseLane`,
  `UnphasedSection`, `PHASE_LABEL`, `PHASE_EMPTY`, and phase
  branches of `bucketize()`. Extract to a new sibling file
  `web/src/components/PhaseLaneBoard.tsx` so `Kanban.tsx` stays
  focused on the 3-column view.
- The new component SHALL:
  - Render 4 lanes in pipeline order: `proposed → coded →
    reviewed → done`. Lane header shows the phase name + card
    count. An empty lane shows a muted placeholder ("No changes
    at this phase" or similar).
  - Render an "Unphased" fallback section BELOW the 4 lanes for
    changes whose `phase` field is undefined or an unknown value.
    Uses the same `bucketize()`-derived grouping (TODO / IN /
    DONE) so nothing is dropped from view.
  - **Not** render needs-human badges, WaitBadges, or any other
    phase-derived UX beyond the layout itself. `phase ===
    "needs-human"` cards render in their `priorPhase` lane
    (matching the old behavior) with no visual annotation.
  - Reuse the existing `Card` render body from `Kanban.tsx`
    (extract to a shared file if the copy would drift, else
    inline the same JSX). Cards must remain identical to the
    3-column view — no visual difference other than which
    container they land in.
- Drag-and-drop between lanes is **out of scope** (the original
  `add-kanban-phase-lanes` shipped it via `@dnd-kit`, but
  `revert-active-phase-ui` (2026-07-07) had already removed the
  manual-transition side; layout without drag matches the current
  contract that "phase transitions happen automatically as workers
  land artifacts").

### CSS

- `.phase-lane-board`, `.phase-lane`, `.phase-lane-header`,
  `.phase-lane-empty`, `.phase-unphased-section` — new class
  hierarchy for the new component. Reuse the existing
  `.kanban-col`-like column styling where visually equivalent.

## Success

- Overview page toggle has 3 buttons: Board / Phase / Cards.
  Default is Board (unchanged behavior for first-time users and
  existing users whose persisted value is `board`).
- Clicking Phase renders 4 swim lanes plus an Unphased fallback
  populated with the current change list; card content /
  affordances match the Board view exactly (same Start / Apply /
  Archive buttons, same progress bar, same tags).
- Toggle state persists across page reloads via the existing
  zustand-persist mechanism.
- Search filter (`.kanban-filter`) applies before layout — the
  Phase view respects `visibleChanges`.
- Server behavior unchanged. Phase transitions still happen
  Manager-driven, without UI.
- No needs-human WaitBadges or other phase-derived affordances
  appear anywhere.
- All existing Kanban interactions (Start button, drag-off for
  Discard, keyboard shortcuts) continue to work in the Board view.
  The Phase view has no drag interactions.
- `npm test` / `npm run typecheck` / `npm run build` pass.

## Non-goals

- **No new UX affordances tied to phase** — no needs-human badge,
  no phase-transition drop targets, no progress-independent
  placement, no manual phase menu. Purely a display-format
  toggle.
- **No server changes**. `Change.phase` etc. are already exported.
- **No storage decision**. The existing `overviewLayout` persist
  path handles the new value.
- **No drag-to-transition**. The lane layout renders read-only.
- **No migration for the retired `revert-kanban-ui-lanes` spec
  content**. This is an ADDED requirement on top of the current
  spec; the historical MODIFIED / REMOVED requirements from the
  earlier revert stay archived as history.
- This change does NOT reintroduce the `Progress-Independent
  Phase Placement` requirement wording verbatim (that spec entry
  was too broad); the new Phase view rules are stated fresh in
  the ADDED requirement, scoped to the toggle.
