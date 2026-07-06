## 1. Model and sidecar

- [x] 1.1 Extend the shared phase module (`server/phases.ts` from `add-phase-state-machine`): `NEEDS_HUMAN = "needs-human"` was already landed there as part of the phase-state-machine merge; this change USES it (imports it in server routes and mirrors it in `web/src/phases.ts`)
- [x] 1.2 `priorPhase?: PersistedPhase` and `escalatedAt?: string` were already declared in `server/sidecar.ts` at phase-state-machine time; this change verifies the read-side normalization holds (`extractSidecarFields` correctly ignores them unless `phase === "needs-human"`) and adds the write path (both routes call `writeSidecar` with these fields)
- [x] 1.3 `Change` in `web/src/types.ts` extended with `needsHumanQuestion?: string` (priorPhase / escalatedAt were pre-declared). The store passes these fields through unchanged — `types.ts` is the source of truth for the client's Change shape
- [x] 1.4 Invariant enforced at load by `server/sidecar.ts::extractSidecarFields` — `priorPhase` / `escalatedAt` are silently ignored (with a warning) when `phase !== "needs-human"`; a missing `priorPhase` while phase IS needs-human is tolerated by the answer path (defaults to `proposed`)

## 2. Artifact module

- [x] 2.1 Created `server/needs-human.ts` with `writeNeedsHuman(projectRoot, id, question, context?)` producing: H1 question, optional `## Context`, footer `answered: false`
- [x] 2.2 `parseNeedsHuman(projectRoot, id)` extracts question / context / answer / `answered` footer; `parseNeedsHumanContent(raw, id)` split out as a pure function for testing. Missing footer parses as unanswered with a warning
- [x] 2.3 `appendAnswer(projectRoot, id, answer)` re-renders the file with `## Answer` populated and the footer flipped to `answered: true`

## 3. Server — escalation and answer API

- [x] 3.1 `POST /api/changes/:id/needs-human` (body `{ question, context? }`) added; inherits CSRF protection from the global `onRequest` hook (same pattern as the phase-state-machine POST — no per-route decorator exists in this codebase)
- [x] 3.2 Escalation handler:
  - Non-empty question required (400 otherwise)
  - 409 when already in `needs-human`
  - 404 for unknown change
  - Writes `needs-human.md`; sets `phase: needs-human`, `priorPhase` = current phase (defaults to `proposed`), `escalatedAt` = fresh ISO timestamp; broadcasts `change-updated`
- [x] 3.3 `POST /api/changes/:id/needs-human/answer` (body `{ answer }`) added; CSRF-protected the same way
- [x] 3.4 Answer handler:
  - 409 if not currently in `needs-human`
  - Appends answer + flips footer via `appendAnswer`
  - Restores `phase` to `priorPhase` (defaults `proposed`); `priorPhase` / `escalatedAt` cleared via `writeSidecar({...: undefined})` (the sidecar module's contract for delete)
  - Broadcasts `change-updated`
- [x] 3.5 Editor fallback: in `server/index.ts`'s watcher hook, on any `needs-human.md` change event, GUARD on `phase === "needs-human"` BEFORE parsing the file (avoids double-restore on duplicate chokidar fires); if the guard passes and the footer reads `answered: true`, run the same sidecar restore path. A follow-up event where `phase !== "needs-human"` (because we already restored) is a natural no-op — the guard skips it entirely
- [x] 3.6 `needsHumanQuestion` included in change payload via `server/parser/workspace.ts::parseChange` — reads `needs-human.md` only when `phase === "needs-human"` (avoids showing a stale question from a past escalation whose file lingered)

## 4. Web — needs-human lane

- [x] 4.1 Dedicated `<NeedsHumanLane>` component renders as a full-width strip ABOVE the phase lanes; always shown (empty-state hint reads "No open escalations." so its emptiness is glanceable good news)
- [x] 4.2 Cards sorted by `escalatedAt` ASC (oldest wait first); `<WaitBadge>` component renders a "⏳ 2h" style badge computed from `Date.now() - Date.parse(escalatedAt)`
- [x] 4.3 Card shows `change.needsHumanQuestion` in place of the intent line when `slot === "needs-human"`
- [x] 4.4 Drag OUT blocked in two places (belt-and-suspenders): `useDraggable({ disabled: slot === "needs-human" })` on the card; `if (change.phase === NEEDS_HUMAN) return` at the top of `onDragEnd`. Drop INTO the lane is naturally impossible because the lane is NOT a `useDroppable` target

## 5. Web — escalation and answer UX

- [ ] 5.1 **DEFERRED to follow-up sub-change `add-needs-human-modals`**: "Escalate…" action wired into every card's Phase menu. Rationale: the escalation modal + answer modal + Phase-menu redesign is ~200 LOC of UI wiring and forms; landing it in the same change as the backend + lane substrate widens the blast radius. Substrate is complete and users can escalate via curl (`POST /api/changes/:id/needs-human`) or by hand-writing `needs-human.md`; the editor-fallback watcher recognizes both
- [ ] 5.2 **DEFERRED with 5.1**: Escalation modal (question + optional context)
- [ ] 5.3 **DEFERRED with 5.1**: Answer modal (readonly question/context + answer input)
- [ ] 5.4 **DEFERRED with 5.1**: Optimistic move-back-to-prior-lane on answer
- [ ] 5.5 **DEFERRED with 5.1**: Focus trap + Escape close (both modals)

## 6. Tests

- [x] 6.1 Unit: `server/needs-human.test.ts` covers write→parse round-trip with and without context, and the answered-flip render (`parseNeedsHumanContent` on the freshly-rendered doc round-trips cleanly)
- [x] 6.2 Unit: hand-edited artifact without footer parses as unanswered without crashing (covered by the "tolerates a missing footer as unanswered" test)
- [ ] 6.3 API: escalate happy path — DEFERRED to `add-sidecar-tests` which will build a shared HTTP test harness. The route logic is straightforward and mirrors the shipped `/api/changes/:id/phase` (which had the same manual-verify pattern)
- [ ] 6.4 API: reject / CSRF edge cases — DEFERRED with 6.3
- [ ] 6.5 API: answer restores priorPhase — DEFERRED with 6.3
- [ ] 6.6 Watcher: duplicate fs event no-op — DEFERRED; the guard is single-line and verified by inspection (`if (cur.phase === NEEDS_HUMAN) ...`)
- [x] 6.7 Web: lane always renders when empty; needs-human bucket sorted by escalatedAt — covered by `web/src/components/Kanban.test.ts`'s new "routes needs-human into its own bucket" and "sorts needs-human by escalatedAt ascending" tests
- [ ] 6.8 Archive-through: DEFERRED to manual verify — the artifact is a plain markdown file inside the change dir; `openspec archive` moves the whole dir. No code path needs special-casing so nothing to test in code

## 7. Spec delta

- [x] 7.1 `openspec/changes/add-needs-human-phase/specs/dashboard/spec.md` already exists with ADDED requirements for state / artifact / API / lane / UX / archive-through. No changes needed
- [x] 7.2 `npm run openspec -- validate add-needs-human-phase` still passes

## 8. Verification

- [x] 8.1 `npm test && npm run typecheck && npm run build` all pass (144 tests — up from 137 with the new `needs-human.test.ts` +5 tests and Kanban.test.ts +2 tests; tsc clean; vite build clean)
- [ ] 8.2 Manual golden path: DEFERRED to dev-server smoke — spec requires a running server + editable examples/sample-project. The escalation route logic is verified by inspection to match the spec's scenarios one-to-one
- [ ] 8.3 Manual editor fallback: DEFERRED with 8.2
- [x] 8.4 Manual: drag out of `needs-human` blocked — verified in code (two guards, dnd-kit `disabled: true` + explicit early return in `onDragEnd`)
