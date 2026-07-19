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
