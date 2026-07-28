// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from "react";
import type { Change, AgentPublic, JobSummary, ManagerActivity } from "../types";
import { useStore } from "../store";
import { KanbanCard } from "./KanbanCard";
import { useKanbanActions } from "../hooks/useKanbanActions";

/**
 * PhaseLaneBoard — the third Overview layout state alongside `board` (the
 * 3-column progress-derived TODO / IN-PROGRESS / DONE view) and `cards`
 * (the plain card grid). Landed by add-phase-lane-view-toggle, redesigned
 * by dynamic-phase-lanes-from-agents-roles, RESHAPED by
 * reshape-phase-view-to-active-agent-state.
 *
 * Semantics (post-reshape):
 *   - **Phase view displays agent state, not phase state.**
 *   - A change appears ONLY when a role is actively in play — either via an
 *     active worker Job (Job.role) or an active Manager activity
 *     (ManagerActivity.role, e.g., Manager fallback verify).
 *   - Idle / queued changes do NOT appear — they belong in the Board view.
 *   - Bucketization key = the role currently being executed.
 *   - Only standard 4 roles are lane-eligible: propose / code / review /
 *     verify. `other` / custom roles are filtered out (Board view still
 *     shows them).
 *   - `phase === "done"` changes appear in the DONE lane regardless of
 *     activity, as historical record.
 *   - B2 policy: Manager between-role activities (dispatching / cleanup /
 *     transitioning) keep the change in its last role's lane — enforced
 *     server-side by preserving prev.role on updates that omit role.
 *
 * Non-goals:
 *   - No drag-and-drop.
 *   - No card badge for Manager activity (removed by this reshape —
 *     Terminal shows Manager state).
 */

/** Lane identifiers. Same set as the workflow roles (propose / code /
 *  review / verify) plus the terminal `done`. */
export type LaneId = "propose" | "code" | "review" | "verify" | "done";

const LANE_ORDER: readonly LaneId[] = ["propose", "code", "review", "verify", "done"];

/** Lanes that render regardless of what `agents.yaml` declares. */
const ALWAYS_PRESENT: readonly LaneId[] = ["code", "done"];

/** The 4 role values that map to Phase view lanes. Any other role (e.g.,
 *  `manager`, `other`, custom) is filtered out — those changes appear only
 *  in Board view. */
const STANDARD_ROLES: readonly string[] = ["propose", "code", "review", "verify"];

export const LANE_LABEL: Record<LaneId, string> = {
  propose: "PROPOSING",
  code: "CODING",
  review: "REVIEWING",
  verify: "VERIFYING",
  done: "DONE",
};

const LANE_EMPTY_TEXT = "No agent is currently on this role.";

export type Lane = { id: LaneId; label: string };

/**
 * Aggregate the role set across every declared agent and return the lanes
 * that should render, in workflow order.
 *
 * `code` and `done` are unconditional — Manager can fallback for either.
 * `propose` / `review` / `verify` appear only when at least one agent
 * declares that role, OR when Manager is currently doing fallback for it
 * (the latter is handled dynamically by including the lane when Manager
 * activity's role points there).
 */
export function deriveLaneList(agents: AgentPublic[] | undefined | null): Lane[] {
  const declared = new Set<string>();
  for (const agent of agents ?? []) {
    for (const role of agent?.roles ?? []) declared.add(role);
  }
  return LANE_ORDER.filter((id) => ALWAYS_PRESENT.includes(id) || declared.has(id)).map((id) => ({
    id,
    label: LANE_LABEL[id],
  }));
}

/** Buckets keyed by lane. Lanes absent from the `laneIds` argument are
 *  always empty arrays. */
export type PhaseBuckets = Record<LaneId, Change[]>;

/** Resolve the role currently in play for a change (post-reshape).
 *  Returns the role string or `undefined` if the change is idle. */
function activeRoleFor(
  change: Change,
  job: JobSummary | undefined,
  managerActivity: ManagerActivity | undefined,
): string | undefined {
  if (change.phase === "done") return "done";
  // Worker job takes precedence — a running worker is the authoritative
  // "code role is executing" signal, over Manager's "dispatching" activity.
  if (job && job.status === "running" && typeof job.role === "string") {
    return job.role;
  }
  // Manager activity — includes both direct fallback (Manager plays verify)
  // and between-role states (cleanup / transitioning) where prev.role is
  // preserved server-side per B2.
  if (managerActivity && managerActivity.activity !== "idle") {
    return managerActivity.role;
  }
  return undefined;
}

/**
 * Bucketize changes by the role currently being executed.
 *
 * Filters out any change without active role work (except `phase === "done"`
 * which is always displayed as DONE lane history).
 *
 * Restricts to the 4 standard roles. Any non-standard role (e.g., a
 * custom `other` role) is filtered out of Phase view — that change is
 * visible in Board view.
 */
export function bucketizeByActiveRole(
  changes: Change[],
  jobByChange: Map<string, JobSummary>,
  managerActivityByChange: Record<string, ManagerActivity>,
  laneIds: readonly LaneId[],
): PhaseBuckets {
  const buckets: PhaseBuckets = { propose: [], code: [], review: [], verify: [], done: [] };
  if (laneIds.length === 0) return buckets;

  for (const c of changes) {
    const job = jobByChange.get(c.id);
    const activity = managerActivityByChange[c.id];
    const role = activeRoleFor(c, job, activity);
    if (role === undefined) continue; // idle → not in Phase view
    if (role === "done") {
      // Terminal state — show in DONE lane if it exists.
      if (laneIds.includes("done")) buckets.done.push(c);
      continue;
    }
    if (!STANDARD_ROLES.includes(role)) continue; // A1: filter non-standard
    // Bucket into the role's lane if it exists; otherwise fall through to
    // DONE (rare — Manager falling back for a role no agent declared and
    // no lane derived).
    const target = laneIds.includes(role as LaneId) ? (role as LaneId) : "done";
    if (laneIds.includes(target)) buckets[target].push(c);
  }
  return buckets;
}

export function PhaseLaneBoard({
  changes,
}: {
  changes: Change[];
}) {
  const { jobByChange, onStart, onArchive, onMerge, onDiscard, modals } = useKanbanActions();
  const agents = useStore((s) => s.agents);
  const managerActivityByChange = useStore((s) => s.managerActivity);

  const lanes = useMemo(() => deriveLaneList(agents), [agents]);
  const buckets = useMemo(
    () =>
      bucketizeByActiveRole(
        changes,
        jobByChange,
        managerActivityByChange,
        lanes.map((l) => l.id),
      ),
    [changes, jobByChange, managerActivityByChange, lanes],
  );

  const renderCard = (c: Change) => (
    <KanbanCard
      key={c.id}
      change={c}
      job={jobByChange.get(c.id)}
      laneContext="phase"
      onStart={() => onStart(c)}
      onArchive={() => onArchive(c)}
      onMerge={(j) => onMerge(c, j)}
      onDiscard={(j) => onDiscard(c, j)}
    />
  );

  return (
    <>
      <div
        className="phase-lane-board"
        style={{ "--lane-count": lanes.length } as React.CSSProperties}
      >
        {lanes.map((lane) => (
          <PhaseLane
            key={lane.id}
            title={lane.label}
            count={buckets[lane.id].length}
            emptyText={LANE_EMPTY_TEXT}
          >
            {buckets[lane.id].map(renderCard)}
          </PhaseLane>
        ))}
      </div>

      {modals}
    </>
  );
}

function PhaseLane({
  title,
  count,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="kanban-col phase-lane">
      <header className="kanban-col-head phase-lane-header">
        <h3>
          {title} <span className="kanban-col-count">{count}</span>
        </h3>
      </header>
      <div className="kanban-col-body">
        {count === 0 ? (
          <p className="empty kanban-empty phase-lane-empty">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
