// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { ProgressBar } from "./ProgressBar";
import { TagChipList } from "./TagChip";
import { CommandModal } from "./CommandModal";
import { injectPty } from "../api";
import type { Change, JobSummary } from "../types";
import { useStartFlow } from "../hooks/useStartFlow";
import { hasNonVerifyWork } from "../util/changeState";
import { ParallelStartLauncher } from "./ParallelStartLauncher";

/**
 * Kanban is a *state monitor* — it shows a classic three-column
 * TODO / IN-PROGRESS / DONE view of every change, driven by task
 * progress. Phase state (`change.phase`) is a Manager-internal
 * concern and is NOT rendered on the board (revert-kanban-ui-lanes:
 * the Kanban structure principle is "3 columns only").
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
 * Progress-derived bucketing. A change is:
 *   - `done` if all tasks are ticked (progress complete),
 *   - `inprogress` if there is a live/orphaned/completed job attached, else
 *   - `todo` (no started work).
 *
 * `change.phase` is intentionally ignored — see the file-level comment.
 */
function bucketize(changes: Change[], jobByChange: Map<string, JobSummary>): Buckets {
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
  const commandStyle = useStore((s) => s.commandStyle);
  const setCommandStyle = useStore((s) => s.setCommandStyle);
  const pushToast = useStore((s) => s.pushToast);
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

  const buckets = useMemo(() => bucketize(changes, jobByChange), [changes, jobByChange]);

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
      onStart={() => onStartClick(c)}
      onArchive={() => onArchiveClick(c)}
      onMerge={(j) => onMergeClick(c, j)}
      onDiscard={(j) => onDiscardClick(c, j)}
    />
  );

  const columns: Slot[] = ["todo", "inprogress", "done"];

  return (
    <>
      <div className="kanban-board">
        {columns.map((slot) => {
          // Spec: TODO column carries "+ New Change"; IN-PROGRESS carries
          // the parallel Start launcher (add-parallel-start-launcher's
          // "IN-PROGRESS Column Start Launcher" requirement).
          const headerAction =
            slot === "todo" ? (
              <button className="primary kanban-add" onClick={onNewChange}>
                + New Change
              </button>
            ) : slot === "inprogress" ? (
              <ParallelStartLauncher
                changes={changes}
                jobByChange={jobByChange}
                startImplementation={startImplementation}
              />
            ) : null;
          return (
            <Column
              key={slot}
              title={COL_LABEL[slot]}
              count={buckets[slot].length}
              emptyText={COL_EMPTY[slot]}
              headerAction={headerAction}
            >
              {buckets[slot].map((c) => renderCard(c, slot))}
            </Column>
          );
        })}
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

function ChangeCard({
  change,
  slot,
  onArchive,
  job,
  onStart,
  onMerge,
  onDiscard,
}: {
  change: Change;
  slot: Slot;
  onArchive: () => void;
  job?: JobSummary;
  onStart: () => void;
  onMerge: (job: JobSummary) => void;
  onDiscard: (job: JobSummary) => void;
}) {
  const worktreeProgressFromWs = useStore((s) => s.worktreeProgress[change.id]);
  const worktreeProgress = worktreeProgressFromWs ?? job?.worktreeProgress;
  const showWorktreeProgress = !!worktreeProgress && !!job && job.status !== "cancelled";
  const displayedProgress = showWorktreeProgress ? worktreeProgress : change.progress;

  const showReadyDot = slot === "done";

  // Archive button in the done column, but never while a job is still
  // running — clicking Archive on a live worktree would try to merge
  // uncommitted agent state.
  const jobStillRunning = job?.status === "running";
  const showArchiveInSlot = !jobStillRunning && slot === "done";

  // Start button: any non-done slot with no live job. UI does NOT gate on
  // `hasAgents` — when agents.yaml lacks a code role, the skill falls back
  // to Manager (which has built-in defaults). Post
  // wire-role-to-cli-in-manager-skill (Phase 1).
  const startEligibleSlot = slot === "todo" || slot === "inprogress";
  const showStartArea = startEligibleSlot && !job;

  return (
    <div className="kanban-card">
      <Link
        to={`/change/${encodeURIComponent(change.id)}${showWorktreeProgress ? "?tree=worktree" : ""}`}
        className="kanban-card-link"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kanban-card-head">
          <h4>{change.id}</h4>
          {showReadyDot && <span className="kanban-ready-dot" title="All tasks complete · ready to archive" />}
          <AgentBadge job={job} />
          {/* assignee badge slot (reserved for future add-task-assignment) */}
          <span className="kanban-card-assignee-slot" />
        </div>
        {change.proposal?.intent && <p className="kanban-card-intent">{change.proposal.intent}</p>}
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
              title="Start — opens modal to inject /ithy-opsx:dispatch into the terminal"
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
        {job?.status === "orphaned" && (
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
        {job && job.status !== "running" && isMergeable(job) && (
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

export { bucketize };
