// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { bucketize } from "./Kanban";
import type { Change, JobSummary } from "../types";

function mkChange(id: string, phase?: unknown, progress = { done: 0, total: 5 }): Change {
  return {
    id,
    proposal: null,
    design: null,
    tasks: null,
    tasksHash: "",
    tasksPath: "",
    progress,
    hasOutcome: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    phase: phase as any,
  } as unknown as Change;
}

function mkJob(changeId: string, status: JobSummary["status"]): JobSummary {
  return {
    id: `j-${changeId}`,
    changeId,
    agentName: "claude",
    status,
    startedAt: 0,
    branch: `agent/${changeId}`,
    worktreePath: `.worktrees/${changeId}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as JobSummary;
}

describe("bucketize (progress-derived, 3 columns)", () => {
  it("puts a fully-ticked change into done", () => {
    const b = bucketize([mkChange("x", undefined, { done: 5, total: 5 })], new Map());
    expect(b.done.map((c) => c.id)).toEqual(["x"]);
    expect(b.todo).toEqual([]);
    expect(b.inprogress).toEqual([]);
  });

  it("puts a change with a running job into inprogress even with 0/n progress", () => {
    const jobs = new Map<string, JobSummary>();
    jobs.set("x", mkJob("x", "running"));
    const b = bucketize([mkChange("x", undefined, { done: 0, total: 5 })], jobs);
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });

  it("puts a change with a pending-merge (completed) job into inprogress", () => {
    const jobs = new Map<string, JobSummary>();
    jobs.set("x", mkJob("x", "completed"));
    const b = bucketize([mkChange("x", undefined, { done: 0, total: 5 })], jobs);
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });

  it("puts a fresh change (0 done, no job) into todo", () => {
    const b = bucketize([mkChange("x", undefined, { done: 0, total: 5 })], new Map());
    expect(b.todo.map((c) => c.id)).toEqual(["x"]);
  });

  it("puts a partially-progressed change with no job into inprogress", () => {
    const b = bucketize([mkChange("x", undefined, { done: 2, total: 5 })], new Map());
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });

  it("ignores change.phase entirely — placement is progress-only", () => {
    // Post-revert (revert-kanban-ui-lanes): the Kanban does NOT consult
    // change.phase for placement. Manager-driven phase state exists in
    // sidecar / API but is invisible on the board.
    const changes = [
      mkChange("phased-done-half-work", "done", { done: 2, total: 5 }),
      mkChange("phased-proposed-fully-ticked", "proposed", { done: 5, total: 5 }),
      mkChange("phased-needs-human", "needs-human", { done: 0, total: 5 }),
    ];
    (changes[2] as unknown as { priorPhase?: string }).priorPhase = "coded";
    const b = bucketize(changes, new Map());
    // phase=done + 2/5 progress → progress rules apply → inprogress
    expect(b.inprogress.map((c) => c.id)).toContain("phased-done-half-work");
    // phase=proposed + 5/5 progress → done
    expect(b.done.map((c) => c.id)).toContain("phased-proposed-fully-ticked");
    // phase=needs-human + 0/5 progress + no job → todo (badge on card is gone)
    expect(b.todo.map((c) => c.id)).toContain("phased-needs-human");
  });
});
