// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Workflow phase enum shared between server and web.
 *
 * The four active values render as swim lanes on the Kanban in the order
 * declared. `needs-human` is a valid persisted phase (added by
 * add-needs-human-phase) but does NOT appear in `PHASES` — it gets its
 * own dedicated lane rendered separately.
 *
 * The reserved values are recognized by the API only to return a clear
 * error; they do not render as lanes. Phase 4 will move them into
 * `PHASES` when their gate agents land. Rationale + roadmap:
 * `docs/ideas/2026-07-04-phase-gates-and-putback.md`.
 */

export const PHASES = ["proposed", "coded", "reviewed", "done"] as const;
export type Phase = (typeof PHASES)[number];

/** Persisted phase for a change escalated to human. Not in PHASES so it
 *  doesn't render as a linear lane; the needs-human lane is rendered
 *  separately by add-needs-human-phase. */
export const NEEDS_HUMAN = "needs-human" as const;

/** Reserved for Phase 4 (validated / verified gate agents). Rejected by
 *  POST /api/changes/:id/phase with a message pointing at the idea file.
 *  See `docs/ideas/2026-07-04-phase-gates-and-putback.md`. */
export const RESERVED_PHASES = ["validated", "verified"] as const;
export type ReservedPhase = (typeof RESERVED_PHASES)[number];

export function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}

export function isReservedPhase(value: unknown): value is ReservedPhase {
  return typeof value === "string" && (RESERVED_PHASES as readonly string[]).includes(value);
}

/** Union of everything valid to persist. `needs-human` gets returned from
 *  the API but isn't part of the linear phase order. */
export type PersistedPhase = Phase | typeof NEEDS_HUMAN;

export function isPersistedPhase(value: unknown): value is PersistedPhase {
  return isPhase(value) || value === NEEDS_HUMAN;
}
