// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import type { JobSummary } from "../types";
import { formatElapsedSince } from "../util/formatElapsed";

/**
 * `WorkerStateIndicator` — the per-change worker-state annotation rendered
 * inside the shared `<KanbanCard>` (annotate-cards-with-worker-job-state).
 *
 * It replaces the old `AgentBadge`: instead of only naming the agent, it
 * reports what the dispatched worker is doing RIGHT NOW, so a lane full of
 * cards distinguishes "actively being coded" from "queued behind the
 * Manager".
 *
 * Because it lives in `KanbanCard`, both the Board view (`Kanban.tsx`) and
 * the Phase view (`PhaseLaneBoard.tsx`) get it for free. The only
 * view-dependent behavior is the idle branch, driven by `laneContext`:
 * the Phase view says "queued" (queued *for this lane's stage* — a
 * meaningful statement), the Board view renders nothing (its columns are
 * progress-derived, so "queued for what" is ambiguous).
 */

export type LaneContext = "board" | "phase";

/** How long a `completed` job keeps showing its transient "done" checkmark. */
export const DONE_GRACE_MS = 30_000;

/** Card refresh cadence for the running elapsed clock. */
export const TICK_MS = 30_000;

export type WorkerStateKind =
  | "running"
  | "completed"
  | "cancelled"
  | "crashed"
  | "orphaned"
  | "queued";

export type WorkerStateView = {
  kind: WorkerStateKind;
  /** Text shown next to the dot. */
  label: string;
  /** `title` attribute (hover tooltip). */
  title: string;
  /** Leading glyph instead of the dot (completed only). */
  glyph?: string;
  /** Elapsed-time suffix (running only). */
  elapsed?: string;
  /** True while a live clock needs to keep ticking. */
  ticking: boolean;
};

/**
 * Pure render decision for the indicator. Split out from the component so
 * the branch table is unit-testable under this repo's node-environment
 * vitest setup (no jsdom / testing-library available).
 *
 * Returns `null` when nothing should render.
 */
export function workerStateView(
  job: JobSummary | undefined,
  laneContext: LaneContext,
  now: number = Date.now(),
): WorkerStateView | null {
  if (!job) return idleView(laneContext);

  switch (job.status) {
    case "running":
      return {
        kind: "running",
        label: job.agentName,
        title: `Agent ${job.agentName} running`,
        elapsed: formatElapsedSince(job.startedAt, now),
        ticking: true,
      };

    case "completed": {
      // Transient: the checkmark is a "it just finished" signal, not a
      // standing state. Once the grace window lapses the card falls back
      // to its idle branch — the Merge / View diff / Discard affordances
      // (driven by the job itself, not by this indicator) stay put.
      const fresh =
        job.finishedAt === undefined || now - job.finishedAt < DONE_GRACE_MS;
      if (!fresh) return idleView(laneContext);
      return {
        kind: "completed",
        label: "done",
        title: "Worker finished successfully — ready to merge",
        glyph: "✓",
        ticking: true,
      };
    }

    case "cancelled":
      return {
        kind: "cancelled",
        label: "cancelled",
        title: "Worker was cancelled",
        ticking: false,
      };

    case "crashed":
      return {
        kind: "crashed",
        label: "crashed",
        title: `exit code: ${job.exitCode ?? "?"}`,
        ticking: false,
      };

    case "orphaned":
      return {
        kind: "orphaned",
        label: "orphaned",
        title: `Worktree adopted from disk: ${job.worktreePath}`,
        ticking: false,
      };

    default:
      return idleView(laneContext);
  }
}

function idleView(laneContext: LaneContext): WorkerStateView | null {
  if (laneContext !== "phase") return null;
  return {
    kind: "queued",
    label: "queued",
    title: "No worker running — queued for this phase",
    ticking: false,
  };
}

export function WorkerStateIndicator({
  job,
  laneContext,
}: {
  job?: JobSummary;
  laneContext: LaneContext;
}) {
  // `tick` exists only to force a re-render so the elapsed clock (and the
  // completed grace window) advance without a store update.
  const [, setTick] = useState(0);

  const view = workerStateView(job, laneContext);

  // `running` needs a repeating clock; a fresh `completed` needs exactly one
  // wake-up when its grace window lapses. Everything else is static.
  const timerMode: "interval" | "timeout" | "none" = !view?.ticking
    ? "none"
    : view.kind === "running"
      ? "interval"
      : "timeout";
  const finishedAt = job?.finishedAt;

  useEffect(() => {
    if (timerMode === "none") return;
    if (timerMode === "interval") {
      const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
      return () => clearInterval(id);
    }
    if (finishedAt === undefined) return;
    const remaining = Math.max(DONE_GRACE_MS - (Date.now() - finishedAt), 0);
    const id = setTimeout(() => setTick((n) => n + 1), remaining);
    return () => clearTimeout(id);
  }, [timerMode, finishedAt]);

  if (!view) return null;

  return (
    <span className={`worker-state worker-state-${view.kind}`} title={view.title}>
      {view.glyph ? (
        <span className="worker-state-glyph">{view.glyph}</span>
      ) : (
        <span className={`worker-state-dot ${view.kind}`} />
      )}
      <span className="worker-state-label">{view.label}</span>
      {view.elapsed && <span className="worker-state-elapsed">{view.elapsed}</span>}
    </span>
  );
}
