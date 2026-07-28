// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { ProgressBar } from "./ProgressBar";
import { TagChipList } from "./TagChip";
import { WorkerStateIndicator, type LaneContext } from "./WorkerStateIndicator";
import { laneForPhase } from "../phases";
import type { Change, JobSummary } from "../types";
import { hasNonVerifyWork } from "../util/changeState";

/**
 * `KanbanCard` — the single-change render body used by both the 3-column
 * `KanbanBoard` (Board view) and the swim-lane `PhaseLaneBoard` (Phase view).
 * Extracted to a sibling file so the two boards render identical cards even
 * when they group them differently (add-phase-lane-view-toggle).
 *
 * The per-card affordance set (Start / Archive / Merge / Discard) is derived
 * from the change's own progress + attached job — NOT from the board slot the
 * caller placed it in. This keeps the card self-contained: Phase lanes group
 * by `change.phase` and DONE/Archive is still driven by "all tasks ticked".
 */

export type CardSlot = "todo" | "inprogress" | "done";

/**
 * Same rules as `Kanban.tsx::bucketize()` but for a single change. Used by the
 * card itself to decide which action buttons to render.
 */
export function slotForChange(change: Change): CardSlot {
  const wt = change.worktree;
  if (wt) {
    const wtp = wt.tasksProgress;
    if (wtp.total > 0 && wtp.done === wtp.total) return "done";
    return "inprogress";
  }
  const { done: d, total } = change.progress;
  if (total > 0 && d === total) return "done";
  if (d > 0) return "inprogress";
  return "todo";
}

export function KanbanCard({
  change,
  job,
  laneContext = "board",
  onStart,
  onArchive,
  onMerge,
  onDiscard,
}: {
  change: Change;
  job?: JobSummary;
  /** Which board placed this card. Only affects the idle (no-job) branch of
   *  the worker-state indicator — see `WorkerStateIndicator`. */
  laneContext?: LaneContext;
  onStart: () => void;
  onArchive: () => void;
  onMerge: (job: JobSummary) => void;
  onDiscard: (job: JobSummary) => void;
}) {
  // Priority: WS-driven (live watcher) → job snapshot → server-scanned
  // filesystem state (`c.worktree.tasksProgress`). The last covers the
  // case where a worktree exists WITHOUT a live/orphan job (manual
  // `git worktree add`, mid-dispatch state), which bucketize already
  // uses for DONE-lane placement. Without this fallback the card lands
  // in DONE per bucketize but the progress bar shows main-tree 0/N.
  const worktreeProgressFromWs = useStore((s) => s.worktreeProgress[change.id]);
  const wtFsProgress = change.worktree?.tasksProgress;
  const worktreeProgress =
    worktreeProgressFromWs ?? job?.worktreeProgress ?? wtFsProgress;
  const showWorktreeProgress =
    !!worktreeProgress && (!job || job.status !== "cancelled");
  const displayedProgress = showWorktreeProgress ? worktreeProgress : change.progress;

  // Manager activity badge on card was removed by
  // reshape-phase-view-to-active-agent-state (user: "Terminal で分かるので不要").
  // Server-side ManagerActivity + store slice remain — Phase view's
  // bucketizeByActiveRole reads it from the store, but there is no card badge.
  //
  // annotate-cards-with-worker-job-state: the worker-state indicator's
  // transient "done ✓" belongs to the stage the worker finished in. Feed it
  // both the change's current stage and the snapshot taken when the job
  // finished, so the checkmark disappears the moment the Manager advances
  // the phase rather than lingering for the rest of the grace window.
  const stageAtFinish = useStore((s) => (job ? s.jobStageAtFinish[job.id] : undefined));
  const stage = { current: laneForPhase(change.phase, change.priorPhase), atFinish: stageAtFinish };

  const slot = slotForChange(change);
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
  const showStartArea = perCardStartEligible(slot, !!job);

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
          <WorkerStateIndicator job={job} laneContext={laneContext} stage={stage} />
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

// `AgentBadge` was superseded by `<WorkerStateIndicator>`
// (annotate-cards-with-worker-job-state): the badge only named the agent,
// the indicator reports what the worker is doing (pulse + elapsed / done /
// crashed / queued). The `.agent-badge` / `.agent-pulse` rules are left in
// `styles.css` (no other consumer today, but harmless) — only the
// card-local component was removed.

function isMergeable(job: JobSummary): boolean {
  return (
    job.status === "completed" ||
    job.status === "crashed" ||
    job.status === "cancelled" ||
    job.status === "orphaned"
  );
}

/**
 * Returns true when the per-card Start area should render for a given slot
 * and job state. This is the pure eligibility check (independent of
 * hasNonVerifyWork). Exported for tests.
 */
export function perCardStartEligible(slot: CardSlot, hasJob: boolean): boolean {
  const startEligibleSlot = slot === "todo" || slot === "inprogress";
  return startEligibleSlot && !hasJob;
}
