// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Per-change Manager activity tracking (expose-manager-activity-per-change).
 *
 * The Manager (the `/ithy-opsx:dispatch` orchestrator running in the PTY)
 * publishes what it is currently doing for a given change at every
 * orchestration boundary. The dashboard renders that as a secondary badge on
 * the Kanban card so the long "nothing visible is happening" windows
 * (waiting for a worker report, despawn/cleanup, phase transition) become
 * legible.
 *
 * **In-memory only.** There is deliberately no sidecar field and no
 * persistence: this is transient orchestration state, not workflow history.
 * A server restart clears everything; the dispatch skill re-posts the current
 * activity as it re-enters its loop.
 */

/** The dispatch stage the Manager is orchestrating. */
export type ManagerStage = "code" | "review" | "verify";

/** What the Manager is doing within that stage. */
export type ManagerActivityKind =
  | "dispatching"
  | "waiting"
  | "judging"
  | "cleanup"
  | "transitioning"
  | "idle";

export type ManagerActivity = {
  changeId: string;
  stage: ManagerStage;
  activity: ManagerActivityKind;
  /** epoch ms — when this activity became current. */
  startedAt: number;
  /** Short human-readable hint (worker name, cleanup step, …). */
  detail?: string;
};

/** Write shape accepted by `POST /api/manager/activity`. */
export type ManagerActivityInput = {
  changeId: string;
  /** Optional only when `activity === "idle"` (a clear needs no stage). */
  stage?: ManagerStage;
  activity: ManagerActivityKind;
  detail?: string;
};

const STAGES: readonly string[] = ["code", "review", "verify"];
const ACTIVITIES: readonly string[] = [
  "dispatching",
  "waiting",
  "judging",
  "cleanup",
  "transitioning",
  "idle",
];

/** Keyed by changeId. Module-level so every request handler sees one map. */
const activities = new Map<string, ManagerActivity>();

export function isManagerStage(v: unknown): v is ManagerStage {
  return typeof v === "string" && STAGES.includes(v);
}

export function isManagerActivityKind(v: unknown): v is ManagerActivityKind {
  return typeof v === "string" && ACTIVITIES.includes(v);
}

/**
 * Validate an untrusted request body. Split out from the endpoint so the
 * 400-path is unit-testable without standing up Fastify (same pattern as the
 * doctor install guard).
 */
export function parseManagerActivityBody(
  body: unknown,
): { ok: true; value: ManagerActivityInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  const changeId = b.changeId;
  if (typeof changeId !== "string" || changeId.trim() === "") {
    return { ok: false, error: "changeId must be a non-empty string" };
  }

  if (!isManagerActivityKind(b.activity)) {
    return {
      ok: false,
      error: `activity must be one of: ${ACTIVITIES.join(", ")}`,
    };
  }
  const activity = b.activity;

  // A clear ("idle") carries no meaningful stage — accept it without one.
  // Every other activity must name the stage being orchestrated.
  let stage: ManagerStage | undefined;
  if (activity === "idle") {
    if (b.stage !== undefined && !isManagerStage(b.stage)) {
      return { ok: false, error: `stage must be one of: ${STAGES.join(", ")}` };
    }
    stage = isManagerStage(b.stage) ? b.stage : undefined;
  } else {
    if (!isManagerStage(b.stage)) {
      return { ok: false, error: `stage must be one of: ${STAGES.join(", ")}` };
    }
    stage = b.stage;
  }

  if (b.detail !== undefined && typeof b.detail !== "string") {
    return { ok: false, error: "detail must be a string when present" };
  }

  return {
    ok: true,
    value: {
      changeId: changeId.trim(),
      stage,
      activity,
      ...(typeof b.detail === "string" ? { detail: b.detail } : {}),
    },
  };
}

/**
 * Set (or clear) the Manager activity for a change.
 *
 * Returns the stored record, or `null` when the write cleared the entry
 * (`activity === "idle"`). The return value IS the WS broadcast payload's
 * `activity` field — callers do not need a second lookup.
 *
 * `startedAt` is preserved across consecutive writes that do not change
 * `stage` + `activity`, so a skill that re-posts `waiting` with a refreshed
 * `detail` does not reset the elapsed clock the badge renders.
 */
export function setManagerActivity(update: ManagerActivityInput): ManagerActivity | null {
  if (update.activity === "idle") {
    clearManagerActivity(update.changeId);
    return null;
  }
  const prev = activities.get(update.changeId);
  const sameActivity =
    prev !== undefined && prev.stage === update.stage && prev.activity === update.activity;
  const record: ManagerActivity = {
    changeId: update.changeId,
    // `stage` is always present for non-idle activities (enforced by
    // parseManagerActivityBody); the fallback keeps direct callers honest.
    stage: update.stage ?? "code",
    activity: update.activity,
    startedAt: sameActivity ? prev.startedAt : Date.now(),
    ...(update.detail !== undefined ? { detail: update.detail } : {}),
  };
  activities.set(update.changeId, record);
  return record;
}

/** Remove the entry for a change. Returns true when something was removed. */
export function clearManagerActivity(changeId: string): boolean {
  return activities.delete(changeId);
}

export function getManagerActivity(changeId: string): ManagerActivity | undefined {
  return activities.get(changeId);
}

/** Bulk snapshot for `GET /api/manager/activity` and client bootstrap. */
export function getAllManagerActivities(): Record<string, ManagerActivity> {
  const out: Record<string, ManagerActivity> = {};
  for (const [id, a] of activities) out[id] = a;
  return out;
}

/** Test-only helper — the process-wide map would otherwise leak across specs. */
export function resetManagerActivities(): void {
  activities.clear();
}
