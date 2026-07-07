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
import { PHASES, NEEDS_HUMAN, type Phase, isPhase } from "../phases";

/**
 * Kanban is a *state monitor* — it shows the current phase / progress of
 * each change, not a control surface. Phase transitions are written by
 * the Phase 3 Manager (the `/opsx:apply` claude session itself) via
 * `POST /api/changes/:id/phase`; the dashboard just reflects them.
 *
 * User-facing affordances are limited to:
 *   - `+ New Change` (top toolbar) → proposal creation
 *   - `Start` / `Apply` (per card) → hand-off to the agent runner
 *   - `Archive` / `Merge` (per card) → post-completion openspec steps
 *
 * Cards for changes whose `phase` is `needs-human` remain in the *prior*
 * phase lane and are marked with a `<WaitBadge>` + the question. The
 * escalation Q&A itself is handled agent-side (Manager spawns an
 * interactive PTY and reports via the notification chain); no dashboard
 * modal is involved. See `docs/2026-07-06-phase-2-implementation-and-redesign.md`.
 */

type UnphasedSubBucket = "unphased-todo" | "unphased-inprogress" | "unphased-done";
type Slot = Phase | UnphasedSubBucket;

type PhaseBuckets = {
  proposed: Change[];
  coded: Change[];
  reviewed: Change[];
  done: Change[];
  unphased: Change[];
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
 * Bucket changes by their persisted phase.
 *
 * - Known `Phase` value (proposed / coded / reviewed / done) → matching lane
 * - `needs-human` phase → **`priorPhase` lane** (falls back to `proposed`
 *   if priorPhase is missing or itself needs-human). The card is marked
 *   with `<WaitBadge>` + question in its head so it stays visible in its
 *   working lane while awaiting human input — no dedicated lane.
 * - Anything else (missing, unknown string) → `unphased`
 */
function bucketize(changes: Change[]): PhaseBuckets {
  const b: PhaseBuckets = {
    proposed: [],
    coded: [],
    reviewed: [],
    done: [],
    unphased: [],
  };
  for (const c of changes) {
    if (isPhase(c.phase)) {
      b[c.phase].push(c);
    } else if (c.phase === NEEDS_HUMAN) {
      const target: Phase = isPhase(c.priorPhase) ? c.priorPhase : "proposed";
      b[target].push(c);
    } else {
      b.unphased.push(c);
    }
  }
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
    <>
      {/* Top-of-board toolbar. Kept from the display-fix work: at 4-lane
          widths, embedding both `+ New Change` and the parallel launcher in
          the PROPOSED lane header would overflow. */}
      <div className="kanban-toolbar">
        <button className="primary kanban-add" onClick={onNewChange}>
          + New Change
        </button>
        <ParallelStartLauncher
          changes={changes}
          jobByChange={jobByChange}
          startImplementation={startImplementation}
        />
      </div>
      <div className="kanban-board kanban-board-phases">
        {PHASES.map((phase) => (
          <PhaseLane
            key={phase}
            title={PHASE_LABEL[phase]}
            count={buckets[phase].length}
            emptyText={PHASE_EMPTY[phase]}
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
    <section className="kanban-col kanban-phase-lane">
      <header className="kanban-col-head">
        <h3>
          {title} <span className="kanban-col-count">{count}</span>
        </h3>
      </header>
      <div className="kanban-col-body">
        {count === 0 ? <p className="empty kanban-empty">{emptyText}</p> : children}
      </div>
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
          Legacy changes without a phase. The Phase 3 Manager will opt them in.
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

  // Phase-based judgment (Manager-first, revert-active-phase-ui). `slot`
  // still tells us where the card sits (its home lane, decided by
  // bucketize), but the *behavior* is driven by `change.phase`:
  //   - needs-human phase → WaitBadge + question, no Start / Archive
  //   - anything else → normal Start / Archive gating by slot
  const isNeedsHuman = change.phase === NEEDS_HUMAN;

  // Progress-derived "ready to archive" dot only for the Unphased section's
  // done sub-bucket. Phase-done cards may have partial progress by design
  // (see Progress-Independent Phase Placement); no dot there.
  const showReadyDot = slot === "unphased-done";

  // Archive button in the phase-done lane and the Unphased-done sub-bucket,
  // but never for needs-human cards.
  const showArchiveInSlot = !isNeedsHuman && (slot === "done" || slot === "unphased-done");

  // Start button: any non-done slot, unless the card is escalated.
  const startEligibleSlot =
    slot === "proposed" ||
    slot === "coded" ||
    slot === "reviewed" ||
    slot === "unphased-todo" ||
    slot === "unphased-inprogress";
  const showStartArea = hasAgents && startEligibleSlot && !job && !isNeedsHuman;

  return (
    <div className={`kanban-card${isNeedsHuman ? " needs-human" : ""}`}>
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

/**
 * Waiting-duration indicator for a needs-human card. Computed at render
 * time from `escalatedAt`; the value re-derives on every render, so
 * `Date.now()` here doesn't require timer state (WS `change-updated`
 * broadcasts arrive often enough for hour-granularity readouts).
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

function isMergeable(job: JobSummary): boolean {
  return (
    job.status === "completed" ||
    job.status === "crashed" ||
    job.status === "cancelled" ||
    job.status === "orphaned"
  );
}

export { bucketize, bucketizeByProgress };
