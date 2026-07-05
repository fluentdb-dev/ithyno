## 1. Model and sidecar

- [ ] 1.1 Extend the shared phase module (`server/phases.ts` from `add-phase-state-machine`): add `NEEDS_HUMAN = "needs-human"` as a persisted-but-non-lane phase; export separately from the linear `PHASES` array
- [ ] 1.2 Add `priorPhase?: Phase` and `escalatedAt?: string` to sidecar read/write in `server/sidecar.ts`
- [ ] 1.3 Extend `Change` in `web/src/store.ts` with `priorPhase?: Phase`, `escalatedAt?: string`, and `needsHumanQuestion?: string` (parsed from `needs-human.md` for card display)
- [ ] 1.4 Enforce the invariant at load: `priorPhase`/`escalatedAt` are ignored (and warned about) unless `phase === "needs-human"`; a `needs-human` phase with missing `priorPhase` defaults it to `proposed`

## 2. Artifact module

- [ ] 2.1 Create `server/needs-human.ts` with `writeNeedsHuman(projectRoot, id, question, context?)` producing: H1 question, optional `## Context`, footer `answered: false`
- [ ] 2.2 Add `parseNeedsHuman(projectRoot, id)` extracting question, context, answer, and the `answered` footer flag; tolerate hand-edited files (missing footer parses as unanswered with a warning)
- [ ] 2.3 Add `appendAnswer(projectRoot, id, answer)` writing the `## Answer` section and flipping the footer to `answered: true`

## 3. Server — escalation and answer API

- [ ] 3.1 Add `POST /api/changes/:id/needs-human` (body `{ question, context? }`) guarded by `requireCsrfBase`
- [ ] 3.2 Escalation handler:
  - Validate non-empty question (400 otherwise)
  - 409 if change is already in `needs-human`
  - 404 for unknown change
  - Write artifact; set sidecar `phase: needs-human`, `priorPhase` = current phase (default `proposed` if unphased), `escalatedAt` = new ISO timestamp; broadcast `state-updated`
- [ ] 3.3 Add `POST /api/changes/:id/needs-human/answer` (body `{ answer }`) guarded by `requireCsrfBase`
- [ ] 3.4 Answer handler:
  - 409 if not currently in `needs-human`
  - Append answer + flip footer
  - Restore `phase` to `priorPhase`; clear `priorPhase`/`escalatedAt`
  - Broadcast `state-updated`
- [ ] 3.5 Editor fallback: on chokidar change to `needs-human.md`, **guard on current `phase === "needs-human"`** BEFORE reading the file (avoids double-restore on duplicate fs events); if the guard passes and footer is `answered: true`, run the same restore path
- [ ] 3.6 Include question and `escalatedAt` in the `GET /api/state` change payload

## 4. Web — needs-human lane

- [ ] 4.1 Render a dedicated, visually distinct `needs-human` lane, always shown even when empty
- [ ] 4.2 Sort lane cards by `escalatedAt` ascending (longest wait first) and show a waiting-duration badge per card
- [ ] 4.3 Show the escalation question (truncated) on the card
- [ ] 4.4 Disable dragging cards out of (and into) the `needs-human` lane; answering is the only exit, escalation the only entry

## 5. Web — escalation and answer UX

- [ ] 5.1 Add an "Escalate…" action to every card's Phase ▸ menu (all lanes and the Unphased section)
- [ ] 5.2 Build the escalation modal: required question field, optional context textarea; submit POSTs the escalation API; disable submit on empty question
- [ ] 5.3 Build the answer modal: shows question + context read-only, answer textarea; submit POSTs the answer API
- [ ] 5.4 On successful answer, move the card back to its prior lane (optimistic, revert on error)
- [ ] 5.5 Ensure both modals are keyboard-operable (focus trap, Escape closes)

## 6. Tests

- [ ] 6.1 Unit: artifact write → parse round-trip (with and without context; answered flip)
- [ ] 6.2 Unit: hand-edited artifact without footer parses as unanswered without crashing
- [ ] 6.3 API: escalate happy path sets phase/priorPhase/escalatedAt and writes the file
- [ ] 6.4 API: escalate on unphased change records `priorPhase: proposed`; double-escalate returns 409; missing CSRF rejected
- [ ] 6.5 API: answer restores priorPhase, clears escalation fields, flips footer
- [ ] 6.6 Watcher: flipping `answered: true` on disk restores the prior phase exactly once; a second identical fs event (chokidar sometimes emits twice on a single save) is a no-op because `phase !== "needs-human"` after the first restore
- [ ] 6.7 Web: lane always renders when empty; cards sorted by wait time
- [ ] 6.8 Archive-through: a change with a completed `needs-human.md` archives to `openspec/changes/archive/<id>/needs-human.md` with no special-casing needed

## 7. Spec delta

- [ ] 7.1 `openspec/changes/add-needs-human-phase/specs/dashboard/spec.md`: ADDED requirements for the escalation state, artifact, API, lane, UX, and archive-through behavior
- [ ] 7.2 `npm run openspec -- validate add-needs-human-phase` passes

## 8. Verification

- [ ] 8.1 `npm test && npm run typecheck && npm run build` all pass
- [ ] 8.2 Manual golden path on dev server against `examples/sample-project`: escalate a `coded` card, restart the server, confirm it is still in `needs-human` with correct wait time, answer via modal, confirm it returns to `coded`
- [ ] 8.3 Manual: answer by editing `needs-human.md` in an editor and confirm the dashboard restores the phase (editor fallback path)
- [ ] 8.4 Manual: try to drag a card OUT of the `needs-human` lane → drop refused, no API call
