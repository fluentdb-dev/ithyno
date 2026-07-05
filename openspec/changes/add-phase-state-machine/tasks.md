## 1. Shared model

- [ ] 1.1 Create `server/phases.ts` exporting `const PHASES = ["proposed", "coded", "reviewed", "done"] as const` and `type Phase = typeof PHASES[number]`; import from both server and web
- [ ] 1.2 Also export `RESERVED_PHASES = ["validated", "verified"] as const` with a comment pointing at `docs/ideas/2026-07-04-phase-gates-and-putback.md`
- [ ] 1.3 Extend the `Change` type in `web/src/store.ts` with `phase?: Phase`; import `PHASES` from the shared module (Vite handles TS re-export from server/ path)

## 2. Server — sidecar persistence

- [ ] 2.1 Create `server/sidecar.ts` with `readSidecar(projectRoot, changeId)` and `writeSidecar(projectRoot, changeId, patch)` for `openspec/changes/<id>/.openspec.yaml`; preserve unrelated existing keys byte-intent on write (parse → merge → serialize)
- [ ] 2.2 Parse the `phase:` key during change discovery in the existing openspec parser path; invalid or reserved values are treated as absent (log a warning, do not crash)
- [ ] 2.3 Include `phase` (or null) in the change payload of `GET /api/state` and in `state-updated` WS broadcasts
- [ ] 2.4 Extend the existing chokidar watcher to include `.openspec.yaml` so external edits to `phase:` propagate to clients

## 3. Server — phase API

- [ ] 3.1 Add `GET /api/changes/:id/phase` returning `{ phase: Phase | null }`; 404 for unknown change
- [ ] 3.2 Add `POST /api/changes/:id/phase` (body `{ phase }`) guarded by `requireCsrfBase`
- [ ] 3.3 Validate the POST body:
  - Unknown string → 400 `{ error: "unknown phase '<value>'; expected one of <list>" }`
  - Reserved value (`validated` / `verified`) → 400 `{ error: "phase '<value>' is reserved for Phase 4 (see docs/ideas/2026-07-04-phase-gates-and-putback.md); not yet supported" }`
  - Unknown change id → 404
- [ ] 3.4 On success: write sidecar, update in-memory state, broadcast the existing `state-updated` event (do NOT add a new `ServerEvent` variant — full-state broadcast already carries the phase, and adding a variant would be dead surface for the same information)

## 4. Web — Kanban swim lanes

- [ ] 4.1 Replace the 3-column layout with four phase lanes in pipeline order (`proposed`, `coded`, `reviewed`, `done`)
- [ ] 4.2 Bucket changes with a valid `phase` into their lane; narrow unknown strings against `PHASES` and route failures to the fallback section
- [ ] 4.3 Render a collapsed "Unphased" section below the lanes that reuses the existing `bucketize()` todo/inprogress/done grouping for phase-less changes
- [ ] 4.4 Wire `@dnd-kit/core` drop targets per lane; dropping a card POSTs the target phase and optimistically moves the card, reverting on error
- [ ] 4.5 Allow dragging an unphased card from the fallback section into any lane (adopts that phase)
- [ ] 4.6 Add a "Phase ▸" menu to `ChangeCard` listing all four phases, firing the same POST; keyboard-operable (focus trap, arrow-key navigation, Escape closes)
- [ ] 4.7 Keep Start / Merge / Discard / Archive button behavior untouched

## 5. Tests

- [ ] 5.1 Unit: sidecar read/write round-trip preserves unrelated keys (`.openspec.yaml` already has `schema:` and possibly other machine-owned keys — those must survive a phase write)
- [ ] 5.2 Unit: discovery treats invalid/reserved `phase:` values as absent
- [ ] 5.3 API: POST phase happy path writes sidecar + broadcasts `state-updated`; GET reflects it
- [ ] 5.4 API: POST rejects reserved values (with the pointer message), unknown values, missing CSRF token
- [ ] 5.5 Web: lane bucketing — phased cards land in lanes, unphased cards land in fallback grouping identical to today's `bucketize()` output (regression check)
- [ ] 5.6 Web: unknown phase string renders in Unphased section without crash

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-phase-state-machine/specs/dashboard/spec.md`: ADDED requirements for phase persistence, phase API, Kanban swim lanes, manual transitions, and legacy fallback
- [ ] 6.2 `npm run openspec -- validate add-phase-state-machine` passes

## 7. Verification

- [ ] 7.1 `npm test && npm run typecheck && npm run build` all pass
- [ ] 7.2 Manual golden path on dev server against `examples/sample-project`: drag a card `proposed → coded`, restart server, confirm the card stays in `coded`
- [ ] 7.3 Manual: confirm a change with no `phase` key renders exactly as before this change (Unphased section reuses the pre-Phase-2 bucketize output)
- [ ] 7.4 Manual: POST `phase: validated` via curl → 400 with the reserved-value message including the idea-file pointer
