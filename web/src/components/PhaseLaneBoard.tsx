// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from "react";
import type { Change } from "../types";
import { PHASES, type Phase, laneForPhase } from "../phases";
import { KanbanCard } from "./KanbanCard";
import { useKanbanActions } from "../hooks/useKanbanActions";

/**
 * PhaseLaneBoard — the third Overview layout state alongside `board` (the
 * 3-column progress-derived TODO / IN-PROGRESS / DONE view) and `cards`
 * (the plain card grid). Landed by add-phase-lane-view-toggle.
 *
 * Layout:
 *   - Four lanes in pipeline order: propose → code → preview → done.
 *     Each lane displays a phase header + card count; an empty lane
 *     renders a muted placeholder rather than collapsing.
 *   - Changes without a resolved phase (undefined / unknown string /
 *     `needs-human` without a `priorPhase`) fold into the leftmost
 *     `Propose` lane as a starting-stage default. No separate
 *     "Unphased" section — the four lanes are the only rendered
 *     containers.
 *
 * Non-goals (spec):
 *   - No drag-and-drop between lanes (READ-ONLY — phase transitions
 *     happen Manager-driven, not by user gesture).
 *   - No needs-human WaitBadges or phase-derived affordances beyond the
 *     lane grouping itself.
 *   - Cards render identically to the Board view (shared `<KanbanCard>`
 *     component). Only the container / grouping differs.
 *
 * `needs-human` cards render in their `priorPhase` lane. If `priorPhase`
 * is also undefined, they fold into `propose` alongside other
 * unresolved-phase changes.
 */

const PHASE_LABEL: Record<Phase, string> = {
  proposed: "PROPOSE",
  coded: "CODE",
  reviewed: "PREVIEW",
  done: "DONE",
};

const PHASE_EMPTY: Record<Phase, string> = {
  proposed: "No changes at this phase.",
  coded: "No changes at this phase.",
  reviewed: "No changes at this phase.",
  done: "No changes at this phase.",
};

export type PhaseBuckets = {
  proposed: Change[];
  coded: Change[];
  reviewed: Change[];
  done: Change[];
};

/**
 * Bucket the change list by its persisted phase. The rules:
 *   - Known phase (proposed / coded / reviewed / done) → matching lane.
 *   - `needs-human` → use `priorPhase` if that resolves to a known lane.
 *   - Otherwise (undefined phase, unknown string, `needs-human` without a
 *     resolvable `priorPhase`) → folds into `proposed` as the starting-
 *     stage default so no change is dropped from view.
 */
export function bucketizeByPhase(changes: Change[]): PhaseBuckets {
  const b: PhaseBuckets = {
    proposed: [],
    coded: [],
    reviewed: [],
    done: [],
  };
  for (const c of changes) {
    // `laneForPhase` (web/src/phases.ts) owns these rules — shared with the
    // card's worker-state indicator, which compares the stage a worker
    // finished in against the change's current stage.
    b[laneForPhase(c.phase, c.priorPhase)].push(c);
  }
  return b;
}

export function PhaseLaneBoard({
  changes,
  onNewChange,
}: {
  changes: Change[];
  onNewChange: () => void;
}) {
  const { jobByChange, onStart, onArchive, onMerge, onDiscard, modals } = useKanbanActions();

  const buckets = useMemo(() => bucketizeByPhase(changes), [changes]);

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
      <div className="phase-lane-board">
        {PHASES.map((phase, i) => (
          <PhaseLane
            key={phase}
            title={PHASE_LABEL[phase]}
            count={buckets[phase].length}
            emptyText={PHASE_EMPTY[phase]}
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
            {buckets[phase].map(renderCard)}
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

