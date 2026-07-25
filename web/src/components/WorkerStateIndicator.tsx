// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import type { JobSummary } from "../types";
import type { Phase } from "../phases";
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

/**
 * Where the change sits in the pipeline, and where it sat when its worker
 * finished. Both are Phase-view lanes (`laneForPhase()`), but the signal is
 * NOT view-dependent — a Board-view card is annotated by the same rule.
 *
 * `atFinish === undefined` means the finish was never observed by this tab
 * (page loaded with the job already `completed`); the completed branch then
 * falls back to the time window alone instead of guessing.
 */
export type StageSignal = {
  /** The change's stage right now. */
  current?: Phase;
  /** The stage the change was in when this job finished. */
  atFinish?: Phase;
};

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
  stage?: StageSignal,
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
      // Transient on TWO counts — the checkmark shows only while both hold:
      //
      //  1. within DONE_GRACE_MS of `finishedAt` — the checkmark is an "it
      //     just finished" signal, not a standing state; and
      //  2. the change has not moved off the stage the worker finished in —
      //     once the Manager advances `change.phase` the completion has been
      //     absorbed by that move, and a card sitting in the next lane still
      //     saying "done ✓" misreports where the change actually is.
      //
      // Either way the card falls back to its idle branch; the Merge / View
      // diff / Discard affordances (driven by the job itself, not by this
      // indicator) stay put.
      const fresh =
        job.finishedAt === undefined || now - job.finishedAt < DONE_GRACE_MS;
      if (!fresh || stageAdvanced(stage)) return idleView(laneContext);
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

/**
 * True when the change has left the stage its worker finished in, i.e. the
 * Manager already advanced the phase and absorbed the completion.
 *
 * Returns false when either side is unknown — an unobserved finish must not
 * suppress a legitimately fresh checkmark. Any move counts, not just a
 * forward one: a put-back also means the checkmark no longer describes the
 * lane the card is rendered in.
 */
export function stageAdvanced(stage?: StageSignal): boolean {
  if (!stage || stage.atFinish === undefined || stage.current === undefined) return false;
  return stage.current !== stage.atFinish;
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
  stage,
}: {
  job?: JobSummary;
  laneContext: LaneContext;
  /** Current vs at-finish pipeline stage — gates the `completed` branch. */
  stage?: StageSignal;
}) {
  // `tick` exists only to force a re-render so the elapsed clock (and the
  // completed grace window) advance without a store update.
  const [, setTick] = useState(0);

  const view = workerStateView(job, laneContext, Date.now(), stage);

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
