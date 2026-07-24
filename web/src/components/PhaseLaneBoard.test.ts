// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { bucketizeByPhase } from "./PhaseLaneBoard";
import type { Change, Progress } from "../types";

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

describe("bucketizeByPhase (add-phase-lane-view-toggle)", () => {
  it("groups by known phase (all 4 lanes represented)", () => {
    const b = bucketizeByPhase([
      mkChange("a", { phase: "proposed" }),
      mkChange("b", { phase: "coded" }),
      mkChange("c", { phase: "reviewed" }),
      mkChange("d", { phase: "done" }),
    ]);
    expect(b.proposed.map((c) => c.id)).toEqual(["a"]);
    expect(b.coded.map((c) => c.id)).toEqual(["b"]);
    expect(b.reviewed.map((c) => c.id)).toEqual(["c"]);
    expect(b.done.map((c) => c.id)).toEqual(["d"]);
    expect(b.unphased).toEqual([]);
  });

  it("undefined phase → unphased", () => {
    const b = bucketizeByPhase([mkChange("x", { phase: undefined })]);
    expect(b.unphased.map((c) => c.id)).toEqual(["x"]);
    expect(b.proposed).toEqual([]);
  });

  it("unknown phase string → unphased (defensive narrowing)", () => {
    const b = bucketizeByPhase([mkChange("x", { phase: "not-a-real-phase" })]);
    expect(b.unphased.map((c) => c.id)).toEqual(["x"]);
  });

  it("needs-human with a resolvable priorPhase → priorPhase lane", () => {
    const b = bucketizeByPhase([
      mkChange("nh", { phase: "needs-human", priorPhase: "coded" }),
    ]);
    expect(b.coded.map((c) => c.id)).toEqual(["nh"]);
    expect(b.unphased).toEqual([]);
  });

  it("needs-human with undefined priorPhase → unphased", () => {
    const b = bucketizeByPhase([
      mkChange("nh", { phase: "needs-human", priorPhase: undefined }),
    ]);
    expect(b.unphased.map((c) => c.id)).toEqual(["nh"]);
    expect(b.coded).toEqual([]);
  });

  it("needs-human with unknown priorPhase → unphased", () => {
    const b = bucketizeByPhase([
      mkChange("nh", { phase: "needs-human", priorPhase: "garbage" }),
    ]);
    expect(b.unphased.map((c) => c.id)).toEqual(["nh"]);
  });

  it("mixed input preserves order within each lane", () => {
    const b = bucketizeByPhase([
      mkChange("a1", { phase: "proposed" }),
      mkChange("b1", { phase: "coded" }),
      mkChange("a2", { phase: "proposed" }),
      mkChange("u1", { phase: undefined }),
      mkChange("nh1", { phase: "needs-human", priorPhase: "reviewed" }),
      mkChange("d1", { phase: "done" }),
      mkChange("u2", { phase: undefined }),
    ]);
    expect(b.proposed.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(b.coded.map((c) => c.id)).toEqual(["b1"]);
    expect(b.reviewed.map((c) => c.id)).toEqual(["nh1"]);
    expect(b.done.map((c) => c.id)).toEqual(["d1"]);
    expect(b.unphased.map((c) => c.id)).toEqual(["u1", "u2"]);
  });

  it("empty input yields all-empty buckets", () => {
    const b = bucketizeByPhase([]);
    expect(b.proposed).toEqual([]);
    expect(b.coded).toEqual([]);
    expect(b.reviewed).toEqual([]);
    expect(b.done).toEqual([]);
    expect(b.unphased).toEqual([]);
  });
});
