---
tags: [feature/revert, area/web, kanban, phase]
---

# Revert kanban UI phase lanes

## Why

The Kanban board principle — established when the phase workflow was
first discussed — is **3 columns only: TODO / IN-PROGRESS / DONE**.
Phase state is a Manager-internal concern. The user's own operations
against a change are limited to `propose → apply → archive → merge`;
phase transitions happen automatically as workers land artifacts.

Phase 2 landed several changes that shipped phase-derived UI onto the
Kanban (swim lanes, an "Unphased" fallback section, needs-human
WaitBadge, progress-independent placement). `revert-active-phase-ui`
(2026-07-07) already removed the manual-transition side of that
surface, but the visual lanes / fallback structure and the
needs-human badges remained. Verify-time review surfaced that the
current 4-lane + Unphased-section board is still wrong against the
original principle.

This change removes the remaining phase-derived UI from the Kanban.
Server-side phase state (sidecar `phase:` field, `POST
/api/changes/:id/phase`, needs-human artifact + escalation API)
stays — the Manager continues to read and write it. Only the
Kanban's rendering reverts to the pre-phase 3-column progress-derived
layout.

## Targets

Both Case α (already archived; requirements landed in specs).

1. **`add-phase-state-machine`** (`2026-07-05-add-phase-state-machine`,
   partial revert): only the two Kanban UI requirements
   (`Kanban Phase Swim Lanes`, `Legacy Fallback For Unphased Changes`)
   are removed. Server-side requirements
   (`Phase Persistence In Change Sidecar`, `Phase Transition API`)
   stay untouched — Manager and worker skills depend on them.

2. **`add-kanban-phase-lanes`** (`2026-07-05-add-kanban-phase-lanes`,
   full revert): its sole spec requirement,
   `Progress-Independent Phase Placement`, is removed. The whole
   change's raison d'être was UI-level.

## What Changes

### Spec (REMOVED — three requirements)

- `Kanban Phase Swim Lanes`
- `Legacy Fallback For Unphased Changes`
- `Progress-Independent Phase Placement`

### Impl (web-only)

1. **`web/src/components/Kanban.tsx`** — restore progress-derived
   3-column layout (TODO / IN-PROGRESS / DONE). Remove
   `PhaseLane`, `UnphasedSection`, `PHASE_LABEL`, `PHASE_EMPTY`,
   `bucketize` phase branches, and the `slot === "proposed" | "coded" |
   ...` boolean logic.
2. **`web/src/components/Kanban.tsx`** — remove `WaitBadge`,
   `isNeedsHuman` branch on the card, and the `needsHumanQuestion`
   display. Cards with `phase: needs-human` render in their
   progress-derived column with no visual escalation marker; the
   Manager / Claude Code UI is where the human sees the escalation.
3. **`web/src/store.ts`** — no change (still carries `phase` /
   `needsHumanQuestion` on `Change` so future non-Kanban surfaces
   can consult them; Kanban just doesn't render them).
4. **`web/src/phases.ts`** — no change (still exports `PHASES`,
   `NEEDS_HUMAN`, `isPhase` for future consumers).
5. **CSS**: remove `.kanban-phase-lane`, `.kanban-unphased-*`,
   `.wait-badge`, `.needs-human` from `styles.css`.
6. **`add-kanban-phase-lanes`** and `add-phase-state-machine`
   archives: add a "Reverted by revert-kanban-ui-lanes" annotation
   at the top of each `proposal.md` so future readers see the
   disposition inline (per Case α convention this is not required,
   but the user asked for it explicitly).

## Case α revert validity

Both targets are archived and their spec deltas have reached
`openspec/specs/dashboard/spec.md`. The revert uses `REMOVED`
requirements to undo them. Target archives stay put; this change's
`outcome.md` links back to them.

## Blast radius

- **Kanban rendering**: full replacement of the phased layout with
  the progress-derived 3-column layout. Everything that consumed
  phase lanes for card placement changes visually.
- **Server**: none. Manager and worker skills still read/write
  `phase:` via the untouched Phase Transition API.
- **needs-human state**: still tracked server-side. Only its
  Kanban visualization goes.
- **Tests**: `web/src/components/Kanban.test.ts` needs a rewrite
  to reflect the 3-column layout; other tests should be unaffected.

## Out of scope

- Removing `Change.phase` / `Change.priorPhase` /
  `Change.needsHumanQuestion` from client types — the store still
  carries them for future non-Kanban consumers (e.g., a
  Manager-status widget).
- Removing the needs-human editor-fallback watcher in
  `server/index.ts` — server-side is fine; only UI reverts here.
- Reworking `revert-active-phase-ui`'s already-removed
  requirements. This change is additive to that revert.
