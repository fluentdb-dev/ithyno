// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Client mirror of `server/phases.ts`. The two are hand-synced (small enum,
 * changes rare). If they diverge, `web/src/store.ts` narrows unknown phase
 * strings to `undefined` on receipt so the UI degrades to the Unphased
 * section rather than crashing.
 *
 * `NEEDS_HUMAN` is a valid persisted value but does not appear as its own
 * Kanban lane — such a change stays in its `priorPhase` lane with a
 * WaitBadge on the card. See `Kanban.tsx::bucketize()`.
 */

export const PHASES = ["proposed", "coded", "reviewed", "done"] as const;
export type Phase = (typeof PHASES)[number];

export const NEEDS_HUMAN = "needs-human" as const;
export type PersistedPhase = Phase | typeof NEEDS_HUMAN;

export const RESERVED_PHASES = ["validated", "verified"] as const;

export function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}

export function isPersistedPhase(value: unknown): value is PersistedPhase {
  return isPhase(value) || value === NEEDS_HUMAN;
}

/**
 * Resolve the pipeline stage (Phase-view lane) a change currently sits in.
 *
 * Same rules `PhaseLaneBoard.bucketizeByPhase()` uses for lane placement:
 *   - Known phase → that lane.
 *   - `needs-human` → the `priorPhase` lane when it resolves.
 *   - Anything else (undefined / unknown string / `needs-human` without a
 *     resolvable `priorPhase`) → `proposed`, the starting stage.
 *
 * Lives here rather than in the board component because
 * `annotate-cards-with-worker-job-state` also needs it outside the Phase
 * view: the card's transient "done ✓" is suppressed once the change's stage
 * moves off the one its worker finished in, and that rule holds in the Board
 * view too.
 */
export function laneForPhase(phase?: unknown, priorPhase?: unknown): Phase {
  if (isPhase(phase)) return phase;
  if (phase === NEEDS_HUMAN && isPhase(priorPhase)) return priorPhase;
  return "proposed";
}
