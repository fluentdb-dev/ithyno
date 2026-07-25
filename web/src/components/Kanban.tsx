// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from "react";
import type { Change } from "../types";
import { KanbanCard } from "./KanbanCard";
import { useKanbanActions } from "../hooks/useKanbanActions";

/**
 * Kanban is a *state monitor* — it shows a classic three-column
 * TODO / IN-PROGRESS / DONE view of every change, driven by task
 * progress. Phase state (`change.phase`) is a Manager-internal
 * concern and is NOT rendered on the board (revert-kanban-ui-lanes:
 * the Kanban structure principle is "3 columns only"). A user who
 * WANTS the pipeline view opts in via the Overview layout toggle
 * (add-phase-lane-view-toggle) which swaps this component for
 * `<PhaseLaneBoard>`.
 *
 * User-facing affordances are limited to:
 *   - `+ New Change` (top toolbar) → proposal creation
 *   - `Start` / `Apply` (per card) → hand-off to the agent runner
 *   - `Archive` / `Merge` / `Discard` (per card) → post-completion openspec steps
 *
 * Changes escalated to `needs-human` render in their normal progress
 * column with no badge — the escalation Q&A itself is handled agent-side
 * (Manager spawns an interactive Claude session and reports via the
 * notification chain). The dashboard has no needs-human affordance.
 */

type Slot = "todo" | "inprogress" | "done";

type Buckets = {
  todo: Change[];
  inprogress: Change[];
  done: Change[];
};

/**
 * Folder-driven placement (post collapse-jobregistry-and-add-semaphore).
 * Uses filesystem state only — no consultation of an in-memory job
 * registry. Order (first match wins):
 *
 *   1. `.worktrees/<id>/openspec/changes/<id>/tasks.md` all-ticked → DONE
 *   2. `.worktrees/<id>/` exists (worktree in flight)             → IN-PROGRESS
 *   3. main-tree tasks all-ticked (total > 0)                     → DONE
 *   4. main-tree progress.done > 0 (partial)                      → IN-PROGRESS
 *   5. else                                                        → TODO
 *
 * Archive-based DONE is handled elsewhere — archived changes aren't in
 * the `changes` array, they're in `state.archive`.
 */
function bucketize(changes: Change[]): Buckets {
  const todo: Change[] = [];
  const inprogress: Change[] = [];
  const done: Change[] = [];
  for (const c of changes) {
    const wt = c.worktree;
    if (wt) {
      const wtp = wt.tasksProgress;
      if (wtp.total > 0 && wtp.done === wtp.total) done.push(c);
      else inprogress.push(c);
      continue;
    }
    const { done: d, total } = c.progress;
    if (total > 0 && d === total) done.push(c);
    else if (d > 0) inprogress.push(c);
    else todo.push(c);
  }
  return { todo, inprogress, done };
}

const COL_LABEL: Record<Slot, string> = {
  todo: "TODO",
  inprogress: "IN-PROGRESS",
  done: "DONE",
};

const COL_EMPTY: Record<Slot, string> = {
  todo: "No changes waiting to start.",
  inprogress: "Nothing in progress.",
  done: "Nothing ready to archive.",
};

export function KanbanBoard({
  changes,
  onNewChange,
}: {
  changes: Change[];
  onNewChange: () => void;
}) {
  const { jobByChange, onStart, onArchive, onMerge, onDiscard, modals } = useKanbanActions();

  const buckets = useMemo(() => bucketize(changes), [changes]);

  const renderCard = (c: Change) => (
    <KanbanCard
      key={c.id}
      change={c}
      job={jobByChange.get(c.id)}
      laneContext="board"
      onStart={() => onStart(c)}
      onArchive={() => onArchive(c)}
      onMerge={(j) => onMerge(c, j)}
      onDiscard={(j) => onDiscard(c, j)}
    />
  );

  const columns: Slot[] = ["todo", "inprogress", "done"];

  return (
    <>
      <div className="kanban-board">
        {columns.map((slot) => {
          // Spec: TODO column carries "+ New Change".
          // IN-PROGRESS and DONE carry no column-header Start selector
          // (hide-start-in-progress-column: "Column-header Start selector is
          // TODO-only"). The ParallelStartLauncher belongs only in TODO where
          // bulk-starting TODO→IN-PROGRESS makes semantic sense.
          const headerAction =
            slot === "todo" ? (
              <button className="primary kanban-add" onClick={onNewChange}>
                + New Change
              </button>
            ) : null;
          return (
            <Column
              key={slot}
              title={COL_LABEL[slot]}
              count={buckets[slot].length}
              emptyText={COL_EMPTY[slot]}
              headerAction={headerAction}
            >
              {buckets[slot].map(renderCard)}
            </Column>
          );
        })}
      </div>

      {modals}
    </>
  );
}

function Column({
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
    <section className="kanban-col">
      <header className="kanban-col-head">
        <h3>
          {title} <span className="kanban-col-count">{count}</span>
        </h3>
        {headerAction}
      </header>
      <div className="kanban-col-body">
        {count === 0 ? <p className="empty kanban-empty">{emptyText}</p> : children}
      </div>
    </section>
  );
}

/**
 * Returns the type of column-header action for a given slot.
 * Per hide-start-in-progress-column: the "Start ▾ (N)" bulk selector
 * (represented as "start-launcher") is TODO-only. IN-PROGRESS and DONE
 * return null (no header action).
 *
 * Exported for unit tests — this is the pure logic extracted from the JSX
 * ternary in KanbanBoard.
 */
export function columnHeaderActionType(slot: Slot): "new-change" | null {
  if (slot === "todo") return "new-change";
  return null;
}

// `perCardStartEligible` moved to `./KanbanCard.tsx`; re-exported here for
// backward-compat with existing tests / call sites.
export { perCardStartEligible } from "./KanbanCard";

export { bucketize };
