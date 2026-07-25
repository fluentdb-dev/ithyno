// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { bucketizeByPhase, deriveLaneList, LANE_LABEL, type LaneId } from "./PhaseLaneBoard";
import type { AgentPublic, Change, Progress } from "../types";

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

describe("deriveLaneList (dynamic-phase-lanes-from-agents-roles)", () => {
  it("no agents at all → code + done only", () => {
    expect(ids(deriveLaneList([]))).toEqual(["code", "done"]);
  });

  it("undefined / null agents degrade to code + done", () => {
    expect(ids(deriveLaneList(undefined))).toEqual(["code", "done"]);
    expect(ids(deriveLaneList(null))).toEqual(["code", "done"]);
  });

  it("roles [code] → 2 lanes", () => {
    expect(ids(deriveLaneList([mkAgent("worker", ["code"])]))).toEqual(["code", "done"]);
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

  it("verify-only declaration still yields code + verify + done", () => {
    expect(ids(deriveLaneList([mkAgent("v", ["verify"])]))).toEqual(["code", "verify", "done"]);
  });
});

const FULL: LaneId[] = ["propose", "code", "review", "verify", "done"];
const MINIMAL: LaneId[] = ["code", "done"];
const CODE_REVIEW: LaneId[] = ["code", "review", "done"];

describe("bucketizeByPhase — shift by one (full 5-lane set)", () => {
  it("routes every phase to its NEXT-stage lane", () => {
    const b = bucketizeByPhase(
      [
        mkChange("u", { phase: undefined }),
        mkChange("a", { phase: "proposed" }),
        mkChange("b", { phase: "coded" }),
        mkChange("c", { phase: "reviewed" }),
        mkChange("d", { phase: "done" }),
      ],
      FULL,
    );
    expect(b.propose.map((c) => c.id)).toEqual(["u"]);
    expect(b.code.map((c) => c.id)).toEqual(["a"]);
    expect(b.review.map((c) => c.id)).toEqual(["b"]);
    expect(b.verify.map((c) => c.id)).toEqual(["c"]);
    expect(b.done.map((c) => c.id)).toEqual(["d"]);
  });

  it("unknown phase string folds into propose", () => {
    const b = bucketizeByPhase([mkChange("x", { phase: "not-a-real-phase" })], FULL);
    expect(b.propose.map((c) => c.id)).toEqual(["x"]);
  });

  it("preserves input order within a lane", () => {
    const b = bucketizeByPhase(
      [
        mkChange("p1", { phase: "proposed" }),
        mkChange("c1", { phase: "coded" }),
        mkChange("p2", { phase: "proposed" }),
      ],
      FULL,
    );
    expect(b.code.map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(b.review.map((c) => c.id)).toEqual(["c1"]);
  });

  it("empty input yields all-empty buckets", () => {
    const b = bucketizeByPhase([], FULL);
    expect(b.propose).toEqual([]);
    expect(b.code).toEqual([]);
    expect(b.review).toEqual([]);
    expect(b.verify).toEqual([]);
    expect(b.done).toEqual([]);
  });
});

describe("bucketizeByPhase — fallback when a lane is absent", () => {
  it("minimal [code, done]: unphased + proposed → code, everything else → done", () => {
    const b = bucketizeByPhase(
      [
        mkChange("u", { phase: undefined }),
        mkChange("a", { phase: "proposed" }),
        mkChange("b", { phase: "coded" }),
        mkChange("c", { phase: "reviewed" }),
        mkChange("d", { phase: "done" }),
      ],
      MINIMAL,
    );
    expect(b.code.map((c) => c.id)).toEqual(["u", "a"]);
    expect(b.done.map((c) => c.id)).toEqual(["b", "c", "d"]);
    expect(b.propose).toEqual([]);
    expect(b.review).toEqual([]);
    expect(b.verify).toEqual([]);
  });

  it("[code, review, done]: coded → review, reviewed → done (no verify stage)", () => {
    const b = bucketizeByPhase(
      [mkChange("b", { phase: "coded" }), mkChange("c", { phase: "reviewed" })],
      CODE_REVIEW,
    );
    expect(b.review.map((c) => c.id)).toEqual(["b"]);
    expect(b.done.map((c) => c.id)).toEqual(["c"]);
  });

  it("no change is dropped regardless of lane set", () => {
    const changes = [
      mkChange("u", { phase: undefined }),
      mkChange("x", { phase: "garbage" }),
      mkChange("a", { phase: "proposed" }),
      mkChange("b", { phase: "coded" }),
      mkChange("c", { phase: "reviewed" }),
      mkChange("d", { phase: "done" }),
      mkChange("nh", { phase: "needs-human", priorPhase: "coded" }),
      mkChange("nh2", { phase: "needs-human" }),
    ];
    for (const laneIds of [FULL, MINIMAL, CODE_REVIEW, ["code", "verify", "done"] as LaneId[]]) {
      const b = bucketizeByPhase(changes, laneIds);
      const seen = laneIds.flatMap((id) => b[id].map((c) => c.id));
      expect(seen.slice().sort()).toEqual(changes.map((c) => c.id).slice().sort());
    }
  });

  it("degenerate empty laneIds drops nothing into a real lane and does not throw", () => {
    const b = bucketizeByPhase([mkChange("a", { phase: "proposed" })], []);
    expect(b.code).toEqual([]);
    expect(b.done).toEqual([]);
  });
});

describe("bucketizeByPhase — needs-human resolves via priorPhase", () => {
  it("priorPhase coded + review lane declared → review lane", () => {
    const b = bucketizeByPhase(
      [mkChange("nh", { phase: "needs-human", priorPhase: "coded" })],
      FULL,
    );
    expect(b.review.map((c) => c.id)).toEqual(["nh"]);
  });

  it("priorPhase proposed → code lane", () => {
    const b = bucketizeByPhase(
      [mkChange("nh", { phase: "needs-human", priorPhase: "proposed" })],
      FULL,
    );
    expect(b.code.map((c) => c.id)).toEqual(["nh"]);
  });

  it("priorPhase coded with no review lane → done", () => {
    const b = bucketizeByPhase(
      [mkChange("nh", { phase: "needs-human", priorPhase: "coded" })],
      MINIMAL,
    );
    expect(b.done.map((c) => c.id)).toEqual(["nh"]);
  });

  it("undefined priorPhase folds into the first lane", () => {
    expect(
      bucketizeByPhase(
        [mkChange("nh", { phase: "needs-human", priorPhase: undefined })],
        FULL,
      ).propose.map((c) => c.id),
    ).toEqual(["nh"]);
    expect(
      bucketizeByPhase(
        [mkChange("nh", { phase: "needs-human", priorPhase: undefined })],
        MINIMAL,
      ).code.map((c) => c.id),
    ).toEqual(["nh"]);
  });

  it("unknown priorPhase string folds into the first lane", () => {
    const b = bucketizeByPhase(
      [mkChange("nh", { phase: "needs-human", priorPhase: "garbage" })],
      CODE_REVIEW,
    );
    expect(b.code.map((c) => c.id)).toEqual(["nh"]);
  });
});

describe("deriveLaneList + bucketizeByPhase end-to-end", () => {
  it("agents.yaml [code] only: coded change lands in DONE", () => {
    const lanes = deriveLaneList([mkAgent("worker", ["code"])]);
    const b = bucketizeByPhase([mkChange("b", { phase: "coded" })], ids(lanes));
    expect(lanes.map((l) => l.label)).toEqual(["CODING", "DONE"]);
    expect(b.done.map((c) => c.id)).toEqual(["b"]);
  });

  it("agents.yaml [code, review, verify]: reviewed change lands in VERIFYING", () => {
    const lanes = deriveLaneList([mkAgent("worker", ["code", "review", "verify"])]);
    const b = bucketizeByPhase([mkChange("c", { phase: "reviewed" })], ids(lanes));
    expect(b.verify.map((x) => x.id)).toEqual(["c"]);
  });

  it("dropping the review role re-flows its changes to done", () => {
    const changes = [mkChange("b", { phase: "coded" })];
    const withReview = deriveLaneList([mkAgent("w", ["code", "review"])]);
    expect(bucketizeByPhase(changes, ids(withReview)).review.map((c) => c.id)).toEqual(["b"]);

    const withoutReview = deriveLaneList([mkAgent("w", ["code"])]);
    expect(bucketizeByPhase(changes, ids(withoutReview)).done.map((c) => c.id)).toEqual(["b"]);
  });
});
