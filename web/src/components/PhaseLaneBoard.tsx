// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from "react";
import type { Change } from "../types";
import { PHASES, type Phase, isPhase, NEEDS_HUMAN } from "../phases";
import { KanbanCard } from "./KanbanCard";
import { bucketize } from "./Kanban";
import { useKanbanActions } from "../hooks/useKanbanActions";

/**
 * PhaseLaneBoard — the third Overview layout state alongside `board` (the
 * 3-column progress-derived TODO / IN-PROGRESS / DONE view) and `cards`
 * (the plain card grid). Landed by add-phase-lane-view-toggle.
 *
 * Layout:
 *   - Four lanes in pipeline order: proposed → coded → reviewed → done.
 *     Each lane displays a phase-name header + card count; an empty lane
 *     renders a muted placeholder rather than collapsing.
 *   - An Unphased fallback section BELOW the four lanes, containing
 *     changes whose `phase` is undefined or an unknown string. The
 *     fallback reuses the same 3-column TODO / IN-PROGRESS / DONE
 *     grouping (via `bucketize()`) as the Board view, so nothing is
 *     dropped from sight. When the Unphased set is empty, the section
 *     doesn't render at all.
 *
 * Non-goals (spec):
 *   - No drag-and-drop between lanes (the layout is READ-ONLY — phase
 *     transitions happen Manager-driven, not by user gesture).
 *   - No needs-human WaitBadges or phase-derived affordances beyond the
 *     lane grouping itself.
 *   - Cards render identically to the Board view (shared `<KanbanCard>`
 *     component). Only the container / grouping differs.
 *
 * `needs-human` cards render in their `priorPhase` lane. If `priorPhase`
 * is also undefined (or unrecognized), they fall through to the Unphased
 * section — same failure mode as any other change without a resolvable
 * phase.
 */

const PHASE_LABEL: Record<Phase, string> = {
  proposed: "PROPOSED",
  coded: "CODED",
  reviewed: "REVIEWED",
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
  unphased: Change[];
};

/**
 * Bucket the change list by its persisted phase. The rules match the spec:
 *   - Known phase (proposed / coded / reviewed / done) → matching lane.
 *   - `needs-human` → use `priorPhase` if that resolves to a known lane.
 *   - Otherwise (undefined phase, unknown string, `needs-human` without a
 *     resolvable `priorPhase`) → `unphased`.
 */
export function bucketizeByPhase(changes: Change[]): PhaseBuckets {
  const b: PhaseBuckets = {
    proposed: [],
    coded: [],
    reviewed: [],
    done: [],
    unphased: [],
  };
  for (const c of changes) {
    const raw = c.phase;
    if (isPhase(raw)) {
      b[raw].push(c);
      continue;
    }
    if (raw === NEEDS_HUMAN && isPhase(c.priorPhase)) {
      b[c.priorPhase].push(c);
      continue;
    }
    b.unphased.push(c);
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
  const unphasedBuckets = useMemo(() => bucketize(buckets.unphased), [buckets.unphased]);

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

      {buckets.unphased.length > 0 && (
        <UnphasedSection buckets={unphasedBuckets} renderCard={renderCard} />
      )}

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

const UNPHASED_LABEL: Record<"todo" | "inprogress" | "done", string> = {
  todo: "TODO",
  inprogress: "IN-PROGRESS",
  done: "DONE",
};

function UnphasedSection({
  buckets,
  renderCard,
}: {
  buckets: { todo: Change[]; inprogress: Change[]; done: Change[] };
  renderCard: (c: Change) => React.ReactNode;
}) {
  const total = buckets.todo.length + buckets.inprogress.length + buckets.done.length;
  const subKeys: Array<"todo" | "inprogress" | "done"> = ["todo", "inprogress", "done"];
  return (
    <section className="phase-unphased-section">
      <header className="phase-unphased-head">
        <h3>
          UNPHASED <span className="kanban-col-count">{total}</span>
        </h3>
        <span className="phase-unphased-hint">
          Changes without a resolved phase — grouped by progress.
        </span>
      </header>
      <div className="phase-unphased-body kanban-board">
        {subKeys.map((k) => (
          <section key={k} className="kanban-col">
            <header className="kanban-col-head">
              <h3>
                {UNPHASED_LABEL[k]} <span className="kanban-col-count">{buckets[k].length}</span>
              </h3>
            </header>
            <div className="kanban-col-body">
              {buckets[k].length === 0 ? (
                <p className="empty kanban-empty">—</p>
              ) : (
                buckets[k].map(renderCard)
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
