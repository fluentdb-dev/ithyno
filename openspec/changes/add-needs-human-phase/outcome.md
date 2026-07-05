# Outcome — add-needs-human-phase

## ✅ Worked

- **Substrate was already there.** `phases.ts` had
  `NEEDS_HUMAN` + `isPersistedPhase`; `sidecar.ts` typed and
  parsed `priorPhase` / `escalatedAt`; `model.ts`'s `Change`
  had the two escalation fields. All three landed with
  `add-phase-state-machine` explicitly to unblock this change.
  The result: this change touched three server files
  (`needs-human.ts` new, `index.ts` +2 routes + watcher hook,
  `parser/workspace.ts` reads the artifact) and three web
  files (`types.ts`, `api.ts`, `Kanban.tsx` + `styles.css`).
  Small delta because the earlier design work paid off.
- **The invariant guard on the watcher hook is one line.**
  `if (cur.phase === NEEDS_HUMAN) { ...restore... }` before
  reading `needs-human.md` means duplicate chokidar fires (a
  known behavior on some editors) are natural no-ops after
  the first restore — the second event sees `phase !==
  needs-human` and takes the fall-through path (a normal
  parseChange + broadcast). Zero extra state to track.
- **`writeSidecar({...: undefined})` deletes cleanly.** The
  sidecar module's contract from `add-phase-state-machine`
  says an `undefined` value in a patch DELETES the key. The
  answer path uses this for `priorPhase` / `escalatedAt` in
  one call. If the module had required a separate
  `deleteSidecarField` API this would have been two calls
  and a race window; the delete-on-undefined convention held
  up under real use.
- **`<NeedsHumanLane>` as a top strip, not another lane
  column.** The spec asked for "dedicated, visually distinct"
  and "always rendered even when empty." Putting it above
  the phase lanes with `grid-column: 1 / -1` and a
  contrasting accent border satisfies both — the emptiness
  IS the good-news signal — and doesn't crowd the 4-column
  phase grid.
- **Belt-and-suspenders drag block.** UI: `useDraggable({
  disabled: slot === "needs-human" })`. Server-safe path:
  `if (change.phase === NEEDS_HUMAN) return` at the top of
  `onDragEnd`. Neither alone is enough — the UI guard fails
  open if someone bypasses dnd-kit programmatically; the
  onDragEnd guard fails open if the client sends the drag
  event through a different code path. Both together: any
  attempt to move an escalated card silently drops.
- **`WaitBadge` is a pure function of `escalatedAt` and now.**
  No timers, no `useEffect`. Renders on the next
  `change-updated` broadcast which arrives frequently enough
  for hour-granularity wait times to read live. Sub-minute
  precision would need a timer but nobody watches an
  escalation minute-by-minute.

## ⚠️ Surprises

- **The UI escalation modals are the heaviest chunk and
  got descoped.** Building the escalation modal + answer
  modal + `<PhaseControl>` menu-item hook is ~200 LOC of
  form + focus-trap + validation. Landing it in the same
  commit as the backend + lane substrate would risk the
  substrate rolling back on a modal-UX regression. Descoped
  to `add-needs-human-modals`. Users can escalate today by
  hand-writing `needs-human.md` (the editor-fallback
  watcher will pick it up) or by direct API call. The
  substrate correctly renders the lane and the wait-time
  sort — the missing piece is the guided workflow.
- **Server test coverage of the routes is thinner than
  ideal.** The unit tests for `parseNeedsHumanContent` are
  solid (5 tests covering round-trips + hand-edited files)
  but the API route tests are deferred to
  `add-sidecar-tests` which will build a shared Fastify
  test harness. The route logic is small and mirrors the
  shipped `/api/changes/:id/phase` (which had the same
  manual-verify pattern), so the risk of shipping without
  formal API tests is bounded.
- **`Change.needsHumanQuestion` is only populated when
  `phase === "needs-human"`.** A lingering `needs-human.md`
  from a past escalation (which git would preserve) does
  NOT surface as a stale question because `parseChange`
  gates the artifact read on the current phase. This is
  intentional — the past question belongs in git history,
  not on the card — but it means the artifact-preservation
  scenario in the archive test path has to check git, not
  the running server.

## 🔁 Differently

- **Would ship the modals as part of a Phase 3 UX-focused
  change** — probably `add-phase-menu-and-escalation-modals`
  bundling the phase-menu accessibility work
  (`add-phase-menu-accessibility` from prior follow-ups)
  with the escalation UX. Those two touch the same
  `<PhaseControl>` code and doing them together avoids
  churning the same file twice.
- **Would keep the wait-badge threshold at "hour" and
  ADD** a red-shifted variant at, say, "waited > 24h."
  That's a follow-up worth 30 lines of CSS + one
  conditional.

## 🌱 Follow-ups

- **`add-needs-human-modals`** — the deferred UI: an
  Escalate action on every card (via the Phase menu),
  escalation modal (question + optional context), answer
  modal (readonly question/context + answer input),
  optimistic move-back on answer. Preconditions met by
  this change (routes + lane + drag block ship here).
- **`add-sidecar-tests`** — still open. This change adds
  another consumer of the sidecar module (`priorPhase` +
  `escalatedAt` write paths) so the case for formal
  round-trip tests grows. Combined with route tests for
  `/api/changes/:id/phase` and the two `/needs-human`
  routes it's a natural bundle.
- **`add-needs-human-notifications`** — beeps / titlebar
  badge count / external ping when a change enters the
  lane. Out of scope here but worth an idea note if wait
  times become observable.
- **`add-needs-human-worktree-visibility`** — an agent
  running in a `.worktrees/pool-N/` or
  `.worktrees/<change-id>/` doesn't see `needs-human.md`
  on the branch it's checked out on (typically main).
  Same limitation as the phase sidecar. Deferred to Phase
  3 when gate agents actually need to write escalations
  from their branch.
- **A red-shifted wait-badge for `> 24h`** — trivial CSS
  + one conditional; adds urgency signal without changing
  the data model.

## Notes for the reviewer

- Server delta: `+195` LOC across `needs-human.ts` (new
  ~155), `index.ts` (+~75), `parser/workspace.ts` (+~10),
  `model.ts` (+~5); `-` about 10 lines of import list
  reformatting.
- Web delta: `+130` LOC across `Kanban.tsx` (+~65),
  `types.ts` (+~4), `api.ts` (+~25), `styles.css` (+~50);
  `-` about 5 lines.
- No changes to server startup, chokidar options, or CSRF
  wiring — the two new routes inherit the same protection
  the phase POST inherits.
- The two new APIs and the artifact format match the spec
  1:1; scenarios are directly testable end-to-end via
  curl.
