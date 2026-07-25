// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import type { ManagerActivity, ManagerActivityKind } from "../types";

/**
 * `ManagerActivityBadge` — the per-card "what is Manager doing right now"
 * indicator (expose-manager-activity-per-change).
 *
 * This is deliberately SECONDARY to the `AgentBadge` worker-state indicator:
 * the worker badge answers "who is doing the work", this one answers "what is
 * the orchestrator doing around it". Both can render at once — a change can
 * have a running code worker (job badge) while Manager sits in `waiting`.
 *
 * Renders nothing when there is no activity, or when the activity is `idle`
 * (the server clears on `idle`, so an idle record should never reach here —
 * the guard is belt-and-braces for a hand-crafted state).
 */

/** Glyph per activity. `dispatching` is special-cased into a CSS spinner. */
const ICONS: Record<Exclude<ManagerActivityKind, "idle" | "dispatching">, string> = {
  waiting: "⏳",
  judging: "🧠",
  cleanup: "🧹",
  transitioning: "→",
};

/**
 * Human-readable label for an activity + optional detail. Pure — exported for
 * unit tests (the vitest run is node-environment, so component rendering is
 * not exercised; the label/elapsed logic is where the behavior lives).
 */
export function activityLabel(
  activity: ManagerActivityKind,
  detail?: string,
): string | null {
  const d = detail?.trim();
  switch (activity) {
    case "dispatching":
      return "dispatching";
    case "waiting":
      return d ? `waiting: ${d}` : "waiting";
    case "judging":
      return "judging";
    case "cleanup":
      return d ? `cleanup: ${d}` : "cleanup";
    case "transitioning":
      return "transitioning";
    case "idle":
      // Not renderable — `idle` is equivalent to "no activity".
      return null;
    default:
      return null;
  }
}

/**
 * Compact elapsed suffix: `12s` / `4m` / `2h`. Sub-second and negative deltas
 * (clock skew between the server's `startedAt` and the browser) clamp to `0s`.
 */
export function formatElapsed(startedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/** Title text for the badge's tooltip. Exported for tests. */
export function activityTitle(a: ManagerActivity, now: number = Date.now()): string {
  const label = activityLabel(a.activity, a.detail) ?? a.activity;
  return `Manager · ${a.stage} stage · ${label} · ${formatElapsed(a.startedAt, now)}`;
}

export function ManagerActivityBadge({ activity }: { activity?: ManagerActivity | null }) {
  // Re-render once a second so the elapsed suffix stays honest without the
  // parent card having to own a timer. The interval is only mounted while a
  // badge is actually showing.
  const [now, setNow] = useState(() => Date.now());
  const live = !!activity && activity.activity !== "idle";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // `idle` is equivalent to "no activity" — the server clears on idle, so
  // this is defensive. Checked explicitly (rather than via the null label)
  // so the icon lookup below narrows to the five renderable kinds.
  if (!activity || activity.activity === "idle") return null;
  const label = activityLabel(activity.activity, activity.detail);
  if (label === null) return null;

  return (
    <span
      className={`manager-activity-badge ${activity.activity}`}
      title={activityTitle(activity, now)}
    >
      {activity.activity === "dispatching" ? (
        <span className="mgr-activity-icon spinner" aria-hidden="true" />
      ) : (
        <span className="mgr-activity-icon" aria-hidden="true">
          {ICONS[activity.activity]}
        </span>
      )}
      <span className="mgr-activity-label">{label}</span>
      <span className="mgr-activity-elapsed">{formatElapsed(activity.startedAt, now)}</span>
    </span>
  );
}
