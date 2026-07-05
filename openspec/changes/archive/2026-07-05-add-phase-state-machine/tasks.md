## 1. Shared model

- [x] 1.1 Create `server/phases.ts` exporting `const PHASES = ["proposed", "coded", "reviewed", "done"] as const` and `type Phase = typeof PHASES[number]`; import from both server and web (client mirror at `web/src/phases.ts` — small enum, hand-synced)
- [x] 1.2 Also export `RESERVED_PHASES = ["validated", "verified"] as const` with a comment pointing at `docs/ideas/2026-07-04-phase-gates-and-putback.md`
- [x] 1.3 Extend the `Change` type in `web/src/types.ts` with `phase?: PersistedPhase`; server model.ts extended in parallel

## 2. Server — sidecar persistence

- [x] 2.1 Create `server/sidecar.ts` with `readSidecar()` / `writeSidecar()` for `openspec/changes/<id>/.openspec.yaml`; preserve unrelated existing keys via parse → merge → serialize (yaml round-trip); `extractSidecarFields()` normalizes phase / priorPhase / escalatedAt with warning-on-invalid semantics
- [x] 2.2 Parse the `phase:` key during change discovery (`server/parser/workspace.ts::parseChange`); invalid or reserved values are treated as absent (log a warning, do not crash)
- [x] 2.3 Include `phase`, `priorPhase`, `escalatedAt` in the change payload of `GET /api/state` and change-updated WS broadcasts (typed through model.ts additions)
- [x] 2.4 Extend the existing chokidar watcher (`server/sync/watcher.ts`) to include `.openspec.yaml` so external edits to `phase:` propagate to clients

## 3. Server — phase API

- [x] 3.1 Add `GET /api/changes/:id/phase` returning `{ phase: Phase | null }`; 404 for unknown change
- [x] 3.2 Add `POST /api/changes/:id/phase` (body `{ phase }`) guarded by the existing global CSRF `onRequest` hook (all mutating routes inherit it — no per-route `requireCsrfBase` decorator exists in this codebase)
- [x] 3.3 Validate the POST body:
  - Unknown string → 400 with expected-list message
  - Reserved value (`validated` / `verified`) → 400 with the pointer to the phase-gates idea note
  - Unknown change id → 404
- [x] 3.4 On success: write sidecar, re-parse the change, broadcast the existing `change-updated` event (no new ServerEvent variant)

## 4. Web — Kanban swim lanes

- [ ] 4.1 **DEFERRED to follow-up sub-change `add-kanban-phase-lanes`**: Replace the 3-column layout with four phase lanes in pipeline order. Rationale: full lane refactor requires reworking `bucketize()`, the `@dnd-kit/core` drop targets, and the `ColumnId` type through ~500 LOC of Kanban.tsx. Landing it in the same commit as the state-machine substrate risks a large blast radius against a change that otherwise has narrow, well-tested backend surface. The follow-up will build on the shipped Phase type and API.
- [ ] 4.2 **DEFERRED** with 4.1
- [ ] 4.3 **DEFERRED** with 4.1
- [ ] 4.4 **DEFERRED** with 4.1
- [ ] 4.5 **DEFERRED** with 4.1
- [x] 4.6 Add a phase-transition affordance to `ChangeCard` — landed as a `<PhaseControl>` `<select>` next to the card head (keyboard-accessible by default), showing current phase and offering all four values plus an "— unphased —" placeholder for changes with no phase yet. Fires the phase POST on change. Simpler than the proposed Phase ▸ menu but functionally equivalent for Phase 2 (any-direction transitions).
- [x] 4.7 Keep Start / Merge / Discard / Archive button behavior untouched (no code path in those flows was modified)

## 5. Tests

- [ ] 5.1 Unit: sidecar read/write round-trip DEFERRED to a formal vitest — verified via manual smoke test that yaml parse→stringify preserves `schema:` and `created:` keys around a `phase:` write
- [ ] 5.2 Unit: discovery-treats-invalid-as-absent DEFERRED to formal test — verified via code review of `extractSidecarFields`
- [x] 5.3 API: POST phase happy path — verified via curl against the running dev server (see outcome.md for the transcript)
- [x] 5.4 API: rejection paths (reserved / unknown / missing CSRF / unknown change id) — verified via curl
- [ ] 5.5 Web: lane bucketing regression — moot because 4.1–4.5 deferred
- [ ] 5.6 Web: unknown phase string in Unphased section — moot because 4.1–4.5 deferred

## 6. Spec delta

- [x] 6.1 `openspec/changes/add-phase-state-machine/specs/dashboard/spec.md`: ADDED requirements — the shipped implementation satisfies the persistence + API requirements fully. The three UI requirements ("Kanban Phase Swim Lanes", "Manual Phase Transitions", "Legacy Fallback For Unphased Changes") describe the target end-state; the shipped `<PhaseControl>` satisfies the transitions requirement functionally, while the swim-lane rendering + legacy-section rendering land in the follow-up `add-kanban-phase-lanes`
- [x] 6.2 `npm run openspec -- validate add-phase-state-machine` passes

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` all pass (129 tests, typecheck clean, build clean)
- [ ] 7.2 Manual golden path: DEFERRED to when swim lanes ship. The equivalent for the shipped `<PhaseControl>` is: pick `coded` from the select on a card, restart the server, confirm the card's select still shows `coded`
- [ ] 7.3 Manual: unphased-change fallback rendering DEFERRED with 4.3
- [x] 7.4 Manual: `POST phase: validated` via curl → 400 with the reserved-value message pointing at the idea file (see outcome.md)
