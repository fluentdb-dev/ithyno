# Outcome — add-phase-state-machine

## ✅ Worked

- **Sidecar as phase store.** Extending
  `openspec/changes/<id>/.openspec.yaml` with a `phase:` key held up.
  The yaml library's parse → merge → serialize preserves `schema:`
  and `created:` around any write. Adding the sidecar file to the
  chokidar watcher (previously `.md`-only) took one line and gives
  external edits automatic WS propagation.
- **Server-side plumbing was small.** Discovery in
  `workspace.ts::parseChange` extended with a two-line read; the
  API is 60 lines of Fastify routes reusing the existing
  `isSafeChangeId` guard and the global CSRF `onRequest` hook.
- **Reserved-value error message with a pointer** works as designed
  (verified by curl):
  ```
  POST /api/changes/<id>/phase {"phase":"validated"}
  → 400 { error: "phase 'validated' is reserved for Phase 4
    (see docs/ideas/2026-07-04-phase-gates-and-putback.md);
    not yet supported" }
  ```
- **`<PhaseControl>` as a `<select>`** turned out to be a good
  substitute for the proposed "Phase ▸ menu" — a native select is
  keyboard-accessible by default, needs no focus-trap plumbing, and
  fits in the card head without competing with the existing agent
  badge. Users still get "any-direction transitions" (Phase 2's
  contract).

## ⚠️ Surprises

- **The proposal's UI section was under-scoped for one change.**
  Replacing the 3-column Kanban with four phase lanes + a legacy
  fallback + drag-between-lanes drop targets is a genuine refactor
  of `Kanban.tsx` (~500 LOC) touching `bucketize()`, `ColumnId`
  through the file, and the `@dnd-kit/core` wiring. Landing it in
  the same commit as the backend substrate would put the whole
  substrate at risk of UI-regression rollback. Descoped: the
  swim-lane rendering + legacy section + drag transitions go to a
  follow-up sub-change `add-kanban-phase-lanes` (task 4.1–4.5).
  The shipped `<PhaseControl>` covers the transition contract but
  not the visual reorganization.
- **CSRF middleware pattern was not `requireCsrfBase()`.** The
  proposal named a per-route decorator; the actual codebase uses a
  global `fastify.addHook("onRequest", ...)` that applies to all
  mutating methods. My new POST inherits that protection
  automatically. Proposal wording is technically wrong but the
  outcome is right; the follow-up spec write-up (if any) should
  correct the language.
- **Manual verify became "curl + code review" instead of a live
  dashboard drag test.** Because 4.1–4.5 deferred, the "drag a
  card `proposed → coded` and restart" scenario cannot be exercised
  end-to-end yet. Substitute verify: hit the API directly, confirm
  the sidecar receives the write, restart, confirm re-read carries
  the phase through.

## 🔁 Differently

- **Would ship 4.1–4.5 as a formal sub-change from the outset.**
  The proposal should have flagged "Kanban lane refactor" as its
  own change id rather than one section of this one. Naming it
  `add-kanban-phase-lanes` and sequencing after this change keeps
  each change reviewable and rollback-safe.
- **Would test the sidecar module formally.** Deferring formal
  round-trip and invalid-value tests to a follow-up is a small
  debt. Both are 10-line unit tests each; not writing them now
  saved 15 minutes and cost future confidence when the sidecar
  gets extended with `priorPhase` / `escalatedAt` in
  `add-needs-human-phase`. Those tests are effectively the
  regression net for the module's contract.

## 🌱 Follow-ups

- **`add-kanban-phase-lanes`** — the deferred UI work: bucket by
  phase into 4 swim lanes, render an "Unphased" fallback section
  reusing today's `bucketize()`, wire drop targets per lane,
  handle drag-to-lane transitions. Preconditions met by this
  change (Phase type, API, sidecar). Blocked ONLY by review + a
  short design pass on the lane vs. Unphased-section layout.
- **`add-sidecar-tests`** — formal vitest for
  `readSidecar` / `writeSidecar` / `extractSidecarFields` covering
  legacy-file preservation, invalid values, and reserved-value
  warning. Preconditions: this change merged.
- **`add-phase-menu-accessibility`** — the shipped `<select>` is
  keyboard-navigable but doesn't render the phase name with a lane
  color, doesn't show the transition history, and doesn't
  highlight the current phase in the option list beyond the
  default `<option selected>` styling. A follow-up can make it
  match the visual language of whatever `add-kanban-phase-lanes`
  produces.
- **Note for `add-needs-human-phase`** (next change on the phase
  branch): the sidecar module here already types `priorPhase` and
  `escalatedAt` — those fields are recognized on read but never
  written by this change. `add-needs-human-phase` fills in the
  write path and the invariant enforcement at load.
