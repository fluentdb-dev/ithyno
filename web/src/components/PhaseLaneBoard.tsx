// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from "react";
import type { Change, AgentPublic } from "../types";
import { type Phase, isPhase, NEEDS_HUMAN } from "../phases";
import { useStore } from "../store";
import { KanbanCard } from "./KanbanCard";
import { useKanbanActions } from "../hooks/useKanbanActions";

/**
 * PhaseLaneBoard — the third Overview layout state alongside `board` (the
 * 3-column progress-derived TODO / IN-PROGRESS / DONE view) and `cards`
 * (the plain card grid). Landed by add-phase-lane-view-toggle, redesigned
 * by dynamic-phase-lanes-from-agents-roles.
 *
 * Layout:
 *   - Lanes are DERIVED from `agents.yaml` roles (read off the store's
 *     `agents` field, which `/api/agents/config` populates and the
 *     `agents-updated` WS event refreshes). The lane list is built in
 *     workflow order `[propose?, code, review?, verify?, done]`:
 *       * `code` is always present — the Manager self-dispatches via the
 *         Task tool when no `code`-role agent is declared.
 *       * `done` is always present — terminal state.
 *       * `propose` / `review` / `verify` appear only when at least one
 *         agent declares that role. A stage nobody will ever run is not a
 *         meaningful lane; rendering it would be a permanently empty column.
 *   - Each lane displays a label + card count; an empty lane renders a
 *     muted placeholder rather than collapsing.
 *   - The grid column count follows the lane count via the `--lane-count`
 *     CSS variable set inline on the container.
 *
 * Bucketization is SHIFTED BY ONE relative to the persisted phase: a change
 * sits in the lane for the NEXT stage it awaits, not the last stage it
 * completed. `proposed` (propose stage finished) waits on code, so it lands
 * in `CODING`. When the target lane is absent from the derived list the
 * change falls through (usually to `DONE`) — no change is ever dropped.
 *
 * Non-goals (spec):
 *   - No drag-and-drop between lanes (READ-ONLY — phase transitions
 *     happen Manager-driven, not by user gesture).
 *   - No needs-human WaitBadges or phase-derived affordances beyond the
 *     lane grouping itself.
 *   - Cards render identically to the Board view (shared `<KanbanCard>`
 *     component). Only the container / grouping differs.
 */

/** Lane identifiers. These are workflow STAGES (agents.yaml role names plus
 *  the terminal `done`), not `Phase` values — the two vocabularies differ
 *  deliberately, see the shift-by-one note above. */
export type LaneId = "propose" | "code" | "review" | "verify" | "done";

/** Canonical workflow order. `deriveLaneList` filters this, never reorders. */
const LANE_ORDER: readonly LaneId[] = ["propose", "code", "review", "verify", "done"];

/** Lanes that render regardless of what `agents.yaml` declares. */
const ALWAYS_PRESENT: readonly LaneId[] = ["code", "done"];

export const LANE_LABEL: Record<LaneId, string> = {
  propose: "PROPOSING",
  code: "CODING",
  review: "REVIEWING",
  verify: "VERIFYING",
  done: "DONE",
};

const LANE_EMPTY_TEXT = "No changes at this phase.";

export type Lane = { id: LaneId; label: string };

/**
 * Aggregate the role set across every declared agent and return the lanes
 * that should render, in workflow order.
 *
 * `code` and `done` are unconditional (see the component docblock).
 * `propose` / `review` / `verify` require at least one agent to declare the
 * role. Roles that are not lane identifiers (`manager`, `other`, custom
 * labels) are ignored.
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
 *  always empty arrays — the renderer iterates the derived lane list, not
 *  this object's keys. */
export type PhaseBuckets = Record<LaneId, Change[]>;

/**
 * Preferred lane per resolved phase, most-specific first. `bucketizeByPhase`
 * walks the list and takes the first entry present in `laneIds`; if none
 * match it falls back to `laneIds[0]` so nothing is dropped.
 *
 * `unphased` covers undefined phase and unknown phase strings.
 */
const LANE_PREFERENCE: Record<Phase | "unphased", readonly LaneId[]> = {
  unphased: ["propose", "code", "done"],
  proposed: ["code", "done"],
  coded: ["review", "done"],
  reviewed: ["verify", "done"],
  done: ["done"],
};

function pickLane(key: Phase | "unphased", laneIds: readonly LaneId[]): LaneId {
  for (const candidate of LANE_PREFERENCE[key]) {
    if (laneIds.includes(candidate)) return candidate;
  }
  return laneIds[0];
}

/**
 * Route each change to the lane for the NEXT stage it awaits.
 *
 *   - undefined / unknown phase → `propose` when that lane exists, else the
 *     first lane.
 *   - `proposed` → `code`.
 *   - `coded` → `review` when declared, else `done`.
 *   - `reviewed` → `verify` when declared, else `done`.
 *   - `done` → `done`.
 *   - `needs-human` → resolved via `priorPhase` under the same rules; an
 *     unresolvable `priorPhase` folds into the first lane.
 *
 * `laneIds` comes from `deriveLaneList`, so the output only ever populates
 * lanes that are actually rendered.
 */
export function bucketizeByPhase(changes: Change[], laneIds: readonly LaneId[]): PhaseBuckets {
  const buckets: PhaseBuckets = { propose: [], code: [], review: [], verify: [], done: [] };
  if (laneIds.length === 0) return buckets;

  for (const c of changes) {
    const raw = c.phase;
    let lane: LaneId;
    if (isPhase(raw)) {
      lane = pickLane(raw, laneIds);
    } else if (raw === NEEDS_HUMAN) {
      // needs-human is a hold, not a stage — resolve through the phase the
      // change was in when it stalled. Unresolvable → first lane.
      lane = isPhase(c.priorPhase) ? pickLane(c.priorPhase, laneIds) : laneIds[0];
    } else {
      lane = pickLane("unphased", laneIds);
    }
    buckets[lane].push(c);
  }
  return buckets;
}

export function PhaseLaneBoard({
  changes,
  onNewChange,
}: {
  changes: Change[];
  onNewChange: () => void;
}) {
  const { jobByChange, onStart, onArchive, onMerge, onDiscard, modals } = useKanbanActions();
  // Sourced from `/api/agents/config` and kept fresh by the `agents-updated`
  // WS event, so an agents.yaml edit re-derives the lanes without a reload.
  const agents = useStore((s) => s.agents);

  const lanes = useMemo(() => deriveLaneList(agents), [agents]);
  const buckets = useMemo(
    () =>
      bucketizeByPhase(
        changes,
        lanes.map((l) => l.id),
      ),
    [changes, lanes],
  );

  const renderCard = (c: Change) => (
    <KanbanCard
      key={c.id}
      change={c}
      job={jobByChange.get(c.id)}
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
        {lanes.map((lane, i) => (
          <PhaseLane
            key={lane.id}
            title={lane.label}
            count={buckets[lane.id].length}
            emptyText={LANE_EMPTY_TEXT}
            headerAction={
              // The "+ New Change" affordance lives in the leftmost lane
              // to match the Board view's TODO-column placement.
              i === 0 ? (
                <button className="primary kanban-add" onClick={onNewChange}>
                  + New Change
                </button>
              ) : null
            }
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
  headerAction,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="kanban-col phase-lane">
      <header className="kanban-col-head phase-lane-header">
        <h3>
          {title} <span className="kanban-col-count">{count}</span>
        </h3>
        {headerAction}
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
