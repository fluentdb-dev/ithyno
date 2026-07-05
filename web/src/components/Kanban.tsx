// SPDX-License-Identifier: GPL-3.0-or-later
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
import type { DragEndEvent } from "@dnd-kit/core";
import { useStore } from "../store";
import { ProgressBar } from "./ProgressBar";
import { TagChipList } from "./TagChip";
import { CommandModal } from "./CommandModal";
import { injectPty, setChangePhase } from "../api";
import type { Change, JobSummary } from "../types";
import { useStartFlow } from "../hooks/useStartFlow";
import { hasNonVerifyWork } from "../util/changeState";
import { ParallelStartLauncher } from "./ParallelStartLauncher";
import { PHASES, NEEDS_HUMAN, type Phase, isPhase } from "../phases";

/**
 * add-kanban-phase-lanes: the Kanban is now organized around workflow
 * phase. Cards for changes that carry a `phase:` sidecar value are
 * placed in one of 4 phase lanes (proposed → coded → reviewed → done).
 * Everything else — legacy changes with no phase, or changes with a
 * phase string the client doesn't understand — falls back into an
 * "Unphased" section that reuses the pre-existing progress-derived
 * todo / inprogress / done grouping.
 *
 * The old 3-column ColumnId type is gone. The two relevant coordinate
 * systems here are:
 *   - `Slot`: where a rendered card *lives* (phase lane OR one of the
 *     3 unphased sub-buckets). Used to pick which action buttons the
 *     card shows.
 *   - `DropTargetId`: what a drop target announces itself as. The 4
 *     phase lanes are drop targets; the Unphased section is not (drops
 *     onto Unphased would mean "unset the phase" which the API can't
 *     express yet).
 */

type UnphasedSubBucket = "unphased-todo" | "unphased-inprogress" | "unphased-done";
type Slot = Phase | UnphasedSubBucket | "needs-human";
type DropTargetId = Phase;

type PhaseBuckets = {
  proposed: Change[];
  coded: Change[];
  reviewed: Change[];
  done: Change[];
  unphased: Change[];
  needsHuman: Change[];
};

type UnphasedBuckets = {
  todo: Change[];
  inprogress: Change[];
  done: Change[];
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
  if (p.kind === "archive") return mode === "cli" ? `npx openspec archive ${id}` : `/ithy-opsx:archive ${id}`;
  if (p.kind === "agent-merge") {
    // Claude mode delegates to the ithy-opsx-merge skill so the auto-stash /
    // auto-pop dance handles a dirty main tree; CLI mode keeps the raw git
    // invocation (users who chose CLI expect to handle stashing themselves).
    return mode === "cli" ? `git merge --no-ff ${p.job.branch}` : `/ithy-opsx:merge ${id}`;
  }
  return `git worktree remove --force ${p.job.worktreePath} && git branch -D ${p.job.branch}`;
}

function modalSubmitLabel(p: PendingDrag, commandStyle: "claude" | "cli"): string {
  if (p.kind === "apply") return "Send /opsx:apply";
  if (p.kind === "archive") return commandStyle === "cli" ? "Send npx openspec archive" : "Send /ithy-opsx:archive";
  if (p.kind === "agent-merge") return commandStyle === "cli" ? "Send git merge" : "Send /ithy-opsx:merge";
  return "Send cleanup";
}

/**
 * Bucket changes by their persisted phase. Anything without a recognized
 * phase (missing, unknown string, or a value like `needs-human` we don't
 * treat as a lane yet) falls into `unphased`. The Unphased section then
 * uses `bucketizeByProgress` to sub-group its members todo/inprogress/done.
 */
function bucketize(changes: Change[]): PhaseBuckets {
  const b: PhaseBuckets = {
    proposed: [],
    coded: [],
    reviewed: [],
    done: [],
    unphased: [],
    needsHuman: [],
  };
  for (const c of changes) {
    if (isPhase(c.phase)) b[c.phase].push(c);
    else if (c.phase === NEEDS_HUMAN) b.needsHuman.push(c);
    else b.unphased.push(c);
  }
  // Sort needs-human by wait time (longest wait first) so the top of the
  // lane is the most-neglected escalation. Fallback ordering by id keeps
  // it stable when escalatedAt is missing (should not happen but tolerated).
  b.needsHuman.sort((a, b2) => {
    const at = a.escalatedAt ?? "";
    const bt = b2.escalatedAt ?? "";
    if (at < bt) return -1;
    if (at > bt) return 1;
    return a.id.localeCompare(b2.id);
  });
  return b;
}

/**
 * Pre-existing progress-derived bucketing, kept here to power the Unphased
 * section. A change is:
 *   - `done` if all tasks are ticked (progress complete),
 *   - `inprogress` if a live/orphaned/completed job is attached, else
 *   - `todo` (no started work).
 */
function bucketizeByProgress(changes: Change[], jobByChange: Map<string, JobSummary>): UnphasedBuckets {
  const todo: Change[] = [];
  const inprogress: Change[] = [];
  const done: Change[] = [];
  for (const c of changes) {
    const { done: d, total } = c.progress;
    const job = jobByChange.get(c.id);
    const hasActiveJob = !!job && (job.status === "running" || isPendingMergeOrDiscard(job));
    if (d === total && total > 0) done.push(c);
    else if (hasActiveJob) inprogress.push(c);
    else if (total === 0 || d === 0) todo.push(c);
    else inprogress.push(c);
  }
  return { todo, inprogress, done };
}

function isPendingMergeOrDiscard(job: JobSummary): boolean {
  return (
    job.status === "completed" ||
    job.status === "crashed" ||
    job.status === "cancelled" ||
    job.status === "orphaned"
  );
}

type PendingDrag =
  | { kind: "apply"; change: Change }
  | { kind: "archive"; change: Change }
  | { kind: "agent-merge"; change: Change; job: JobSummary }
  | { kind: "agent-discard"; change: Change; job: JobSummary };

const PHASE_LABEL: Record<Phase, string> = {
  proposed: "PROPOSED",
  coded: "CODED",
  reviewed: "REVIEWED",
  done: "DONE",
};

const PHASE_EMPTY: Record<Phase, string> = {
  proposed: "No changes in proposed.",
  coded: "No changes in coded.",
  reviewed: "No changes in reviewed.",
  done: "No changes in done.",
};

export function KanbanBoard({
  changes,
  onNewChange,
}: {
  changes: Change[];
  onNewChange: () => void;
}) {
  const commandStyle = useStore((s) => s.commandStyle);
  const setCommandStyle = useStore((s) => s.setCommandStyle);
  const pushToast = useStore((s) => s.pushToast);
  const agents = useStore((s) => s.agents);
  const jobs = useStore((s) => s.jobs);
  const clearWorktreeProgress = useStore((s) => s.clearWorktreeProgress);
  const [pending, setPending] = useState<PendingDrag | null>(null);
  const { startImplementation, startFlowModals } = useStartFlow();

  const jobByChange = useMemo(() => {
    const m = new Map<string, JobSummary>();
    for (const j of Object.values(jobs)) {
      const prev = m.get(j.changeId);
      if (!prev || j.startedAt > prev.startedAt) m.set(j.changeId, j);
    }
    return m;
  }, [jobs]);

  const buckets = useMemo(() => bucketize(changes), [changes]);
  const unphasedBuckets = useMemo(
    () => bucketizeByProgress(buckets.unphased, jobByChange),
    [buckets.unphased, jobByChange],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const dropId = e.over?.id;
    if (!dropId || typeof dropId !== "string") return;
    const id = (e.active.data.current as { id?: string } | undefined)?.id;
    if (!id) return;
    const change = changes.find((c) => c.id === id);
    if (!change) return;
    // Cards in the needs-human lane cannot be dragged out — answering is
    // the only exit (belt-and-suspenders with useDraggable's `disabled`).
    if (change.phase === NEEDS_HUMAN) return;
    // Only phase lanes are drop targets. Same-lane drop is a no-op.
    if (!isPhase(dropId)) return;
    if (change.phase === dropId) return;
    setChangePhase(change.id, dropId).catch((err) => {
      console.error("[phase] setChangePhase failed:", err);
      pushToast("error", err instanceof Error ? err.message : String(err));
    });
  };

  const onArchiveClick = (change: Change) => {
    setPending({ kind: "archive", change });
  };

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
      if (pending && (pending.kind === "agent-merge" || pending.kind === "agent-discard")) {
        clearWorktreeProgress(pending.change.id);
      }
      setPending(null);
    } else if ((res as any).status === "no-terminal") {
      pushToast("error", (res as any).reason ?? "No terminal open. Open a change view to start one.");
    } else {
      pushToast("error", (res as any).error ?? "Inject failed");
    }
  };

  const renderCard = (c: Change, slot: Slot) => (
    <ChangeCard
      key={c.id}
      change={c}
      slot={slot}
      job={jobByChange.get(c.id)}
      hasAgents={agents.length > 0}
      onStart={() => onStartClick(c)}
      onArchive={() => onArchiveClick(c)}
      onMerge={(j) => onMergeClick(c, j)}
      onDiscard={(j) => onDiscardClick(c, j)}
    />
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="kanban-board kanban-board-phases">
        {/* needs-human sits above the phase lanes as a full-width strip.
            Rendered ALWAYS (even when empty) so its emptiness is glanceable
            good news — the spec pins this. */}
        <NeedsHumanLane changes={buckets.needsHuman} renderCard={renderCard} />

        {PHASES.map((phase, i) => (
          <PhaseLane
            key={phase}
            id={phase}
            title={PHASE_LABEL[phase]}
            count={buckets[phase].length}
            emptyText={PHASE_EMPTY[phase]}
            onAdd={i === 0 ? onNewChange : undefined}
            headerAction={
              i === 0 ? (
                <ParallelStartLauncher
                  changes={changes}
                  jobByChange={jobByChange}
                  startImplementation={startImplementation}
                />
              ) : undefined
            }
          >
            {buckets[phase].map((c) => renderCard(c, phase))}
          </PhaseLane>
        ))}

        {buckets.unphased.length > 0 && (
          <UnphasedSection
            buckets={unphasedBuckets}
            renderCard={renderCard}
          />
        )}
      </div>

      {pending && (
        <CommandModal
          title={modalTitle(pending)}
          mode={pending.kind === "archive" || pending.kind === "agent-merge" ? commandStyle : undefined}
          onModeChange={pending.kind === "archive" || pending.kind === "agent-merge" ? setCommandStyle : undefined}
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

      {startFlowModals}
    </DndContext>
  );
}

function PhaseLane({
  id,
  title,
  count,
  emptyText,
  onAdd,
  headerAction,
  children,
}: {
  id: DropTargetId;
  title: string;
  count: number;
  emptyText: string;
  onAdd?: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      className={`kanban-col kanban-phase-lane${isOver ? " over-legal" : ""}`}
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
        {headerAction}
      </header>
      <div className="kanban-col-body">
        {count === 0 ? <p className="empty kanban-empty">{emptyText}</p> : children}
      </div>
    </section>
  );
}

/**
 * Needs-human lane. Rendered as a full-width strip above the phase
 * lanes; always visible so its emptiness is glanceable good news. NOT
 * a drop target — cards can only exit via the answer path (API or
 * `answered: true` in the artifact footer).
 */
function NeedsHumanLane({
  changes,
  renderCard,
}: {
  changes: Change[];
  renderCard: (c: Change, slot: Slot) => React.ReactNode;
}) {
  return (
    <section className={`kanban-needs-human${changes.length === 0 ? " empty" : ""}`}>
      <header className="kanban-needs-human-head">
        <h3>
          NEEDS HUMAN <span className="kanban-col-count">{changes.length}</span>
        </h3>
        <span className="kanban-needs-human-hint">
          {changes.length === 0
            ? "No open escalations."
            : "Sorted by wait time — longest first. Answer to release."}
        </span>
      </header>
      {changes.length > 0 && (
        <div className="kanban-needs-human-body">
          {changes.map((c) => renderCard(c, "needs-human"))}
        </div>
      )}
    </section>
  );
}

function UnphasedSection({
  buckets,
  renderCard,
}: {
  buckets: UnphasedBuckets;
  renderCard: (c: Change, slot: Slot) => React.ReactNode;
}) {
  const total = buckets.todo.length + buckets.inprogress.length + buckets.done.length;
  return (
    <section className="kanban-unphased">
      <header className="kanban-unphased-head">
        <h3>
          UNPHASED <span className="kanban-col-count">{total}</span>
        </h3>
        <span className="kanban-unphased-hint">
          Legacy changes without a phase. Drag a card into a phase lane to opt in.
        </span>
      </header>
      <div className="kanban-unphased-body">
        <div className="kanban-unphased-sub">
          <h4>Todo <span className="kanban-col-count">{buckets.todo.length}</span></h4>
          {buckets.todo.length === 0 ? (
            <p className="empty kanban-empty">—</p>
          ) : (
            buckets.todo.map((c) => renderCard(c, "unphased-todo"))
          )}
        </div>
        <div className="kanban-unphased-sub">
          <h4>In-progress <span className="kanban-col-count">{buckets.inprogress.length}</span></h4>
          {buckets.inprogress.length === 0 ? (
            <p className="empty kanban-empty">—</p>
          ) : (
            buckets.inprogress.map((c) => renderCard(c, "unphased-inprogress"))
          )}
        </div>
        <div className="kanban-unphased-sub">
          <h4>Done <span className="kanban-col-count">{buckets.done.length}</span></h4>
          {buckets.done.length === 0 ? (
            <p className="empty kanban-empty">—</p>
          ) : (
            buckets.done.map((c) => renderCard(c, "unphased-done"))
          )}
        </div>
      </div>
    </section>
  );
}

function ChangeCard({
  change,
  slot,
  onArchive,
  job,
  hasAgents,
  onStart,
  onMerge,
  onDiscard,
}: {
  change: Change;
  slot: Slot;
  onArchive: () => void;
  job?: JobSummary;
  hasAgents: boolean;
  onStart: () => void;
  onMerge: (job: JobSummary) => void;
  onDiscard: (job: JobSummary) => void;
}) {
  const worktreeProgressFromWs = useStore((s) => s.worktreeProgress[change.id]);
  const worktreeProgress = worktreeProgressFromWs ?? job?.worktreeProgress;
  const showWorktreeProgress = !!worktreeProgress && !!job && job.status !== "cancelled";
  const displayedProgress = showWorktreeProgress ? worktreeProgress : change.progress;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card-${change.id}`,
    data: { id: change.id },
    // Cards in the needs-human lane cannot be dragged — answering is the
    // only exit. Enforced in the UI here + in `onDragEnd` as backup.
    disabled: slot === "needs-human",
  });

  // Only the Unphased section's "done" sub-bucket shows the "ready to
  // archive" dot — progress-driven. In the phase-done lane, done means
  // "user marked done" and MAY have unfinished tasks, so no dot.
  const showReadyDot = slot === "unphased-done";

  // Archive button in the phase-done lane and the Unphased-done sub-bucket.
  const showArchiveInSlot = slot === "done" || slot === "unphased-done";

  // Start button visibility: any phase lane except done, or any Unphased
  // sub-bucket except unphased-done. Plus the existing gates (agents
  // configured, no active job, non-verify work remaining).
  const startEligibleSlot =
    slot === "proposed" ||
    slot === "coded" ||
    slot === "reviewed" ||
    slot === "unphased-todo" ||
    slot === "unphased-inprogress";
  const showStartArea = hasAgents && startEligibleSlot && !job;

  const isNeedsHuman = slot === "needs-human";
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`kanban-card${isDragging ? " dragging" : ""}${isNeedsHuman ? " needs-human" : " draggable"}`}
    >
      <Link
        to={`/change/${encodeURIComponent(change.id)}${showWorktreeProgress ? "?tree=worktree" : ""}`}
        className="kanban-card-link"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kanban-card-head">
          <h4>{change.id}</h4>
          {showReadyDot && <span className="kanban-ready-dot" title="All tasks complete · ready to archive" />}
          {isNeedsHuman && change.escalatedAt && (
            <WaitBadge escalatedAt={change.escalatedAt} priorPhase={change.priorPhase} />
          )}
          <AgentBadge job={job} />
          {/* assignee badge slot (reserved for future add-task-assignment) */}
          <span className="kanban-card-assignee-slot" />
          <PhaseControl change={change} />
        </div>
        {isNeedsHuman && change.needsHumanQuestion ? (
          <p className="kanban-card-intent kanban-card-question">
            {change.needsHumanQuestion}
          </p>
        ) : (
          change.proposal?.intent && <p className="kanban-card-intent">{change.proposal.intent}</p>
        )}
        <ProgressBar progress={displayedProgress} />
        {showWorktreeProgress && (
          <span className="kanban-card-source-hint" title="Progress driven by the running agent's worktree tasks.md">
            {displayedProgress.done}/{displayedProgress.total} (worktree)
          </span>
        )}
      </Link>
      {change.proposal?.tags && change.proposal.tags.length > 0 && (
        <div className="kanban-card-tags">
          <TagChipList tags={change.proposal.tags} small />
        </div>
      )}
      <div className="kanban-card-actions">
        {showArchiveInSlot && (
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
        {showStartArea &&
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
        {hasAgents && job?.status === "orphaned" && (
          <button
            className="action-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onArchive();
            }}
            title="Runs /ithy-opsx:archive — commits any pending worktree work, merges to main, archives, and offers cleanup."
          >
            Archive
          </button>
        )}
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
              className="action-btn ghost"
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

/**
 * Waiting-duration indicator for a needs-human card. Computed at render
 * time from `escalatedAt`; the value re-derives on every render, so
 * `Date.now()` here doesn't require timer state (the surrounding
 * `change-updated` broadcasts drive re-renders often enough for
 * hour-granularity readouts to feel live).
 */
function WaitBadge({ escalatedAt, priorPhase }: { escalatedAt: string; priorPhase?: string }) {
  const t = Date.parse(escalatedAt);
  const label = Number.isFinite(t) ? formatWait(Date.now() - t) : "?";
  const title = priorPhase
    ? `Escalated ${label} ago from ${priorPhase}`
    : `Escalated ${label} ago`;
  return (
    <span className="kanban-wait-badge" title={title}>
      ⏳ {label}
    </span>
  );
}

function formatWait(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "?";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
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
  if (job.status === "orphaned") {
    return (
      <span
        className="agent-badge orphaned"
        title="Worktree adopted from disk (no process in this server lifetime) — Merge or Discard"
      >
        orphaned
      </span>
    );
  }
  return <span className="agent-badge fail" title={`exit ${job.exitCode ?? "?"}`}>✗ failed</span>;
}

function isMergeable(job: JobSummary): boolean {
  return (
    job.status === "completed" ||
    job.status === "crashed" ||
    job.status === "cancelled" ||
    job.status === "orphaned"
  );
}

/**
 * Per-card phase transition control. Kept as the secondary,
 * keyboard-accessible affordance beside the primary drag-between-lanes
 * gesture (see the spec's "Manual Phase Transitions In The UI"
 * requirement).
 */
function PhaseControl({ change }: { change: Change }) {
  const pushToast = useStore((s) => s.pushToast);
  const current = change.phase;
  const [pending, setPending] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (!next || next === current) return;
    if (!(PHASES as readonly string[]).includes(next)) return;
    setPending(true);
    try {
      await setChangePhase(change.id, next as Phase);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const currentIsKnown = isPhase(current);
  return (
    <select
      className="kanban-phase-select"
      value={currentIsKnown ? (current as Phase) : ""}
      onChange={onChange}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      title="Change workflow phase"
      aria-label={`Phase for ${change.id}`}
    >
      {!currentIsKnown && <option value="">— unphased —</option>}
      {PHASES.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}

export { bucketize, bucketizeByProgress };
