// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  bucketizeByActiveRole,
  deriveLaneList,
  LANE_LABEL,
  type LaneId,
} from "./PhaseLaneBoard";
import type {
  AgentPublic,
  Change,
  JobSummary,
  ManagerActivity,
  Progress,
} from "../types";

/**
 * Tests for PhaseLaneBoard's dynamic lane derivation + active-role
 * bucketization (reshape-phase-view-to-active-agent-state).
 *
 * The pre-reshape API `bucketizeByPhase(changes, laneIds)` derived the lane
 * from `change.phase` (a persistence signal). It was replaced by
 * `bucketizeByActiveRole(changes, jobByChange, managerActivityByChange, laneIds)`
 * which derives the lane from the ACTIVE agent's role — worker Job.role wins,
 * else Manager fallback ManagerActivity.role, else the change is filtered out
 * (except `phase === "done"` which stays as historical record in DONE).
 */

function mkChange(
  id: string,
  opts: {
    phase?: unknown;
    priorPhase?: unknown;
    progress?: Progress;
  } = {},
): Change {
  const progress = opts.progress ?? { done: 0, total: 5 };
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
    phase: opts.phase as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    priorPhase: opts.priorPhase as any,
  } as unknown as Change;
}

function mkJob(changeId: string, role: string | undefined, status: JobSummary["status"] = "running"): JobSummary {
  return {
    id: `job-${changeId}`,
    changeId,
    agentName: "worker",
    role,
    status,
    startedAt: 0,
  } as unknown as JobSummary;
}

function mkActivity(role: ManagerActivity["role"], activity: ManagerActivity["activity"] = "waiting"): ManagerActivity {
  return {
    changeId: "x",
    role,
    activity,
    startedAt: 0,
  } as ManagerActivity;
}

/** Minimal AgentPublic — only `roles` matters to `deriveLaneList`. */
function mkAgent(name: string, roles: string[]): AgentPublic {
  return {
    name,
    hasEnv: false,
    mode: "single-prompt",
    roles,
    role: roles[0] ?? "other",
  };
}

const ids = (lanes: { id: LaneId }[]) => lanes.map((l) => l.id);

// ---------------------------------------------------------------------------
// deriveLaneList — same as pre-reshape (not affected by this change)
// ---------------------------------------------------------------------------

describe("deriveLaneList (dynamic-phase-lanes-from-agents-roles)", () => {
  it("no agents at all → code + done only", () => {
    expect(ids(deriveLaneList([]))).toEqual(["code", "done"]);
  });

  it("undefined / null agents degrade to code + done", () => {
    expect(ids(deriveLaneList(undefined))).toEqual(["code", "done"]);
    expect(ids(deriveLaneList(null))).toEqual(["code", "done"]);
  });

  it("roles [code, review] → 3 lanes in workflow order", () => {
    expect(ids(deriveLaneList([mkAgent("worker", ["code", "review"])]))).toEqual([
      "code",
      "review",
      "done",
    ]);
  });

  it("roles [propose, code, review, verify] → 5 lanes in workflow order", () => {
    const lanes = deriveLaneList([mkAgent("all", ["verify", "propose", "review", "code"])]);
    expect(ids(lanes)).toEqual(["propose", "code", "review", "verify", "done"]);
  });

  it("aggregates roles across multiple agents", () => {
    const lanes = deriveLaneList([
      mkAgent("a", ["code"]),
      mkAgent("b", ["review"]),
      mkAgent("c", ["manager"]),
    ]);
    expect(ids(lanes)).toEqual(["code", "review", "done"]);
  });

  it("ignores non-lane roles (manager / other / custom)", () => {
    const lanes = deriveLaneList([mkAgent("m", ["manager", "other", "sparkle"])]);
    expect(ids(lanes)).toEqual(["code", "done"]);
  });

  it("labels are present-continuous", () => {
    const lanes = deriveLaneList([mkAgent("all", ["propose", "code", "review", "verify"])]);
    expect(lanes.map((l) => l.label)).toEqual([
      "PROPOSING",
      "CODING",
      "REVIEWING",
      "VERIFYING",
      "DONE",
    ]);
    expect(LANE_LABEL.review).toBe("REVIEWING");
  });
});

// ---------------------------------------------------------------------------
// bucketizeByActiveRole — the reshape's core
// ---------------------------------------------------------------------------

const FULL: LaneId[] = ["propose", "code", "review", "verify", "done"];
const MINIMAL: LaneId[] = ["code", "done"];

describe("bucketizeByActiveRole — worker Job.role drives the lane", () => {
  it("running worker with role=code lands in CODE", () => {
    const changes = [mkChange("a", { phase: "proposed" })];
    const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "code")]]);
    const b = bucketizeByActiveRole(changes, jobByChange, {}, FULL);
    expect(b.code.map((c) => c.id)).toEqual(["a"]);
    expect(b.propose).toEqual([]);
    expect(b.review).toEqual([]);
    expect(b.verify).toEqual([]);
    expect(b.done).toEqual([]);
  });

  it("running worker with role=review lands in REVIEW regardless of change.phase", () => {
    const changes = [mkChange("a", { phase: "proposed" })];
    const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "review")]]);
    const b = bucketizeByActiveRole(changes, jobByChange, {}, FULL);
    expect(b.review.map((c) => c.id)).toEqual(["a"]);
  });

  it("worker.role=verify lands in VERIFY (agents.yaml declared it)", () => {
    const changes = [mkChange("a", { phase: "reviewed" })];
    const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "verify")]]);
    const b = bucketizeByActiveRole(changes, jobByChange, {}, FULL);
    expect(b.verify.map((c) => c.id)).toEqual(["a"]);
  });

  it("completed / crashed / cancelled job does NOT keep the change visible", () => {
    const changes = [mkChange("a", { phase: "coded" })];
    for (const status of ["completed", "crashed", "cancelled", "orphaned"] as const) {
      const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "code", status)]]);
      const b = bucketizeByActiveRole(changes, jobByChange, {}, FULL);
      expect(b.code.map((c) => c.id)).toEqual([]);
      expect(b.done).toEqual([]);
    }
  });
});

describe("bucketizeByActiveRole — Manager activity fills in when no worker", () => {
  it("Manager fallback verify lands in VERIFY lane (A2 policy)", () => {
    const changes = [mkChange("a", { phase: "reviewed" })];
    const b = bucketizeByActiveRole(
      changes,
      new Map(),
      { a: mkActivity("verify", "judging") },
      FULL,
    );
    expect(b.verify.map((c) => c.id)).toEqual(["a"]);
  });

  it("Manager between-role activity (cleanup) uses the preserved role (B2 policy)", () => {
    // Server-side, cleanup preserves prev.role. The board treats this as
    // that role being "still in play".
    const changes = [mkChange("a", { phase: "coded" })];
    const b = bucketizeByActiveRole(
      changes,
      new Map(),
      { a: mkActivity("code", "cleanup") },
      FULL,
    );
    expect(b.code.map((c) => c.id)).toEqual(["a"]);
  });

  it("Manager transitioning uses the preserved role", () => {
    const changes = [mkChange("a", { phase: "coded" })];
    const b = bucketizeByActiveRole(
      changes,
      new Map(),
      { a: mkActivity("review", "transitioning") },
      FULL,
    );
    expect(b.review.map((c) => c.id)).toEqual(["a"]);
  });

  it("Manager idle activity is treated as no activity → change is filtered", () => {
    const changes = [mkChange("a", { phase: "proposed" })];
    const b = bucketizeByActiveRole(
      changes,
      new Map(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { a: { changeId: "a", activity: "idle", startedAt: 0 } as any },
      FULL,
    );
    expect(b.code.map((c) => c.id)).toEqual([]);
  });

  it("worker Job.role wins over Manager activity when both present", () => {
    const changes = [mkChange("a", { phase: "coded" })];
    const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "code")]]);
    const b = bucketizeByActiveRole(
      changes,
      jobByChange,
      { a: mkActivity("verify", "dispatching") },
      FULL,
    );
    expect(b.code.map((c) => c.id)).toEqual(["a"]);
    expect(b.verify).toEqual([]);
  });
});

describe("bucketizeByActiveRole — idle changes are filtered out", () => {
  it("no job and no manager activity → change does not appear in any lane", () => {
    const changes = [
      mkChange("a", { phase: "proposed" }),
      mkChange("b", { phase: "coded" }),
      mkChange("c", { phase: "reviewed" }),
    ];
    const b = bucketizeByActiveRole(changes, new Map(), {}, FULL);
    expect(b.propose).toEqual([]);
    expect(b.code).toEqual([]);
    expect(b.review).toEqual([]);
    expect(b.verify).toEqual([]);
    expect(b.done).toEqual([]);
  });

  it("phase=done always appears in DONE even without job/activity (history)", () => {
    const changes = [mkChange("a", { phase: "done" })];
    const b = bucketizeByActiveRole(changes, new Map(), {}, FULL);
    expect(b.done.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("bucketizeByActiveRole — A1 filter drops non-standard roles", () => {
  it("worker role=other is filtered out", () => {
    const changes = [mkChange("a", { phase: "coded" })];
    const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "other")]]);
    const b = bucketizeByActiveRole(changes, jobByChange, {}, FULL);
    expect(b.code).toEqual([]);
    expect(b.done).toEqual([]);
  });

  it("worker role=manager is filtered out (manager is not a lane)", () => {
    const changes = [mkChange("a", { phase: "coded" })];
    const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "manager")]]);
    const b = bucketizeByActiveRole(changes, jobByChange, {}, FULL);
    expect(b.code).toEqual([]);
  });
});

describe("bucketizeByActiveRole — lane availability fallback", () => {
  it("minimal [code, done]: worker role=review with no review lane falls through to DONE", () => {
    const changes = [mkChange("a", { phase: "coded" })];
    const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "review")]]);
    const b = bucketizeByActiveRole(changes, jobByChange, {}, MINIMAL);
    expect(b.done.map((c) => c.id)).toEqual(["a"]);
  });

  it("degenerate empty laneIds yields all-empty buckets", () => {
    const changes = [mkChange("a", { phase: "coded" })];
    const jobByChange = new Map<string, JobSummary>([["a", mkJob("a", "code")]]);
    const b = bucketizeByActiveRole(changes, jobByChange, {}, []);
    expect(b.code).toEqual([]);
    expect(b.done).toEqual([]);
  });
});

describe("bucketizeByActiveRole — mixed scenarios", () => {
  it("preserves input order within a lane", () => {
    const changes = [
      mkChange("p1", { phase: "proposed" }),
      mkChange("p2", { phase: "proposed" }),
      mkChange("c1", { phase: "coded" }),
    ];
    const jobByChange = new Map<string, JobSummary>([
      ["p1", mkJob("p1", "code")],
      ["p2", mkJob("p2", "code")],
      ["c1", mkJob("c1", "review")],
    ]);
    const b = bucketizeByActiveRole(changes, jobByChange, {}, FULL);
    expect(b.code.map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(b.review.map((c) => c.id)).toEqual(["c1"]);
  });

  it("mixed: 2 running workers + 1 manager fallback + 1 done + 1 idle", () => {
    const changes = [
      mkChange("w1", { phase: "proposed" }),
      mkChange("w2", { phase: "coded" }),
      mkChange("m", { phase: "reviewed" }),
      mkChange("d", { phase: "done" }),
      mkChange("i", { phase: "proposed" }),
    ];
    const jobByChange = new Map<string, JobSummary>([
      ["w1", mkJob("w1", "code")],
      ["w2", mkJob("w2", "review")],
    ]);
    const managerActivityByChange = { m: mkActivity("verify", "judging") };
    const b = bucketizeByActiveRole(changes, jobByChange, managerActivityByChange, FULL);
    expect(b.code.map((c) => c.id)).toEqual(["w1"]);
    expect(b.review.map((c) => c.id)).toEqual(["w2"]);
    expect(b.verify.map((c) => c.id)).toEqual(["m"]);
    expect(b.done.map((c) => c.id)).toEqual(["d"]);
    // "i" is idle → not present anywhere
  });
});
