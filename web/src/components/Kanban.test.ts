// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { bucketize, columnHeaderActionType, perCardStartEligible } from "./Kanban";
import type { Change, Progress } from "../types";

function mkChange(
  id: string,
  opts: {
    phase?: unknown;
    progress?: Progress;
    worktree?: { tasksProgress: Progress };
  } = {},
): Change {
  const progress = opts.progress ?? { done: 0, total: 5 };
  const worktree =
    opts.worktree === undefined
      ? undefined
      : {
          path: `.worktrees/${id}`,
          branch: `agent/${id}`,
          tasksProgress: opts.worktree.tasksProgress,
        };
  return {
    id,
    proposal: null,
    design: null,
    tasks: null,
    tasksHash: "",
    tasksPath: "",
    progress,
    hasOutcome: false,
    worktree,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    phase: opts.phase as any,
  } as unknown as Change;
}

describe("bucketize (folder-driven placement, 3 columns)", () => {
  it("main-tree only: fully-ticked → done", () => {
    const b = bucketize([mkChange("x", { progress: { done: 5, total: 5 } })]);
    expect(b.done.map((c) => c.id)).toEqual(["x"]);
    expect(b.todo).toEqual([]);
    expect(b.inprogress).toEqual([]);
  });

  it("main-tree only: 0/n → todo", () => {
    const b = bucketize([mkChange("x", { progress: { done: 0, total: 5 } })]);
    expect(b.todo.map((c) => c.id)).toEqual(["x"]);
  });

  it("main-tree only: partial progress → inprogress", () => {
    const b = bucketize([mkChange("x", { progress: { done: 2, total: 5 } })]);
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });

  it("worktree exists (empty progress) → inprogress regardless of main-tree", () => {
    const b = bucketize([
      mkChange("x", {
        progress: { done: 0, total: 5 },
        worktree: { tasksProgress: { done: 0, total: 5 } },
      }),
    ]);
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });

  it("worktree exists (partial progress) → inprogress", () => {
    const b = bucketize([
      mkChange("x", {
        progress: { done: 0, total: 5 },
        worktree: { tasksProgress: { done: 3, total: 5 } },
      }),
    ]);
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });

  it("worktree exists (all ticked) → done", () => {
    const b = bucketize([
      mkChange("x", {
        progress: { done: 0, total: 5 },
        worktree: { tasksProgress: { done: 5, total: 5 } },
      }),
    ]);
    expect(b.done.map((c) => c.id)).toEqual(["x"]);
  });

  it("worktree signal takes precedence over main-tree signal", () => {
    // main tree says "todo" (0/5), worktree says "3/5" → inprogress.
    // This is the whole point of folder-driven: worktree wins.
    const b = bucketize([
      mkChange("x", {
        progress: { done: 0, total: 5 },
        worktree: { tasksProgress: { done: 3, total: 5 } },
      }),
    ]);
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
    expect(b.todo).toEqual([]);
  });

  it("ignores change.phase entirely — placement is filesystem-derived", () => {
    // Post-revert (revert-kanban-ui-lanes): change.phase is invisible to
    // bucketize. Manager-driven phase state exists in sidecar / API but
    // does not steer placement.
    const changes = [
      mkChange("phased-done-half-work", {
        phase: "done",
        progress: { done: 2, total: 5 },
      }),
      mkChange("phased-proposed-fully-ticked", {
        phase: "proposed",
        progress: { done: 5, total: 5 },
      }),
      mkChange("phased-needs-human", {
        phase: "needs-human",
        progress: { done: 0, total: 5 },
      }),
    ];
    const b = bucketize(changes);
    // phase=done + 2/5 progress → progress rules apply → inprogress
    expect(b.inprogress.map((c) => c.id)).toContain("phased-done-half-work");
    // phase=proposed + 5/5 progress → done
    expect(b.done.map((c) => c.id)).toContain("phased-proposed-fully-ticked");
    // phase=needs-human + 0/5 progress + no worktree → todo
    expect(b.todo.map((c) => c.id)).toContain("phased-needs-human");
  });
});

// hide-start-in-progress-column: column-header "Start ▾ (N)" selector is
// TODO-only. These tests verify the pure logic that controls which header
// action each column renders.
describe("columnHeaderActionType (hide-start-in-progress-column)", () => {
  it("TODO column yields 'new-change' header action (Start ▾ lives here)", () => {
    // The "Start ▾ (N)" bulk selector is rendered via ParallelStartLauncher
    // inside KanbanBoard when columnHeaderActionType returns "new-change" for
    // TODO. (In practice the TODO slot renders "+ New Change" AND the
    // ParallelStartLauncher is gone from IN-PROGRESS; the important assertion
    // is that IN-PROGRESS and DONE are null.)
    expect(columnHeaderActionType("todo")).toBe("new-change");
  });

  it("IN-PROGRESS column yields null — no Start ▾ (N) selector in header", () => {
    expect(columnHeaderActionType("inprogress")).toBeNull();
  });

  it("DONE column yields null — no Start ▾ (N) selector in header", () => {
    expect(columnHeaderActionType("done")).toBeNull();
  });

  it("all three slots: only TODO is non-null", () => {
    const results = {
      todo: columnHeaderActionType("todo"),
      inprogress: columnHeaderActionType("inprogress"),
      done: columnHeaderActionType("done"),
    };
    expect(results.todo).not.toBeNull();
    expect(results.inprogress).toBeNull();
    expect(results.done).toBeNull();
  });
});

// Per-card Start button eligibility is unchanged by hide-start-in-progress-column.
// These tests verify the per-card logic across all slots matches the original
// behavior: Start area shows in TODO and IN-PROGRESS (when no job is running),
// never in DONE.
describe("perCardStartEligible (per-card Start button — unchanged by this change)", () => {
  it("TODO slot with no job → Start area eligible", () => {
    expect(perCardStartEligible("todo", false)).toBe(true);
  });

  it("IN-PROGRESS slot with no job → Start area eligible (per-card Start, not header)", () => {
    expect(perCardStartEligible("inprogress", false)).toBe(true);
  });

  it("DONE slot → never eligible for per-card Start", () => {
    expect(perCardStartEligible("done", false)).toBe(false);
    expect(perCardStartEligible("done", true)).toBe(false);
  });

  it("any slot with a live job → not eligible (job already running)", () => {
    expect(perCardStartEligible("todo", true)).toBe(false);
    expect(perCardStartEligible("inprogress", true)).toBe(false);
  });
});
