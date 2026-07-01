import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useStore } from "../store";
import { ProgressBar } from "./ProgressBar";
import { TagChipList } from "./TagChip";
import { CommandModal } from "./CommandModal";
import { injectPty } from "../api";
import type { Change, JobSummary } from "../types";
import { useStartFlow } from "../hooks/useStartFlow";
import { hasNonVerifyWork, isRunningOrPending } from "../util/changeState";

type ColumnId = "todo" | "inprogress" | "done";

type Buckets = {
  todo: Change[];
  inprogress: Change[];
  done: Change[]; // active changes with done == total > 0 (ready to archive)
};

function modalTitle(p: PendingDrag): string {
  if (p.kind === "apply") return "Apply this change";
  if (p.kind === "archive") return "Archive this change";
  if (p.kind === "agent-merge") return `Merge agent branch for ${p.change.id}`;
  return `Discard agent worktree for ${p.change.id}`;
}

function buildPendingCommand(p: PendingDrag, mode: string): string {
  const id = p.change.id;
  if (p.kind === "apply") return `/opsx:apply ${id}`;
  if (p.kind === "archive") return mode === "cli" ? `npx openspec archive ${id}` : `/opsx:archive ${id}`;
  if (p.kind === "agent-merge") return `git merge --no-ff ${p.job.branch}`;
  return `git worktree remove --force ${p.job.worktreePath} && git branch -D ${p.job.branch}`;
}

function modalSubmitLabel(p: PendingDrag, commandStyle: "claude" | "cli"): string {
  if (p.kind === "apply") return "Send /opsx:apply";
  if (p.kind === "archive") return commandStyle === "cli" ? "Send npx openspec archive" : "Send /opsx:archive";
  if (p.kind === "agent-merge") return "Send git merge";
  return "Send cleanup";
}


function bucketize(changes: Change[]): Buckets {
  const todo: Change[] = [];
  const inprogress: Change[] = [];
  const done: Change[] = [];
  for (const c of changes) {
    const { done: d, total } = c.progress;
    if (total === 0 || d === 0) todo.push(c);
    else if (d < total) inprogress.push(c);
    else done.push(c);
  }
  return { todo, inprogress, done };
}

type PendingDrag =
  | { kind: "apply"; change: Change }
  | { kind: "archive"; change: Change }
  | { kind: "agent-merge"; change: Change; job: JobSummary }
  | { kind: "agent-discard"; change: Change; job: JobSummary };

export function KanbanBoard({
  changes,
  onNewChange,
}: {
  changes: Change[];
  onNewChange: () => void;
}) {
  const buckets = useMemo(() => bucketize(changes), [changes]);
  const commandStyle = useStore((s) => s.commandStyle);
  const setCommandStyle = useStore((s) => s.setCommandStyle);
  const pushToast = useStore((s) => s.pushToast);
  const agents = useStore((s) => s.agents);
  const jobs = useStore((s) => s.jobs);
  const [pending, setPending] = useState<PendingDrag | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<ColumnId | null>(null);
  const { startImplementation, StartFlowModals } = useStartFlow();

  // Build a per-change "latest job" lookup so cards can show status.
  const jobByChange = useMemo(() => {
    const m = new Map<string, JobSummary>();
    for (const j of Object.values(jobs)) {
      const prev = m.get(j.changeId);
      if (!prev || j.startedAt > prev.startedAt) m.set(j.changeId, j);
    }
    return m;
  }, [jobs]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragStart = (e: DragStartEvent) => {
    const from = (e.active.data.current as { from?: ColumnId } | undefined)?.from;
    setDraggingFrom(from ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingFrom(null);
    const dropId = e.over?.id;
    if (!dropId) return;
    const fromCol = (e.active.data.current as { from?: ColumnId; id?: string } | undefined)?.from;
    const id = (e.active.data.current as { id?: string } | undefined)?.id;
    if (!fromCol || !id) return;
    const change = changes.find((c) => c.id === id);
    if (!change) return;

    if (fromCol === "todo" && dropId === "inprogress") {
      startImplementation(change).catch((err) => {
        console.error("[start] unhandled:", err);
        pushToast("error", err instanceof Error ? err.message : String(err));
      });
    }
    // any other combo: silently ignore (UI already disables them visually)
  };

  const onArchiveClick = (change: Change) => {
    setPending({ kind: "archive", change });
  };

  // Start button click. Same handler as the drag gesture — the unified
  // dispatcher picks worktree / terminal / picker as appropriate.
  const onStartClick = (change: Change) => {
    void startImplementation(change);
  };

  const onMergeClick = (change: Change, job: JobSummary) => {
    setPending({ kind: "agent-merge", change, job });
  };
  const onDiscardClick = (change: Change, job: JobSummary) => {
    setPending({ kind: "agent-discard", change, job });
  };

  const runInject = async (line: string) => {
    const res = await injectPty(line, true);
    if ((res as any).status === "ok") {
      pushToast("info", "Sent to terminal");
      setPending(null);
    } else if ((res as any).status === "no-terminal") {
      pushToast("error", (res as any).reason ?? "No terminal open. Open a change view to start one.");
    } else {
      pushToast("error", (res as any).error ?? "Inject failed");
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="kanban-board">
        <Column id="todo" title="TODO" count={buckets.todo.length} allowedFrom={null} draggingFrom={draggingFrom} onAdd={onNewChange}>
          {buckets.todo.map((c) => (
            <ChangeCard
              key={c.id}
              change={c}
              column="todo"
              job={jobByChange.get(c.id)}
              hasAgents={agents.length > 0}
              onStart={() => onStartClick(c)}
              hasExecution={c.proposal?.execution != null}
              onMerge={(j) => onMergeClick(c, j)}
              onDiscard={(j) => onDiscardClick(c, j)}
            />
          ))}
          {buckets.todo.length === 0 && <p className="empty kanban-empty">No proposed changes.</p>}
        </Column>

        <Column
          id="inprogress"
          title="IN-PROGRESS"
          count={buckets.inprogress.length}
          allowedFrom="todo"
          draggingFrom={draggingFrom}
        >
          {buckets.inprogress.map((c) => (
            <ChangeCard
              key={c.id}
              change={c}
              column="inprogress"
              job={jobByChange.get(c.id)}
              hasAgents={agents.length > 0}
              onStart={() => onStartClick(c)}
              hasExecution={c.proposal?.execution != null}
              onMerge={(j) => onMergeClick(c, j)}
              onDiscard={(j) => onDiscardClick(c, j)}
            />
          ))}
          {buckets.inprogress.length === 0 && <p className="empty kanban-empty">No work in progress.</p>}
        </Column>

        <Column id="done" title="DONE" count={buckets.done.length} allowedFrom={null} draggingFrom={draggingFrom}>
          {buckets.done.map((c) => (
            <ChangeCard
              key={c.id}
              change={c}
              column="done"
              onArchive={() => onArchiveClick(c)}
              job={jobByChange.get(c.id)}
              hasAgents={agents.length > 0}
              onStart={() => onStartClick(c)}
              hasExecution={c.proposal?.execution != null}
              onMerge={(j) => onMergeClick(c, j)}
              onDiscard={(j) => onDiscardClick(c, j)}
            />
          ))}
          {buckets.done.length === 0 && <p className="empty kanban-empty">Nothing waiting to archive.</p>}
        </Column>
      </div>

      {pending && (
        <CommandModal
          title={modalTitle(pending)}
          // Only Archive has a CLI equivalent (`npx openspec archive`); Apply
          // is Claude-only, so the mode selector is hidden for it.
          mode={pending.kind === "archive" ? commandStyle : undefined}
          onModeChange={pending.kind === "archive" ? setCommandStyle : undefined}
          build={(_input, m) => buildPendingCommand(pending, m ?? "claude")}
          submitLabel={modalSubmitLabel(pending, commandStyle)}
          onCancel={() => setPending(null)}
          onSubmit={runInject}
        >
          {pending.kind === "archive" && !pending.change.hasOutcome && (
            <div className="modal-warning">⚠ No outcome.md yet — write one before archiving.</div>
          )}
          {pending.kind === "apply" && commandStyle === "cli" && (
            <div className="modal-warning">
              Apply requires Claude Code in the terminal. Switch to Claude mode to send this.
            </div>
          )}
          {pending.kind === "agent-discard" && (
            <div className="modal-warning">
              ⚠ This removes the worktree AND deletes branch <code>{pending.job.branch}</code>.
            </div>
          )}
        </CommandModal>
      )}

      <StartFlowModals />
    </DndContext>
  );
}

function Column({
  id,
  title,
  count,
  allowedFrom,
  draggingFrom,
  children,
  onAdd,
}: {
  id: ColumnId | "done";
  title: string;
  count: number;
  allowedFrom: ColumnId | null;
  draggingFrom: ColumnId | null;
  children: React.ReactNode;
  onAdd?: () => void;
}) {
  // The "done" outer column itself isn't a drop target; the archived sub
  // section inside is. So we only register a droppable for the inprogress
  // column at this level.
  const { setNodeRef, isOver } = useDroppable({ id, disabled: id !== "inprogress" });
  const legal = draggingFrom != null && allowedFrom === draggingFrom;
  const blocked =
    draggingFrom != null && id !== draggingFrom && allowedFrom !== draggingFrom && id === "inprogress";
  return (
    <section
      ref={id === "inprogress" ? setNodeRef : undefined}
      className={`kanban-col${legal && isOver ? " over-legal" : ""}${blocked && isOver ? " over-blocked" : ""}`}
    >
      <header className="kanban-col-head">
        <h3>
          {title} <span className="kanban-col-count">{count}</span>
        </h3>
        {onAdd && (
          <button className="primary kanban-add" onClick={onAdd}>
            + New Change
          </button>
        )}
      </header>
      <div className="kanban-col-body">{children}</div>
    </section>
  );
}

function ChangeCard({
  change,
  column,
  onArchive,
  job,
  hasAgents,
  onStart,
  hasExecution: _hasExecution,
  onMerge,
  onDiscard,
}: {
  change: Change;
  column: ColumnId;
  onArchive?: () => void;
  job?: JobSummary;
  hasAgents: boolean;
  onStart: () => void;
  hasExecution: boolean;
  onMerge: (job: JobSummary) => void;
  onDiscard: (job: JobSummary) => void;
}) {
  // Cards are draggable from TODO only; IN-PROGRESS is read-only; DONE has the
  // Archive button instead of being draggable.
  const draggable = column === "todo";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card-${change.id}`,
    data: { from: column, id: change.id },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`kanban-card${isDragging ? " dragging" : ""}${draggable ? " draggable" : ""}`}
    >
      <Link to={`/change/${encodeURIComponent(change.id)}`} className="kanban-card-link" onClick={(e) => e.stopPropagation()}>
        <div className="kanban-card-head">
          <h4>{change.id}</h4>
          {column === "done" && <span className="kanban-ready-dot" title="All tasks complete · ready to archive" />}
          <AgentBadge job={job} />
          {/* assignee badge slot (reserved for future add-task-assignment) */}
          <span className="kanban-card-assignee-slot" />
        </div>
        {change.proposal?.intent && <p className="kanban-card-intent">{change.proposal.intent}</p>}
        <ProgressBar progress={change.progress} />
      </Link>
      {change.proposal?.tags && change.proposal.tags.length > 0 && (
        // Tags live OUTSIDE the card's <Link> because each chip is itself a
        // <Link to="/tags/…"> and HTML forbids nested <a>.
        <div className="kanban-card-tags">
          <TagChipList tags={change.proposal.tags} small />
        </div>
      )}
      <div className="kanban-card-actions">
        {column === "done" && onArchive && (
          <button
            className="action-btn ghost"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onArchive();
            }}
          >
            Archive
            {!change.hasOutcome && <span className="kanban-card-warn" title="No outcome.md yet">⚠</span>}
          </button>
        )}
        {hasAgents &&
          (column === "todo" || column === "inprogress") &&
          !isRunningOrPending(job) &&
          (hasNonVerifyWork(change.tasks) ? (
            <button
              className="action-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStart();
              }}
              title={
                change.proposal?.execution === "worktree"
                  ? "Start (worktree)"
                  : change.proposal?.execution === "terminal"
                    ? "Start (terminal)"
                    : "Start (will ask how to execute)"
              }
            >
              Start
            </button>
          ) : (
            <span
              className="kanban-verify-only"
              title="All remaining tasks are under a verification section — human review needed."
            >
              verify only
            </span>
          ))}
        {hasAgents && job && job.status !== "running" && isMergeable(job) && (
          <>
            <Link
              to={`/agents?job=${encodeURIComponent(job.id)}&tab=diff`}
              className="action-btn ghost"
              onClick={(e) => e.stopPropagation()}
            >
              View diff
            </Link>
            <button
              className="action-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMerge(job);
              }}
            >
              Merge
            </button>
            <button
              className="action-btn ghost"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDiscard(job);
              }}
            >
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AgentBadge({ job }: { job?: JobSummary }) {
  if (!job) return null;
  if (job.status === "running") {
    return (
      <span className="agent-badge running" title={`Agent ${job.agentName} running`}>
        <span className="agent-pulse" /> {job.agentName}
      </span>
    );
  }
  if (job.status === "completed") {
    return (
      <span className="agent-badge ok" title="Ready to merge">
        ✓ ready
      </span>
    );
  }
  if (job.status === "cancelled") {
    return <span className="agent-badge muted">cancelled</span>;
  }
  return <span className="agent-badge fail" title={`exit ${job.exitCode ?? "?"}`}>✗ failed</span>;
}

function isMergeable(job: JobSummary): boolean {
  // Show Merge/Discard only when a worktree is sitting around (any post-running state).
  return job.status === "completed" || job.status === "crashed" || job.status === "cancelled";
}

