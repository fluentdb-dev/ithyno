// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { bucketize, bucketizeByProgress } from "./Kanban";
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

describe("bucketize (phase lanes)", () => {
  it("puts known phases into their lanes", () => {
    const changes = [
      mkChange("a", "proposed"),
      mkChange("b", "coded"),
      mkChange("c", "reviewed"),
      mkChange("d", "done"),
    ];
    const b = bucketize(changes);
    expect(b.proposed.map((c) => c.id)).toEqual(["a"]);
    expect(b.coded.map((c) => c.id)).toEqual(["b"]);
    expect(b.reviewed.map((c) => c.id)).toEqual(["c"]);
    expect(b.done.map((c) => c.id)).toEqual(["d"]);
    expect(b.unphased).toEqual([]);
  });

  it("falls back to unphased for missing / unknown / reserved phase values", () => {
    const changes = [
      mkChange("no-phase"), // undefined
      mkChange("unknown-string", "elsewhere"), // rejected by isPhase
      mkChange("reserved-1", "validated"), // Phase 4 reserved value
      mkChange("reserved-2", "verified"),
    ];
    const b = bucketize(changes);
    expect(b.unphased.map((c) => c.id)).toEqual([
      "no-phase",
      "unknown-string",
      "reserved-1",
      "reserved-2",
    ]);
    expect(b.proposed).toEqual([]);
    expect(b.coded).toEqual([]);
    expect(b.reviewed).toEqual([]);
    expect(b.done).toEqual([]);
  });

  it("puts needs-human into its priorPhase lane (revert-active-phase-ui)", () => {
    // Post-revert: needs-human is not a dedicated lane. Escalated changes
    // stay in the lane they came from (priorPhase) with a WaitBadge on the
    // card; the Kanban is a state monitor, not an escalation surface.
    const c = mkChange("escalated", "needs-human");
    (c as unknown as { priorPhase?: string }).priorPhase = "coded";
    (c as unknown as { escalatedAt?: string }).escalatedAt = "2026-07-05T09:00:00Z";
    const b = bucketize([c]);
    expect(b.coded.map((x) => x.id)).toEqual(["escalated"]);
    expect(b.proposed).toEqual([]);
    expect(b.unphased).toEqual([]);
  });

  it("defaults needs-human to proposed lane when priorPhase is missing", () => {
    const c = mkChange("escalated-no-prior", "needs-human");
    const b = bucketize([c]);
    expect(b.proposed.map((x) => x.id)).toEqual(["escalated-no-prior"]);
  });

  it("ignores an invalid priorPhase and defaults to proposed", () => {
    const c = mkChange("escalated-bad-prior", "needs-human");
    (c as unknown as { priorPhase?: string }).priorPhase = "elsewhere";
    const b = bucketize([c]);
    expect(b.proposed.map((x) => x.id)).toEqual(["escalated-bad-prior"]);
  });

  it("does not consult progress for lane placement — Progress-Independent Phase Placement", () => {
    // A change in phase=done with incomplete tasks MUST stay in the done lane,
    // and a change in phase=proposed with all tasks ticked MUST stay in the
    // proposed lane. This is the ADDED requirement from add-kanban-phase-lanes.
    const doneWithHalfWork = mkChange("half-done", "done", { done: 2, total: 5 });
    const proposedFullyTicked = mkChange("full-proposed", "proposed", { done: 5, total: 5 });
    const b = bucketize([doneWithHalfWork, proposedFullyTicked]);
    expect(b.done.map((c) => c.id)).toEqual(["half-done"]);
    expect(b.proposed.map((c) => c.id)).toEqual(["full-proposed"]);
    expect(b.unphased).toEqual([]);
  });
});

describe("bucketizeByProgress (Unphased section)", () => {
  it("puts a fully-ticked change into done", () => {
    const b = bucketizeByProgress([mkChange("x", undefined, { done: 5, total: 5 })], new Map());
    expect(b.done.map((c) => c.id)).toEqual(["x"]);
    expect(b.todo).toEqual([]);
    expect(b.inprogress).toEqual([]);
  });

  it("puts a change with a running job into inprogress even with 0/n progress", () => {
    const jobs = new Map<string, JobSummary>();
    jobs.set("x", mkJob("x", "running"));
    const b = bucketizeByProgress([mkChange("x", undefined, { done: 0, total: 5 })], jobs);
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });

  it("puts a change with a pending-merge job into inprogress", () => {
    const jobs = new Map<string, JobSummary>();
    jobs.set("x", mkJob("x", "completed"));
    const b = bucketizeByProgress([mkChange("x", undefined, { done: 0, total: 5 })], jobs);
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });

  it("puts a fresh change (0 done, no job) into todo", () => {
    const b = bucketizeByProgress([mkChange("x", undefined, { done: 0, total: 5 })], new Map());
    expect(b.todo.map((c) => c.id)).toEqual(["x"]);
  });

  it("puts a partially-progressed change with no job into inprogress", () => {
    // The pre-existing rule: some ticks + no active job = user is manually
    // walking through tasks. Preserve this behavior in the Unphased section.
    const b = bucketizeByProgress([mkChange("x", undefined, { done: 2, total: 5 })], new Map());
    expect(b.inprogress.map((c) => c.id)).toEqual(["x"]);
  });
});
