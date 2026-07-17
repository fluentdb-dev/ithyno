// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { bucketize } from "./Kanban";
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
