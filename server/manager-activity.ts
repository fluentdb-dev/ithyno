// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Per-change Manager activity tracking (expose-manager-activity-per-change,
 * reshaped by reshape-phase-view-to-active-agent-state).
 *
 * The Manager (the `/ithy-opsx:dispatch` orchestrator running in the PTY)
 * publishes what it is currently doing for a given change at every
 * orchestration boundary. The Phase view uses this signal to decide which
 * role lane a change appears in — the client-side badge on the Kanban card
 * was removed per user preference ("Terminal で分かるので不要").
 *
 * **In-memory only.** There is deliberately no sidecar field and no
 * persistence: this is transient orchestration state, not workflow history.
 * A server restart clears everything; the dispatch skill re-posts the current
 * activity as it re-enters its loop.
 */

/** The workflow role the Manager is currently executing.
 *  Unified with JobSummary.role — Manager IS always playing one of these
 *  roles at any active moment (fallback verify = Manager playing verify). */
export type ManagerRole = "propose" | "code" | "review" | "verify";

/** What the Manager is doing within that role. */
export type ManagerActivityKind =
  | "dispatching"
  | "waiting"
  | "judging"
  | "cleanup"
  | "transitioning"
  | "idle";

export type ManagerActivity = {
  changeId: string;
  role: ManagerRole;
  activity: ManagerActivityKind;
  /** epoch ms — when this activity became current. */
  startedAt: number;
  /** Short human-readable hint (worker name, cleanup step, …). */
  detail?: string;
};

/** Write shape accepted by `POST /api/manager/activity`.
 *  Accepts both `role` (preferred) and `stage` (deprecated alias, one release
 *  cycle). See reshape-phase-view-to-active-agent-state — Manager `stage`
 *  was renamed to `role` for unified vocabulary. */
export type ManagerActivityInput = {
  changeId: string;
  /** Optional only when `activity === "idle"` (a clear needs no role). */
  role?: ManagerRole;
  activity: ManagerActivityKind;
  detail?: string;
};

const ROLES: readonly string[] = ["propose", "code", "review", "verify"];
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

export function isManagerRole(v: unknown): v is ManagerRole {
  return typeof v === "string" && ROLES.includes(v);
}

export function isManagerActivityKind(v: unknown): v is ManagerActivityKind {
  return typeof v === "string" && ACTIVITIES.includes(v);
}

/**
 * Validate an untrusted request body. Split out from the endpoint so the
 * 400-path is unit-testable without standing up Fastify.
 *
 * Accepts both `role` (preferred) and `stage` (deprecated alias) — see the
 * type doc. When both are present, `role` wins. When only `stage` is
 * present, coerce and log deprecation.
 */
export function parseManagerActivityBody(
  body: unknown,
): { ok: true; value: ManagerActivityInput; deprecatedStage: boolean } | { ok: false; error: string } {
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

  // Accept role (preferred) or stage (deprecated alias). `role` wins when both.
  const roleField = b.role !== undefined ? b.role : b.stage;
  const deprecatedStage = b.role === undefined && b.stage !== undefined;

  // A clear ("idle") carries no meaningful role — accept it without one.
  // Every other activity must name the role being executed.
  let role: ManagerRole | undefined;
  if (activity === "idle") {
    if (roleField !== undefined && !isManagerRole(roleField)) {
      return { ok: false, error: `role must be one of: ${ROLES.join(", ")}` };
    }
    role = isManagerRole(roleField) ? roleField : undefined;
  } else {
    if (!isManagerRole(roleField)) {
      return { ok: false, error: `role must be one of: ${ROLES.join(", ")}` };
    }
    role = roleField;
  }

  if (b.detail !== undefined && typeof b.detail !== "string") {
    return { ok: false, error: "detail must be a string when present" };
  }

  return {
    ok: true,
    value: {
      changeId: changeId.trim(),
      role,
      activity,
      ...(typeof b.detail === "string" ? { detail: b.detail } : {}),
    },
    deprecatedStage,
  };
}

/**
 * Set (or clear) the Manager activity for a change.
 *
 * Returns the stored record, or `null` when the write cleared the entry
 * (`activity === "idle"`). The return value IS the WS broadcast payload's
 * `activity` field.
 *
 * `startedAt` is preserved across consecutive writes that do not change
 * `role` + `activity`, so a skill that re-posts `waiting` with a refreshed
 * `detail` does not reset the elapsed clock.
 *
 * **B2 policy (reshape-phase-view-to-active-agent-state)**: when a subsequent
 * update omits `role`, the previous `role` is preserved. This keeps a change
 * in its last role's lane during Manager between-role activities
 * (dispatching / cleanup / transitioning). Only writing a new role
 * explicitly moves the change to a new lane.
 */
export function setManagerActivity(update: ManagerActivityInput): ManagerActivity | null {
  if (update.activity === "idle") {
    clearManagerActivity(update.changeId);
    return null;
  }
  const prev = activities.get(update.changeId);
  // B2: preserve prev.role when the update omits it.
  const nextRole: ManagerRole = update.role ?? prev?.role ?? "code";
  const sameActivity =
    prev !== undefined && prev.role === nextRole && prev.activity === update.activity;
  const record: ManagerActivity = {
    changeId: update.changeId,
    role: nextRole,
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
