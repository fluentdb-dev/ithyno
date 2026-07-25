// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { workerStateView, DONE_GRACE_MS } from "./WorkerStateIndicator";
import type { JobSummary } from "../types";

/**
 * The repo's vitest setup runs in the `node` environment with no jsdom or
 * testing-library, so the render decision tree is exercised through the
 * pure `workerStateView()` split rather than by mounting the component.
 * One test per branch of the tree (annotate-cards-with-worker-job-state
 * task 6.2).
 */

const NOW = 1_700_000_000_000;

function mkJob(over: Partial<JobSummary> = {}): JobSummary {
  return {
    id: "job-1",
    changeId: "some-change",
    agentName: "claude-code",
    branch: "agent/some-change",
    worktreePath: "/repo/.worktrees/some-change",
    status: "running",
    startedAt: NOW - 45_000,
    ...over,
  } as JobSummary;
}

describe("workerStateView (annotate-cards-with-worker-job-state)", () => {
  it("no job + phase lane → queued hint", () => {
    const v = workerStateView(undefined, "phase", NOW);
    expect(v).not.toBeNull();
    expect(v!.kind).toBe("queued");
    expect(v!.label).toBe("queued");
    expect(v!.ticking).toBe(false);
  });

  it("no job + board lane → renders nothing", () => {
    expect(workerStateView(undefined, "board", NOW)).toBeNull();
  });

  it("running → agent name + elapsed, live ticking", () => {
    const v = workerStateView(mkJob({ status: "running" }), "board", NOW);
    expect(v!.kind).toBe("running");
    expect(v!.label).toBe("claude-code");
    expect(v!.elapsed).toBe("45s");
    expect(v!.ticking).toBe(true);
  });

  it("completed within the grace window → transient done checkmark", () => {
    const job = mkJob({ status: "completed", finishedAt: NOW - 5_000 });
    const v = workerStateView(job, "board", NOW);
    expect(v!.kind).toBe("completed");
    expect(v!.glyph).toBe("✓");
    expect(v!.label).toBe("done");
  });

  it("completed past the grace window → falls back to the idle branch", () => {
    const job = mkJob({ status: "completed", finishedAt: NOW - DONE_GRACE_MS - 1 });
    // Board view: nothing at all.
    expect(workerStateView(job, "board", NOW)).toBeNull();
    // Phase view: back to the queued hint.
    expect(workerStateView(job, "phase", NOW)!.kind).toBe("queued");
  });

  it("completed without a finishedAt stamp stays on the done state", () => {
    const job = mkJob({ status: "completed", finishedAt: undefined });
    expect(workerStateView(job, "board", NOW)!.kind).toBe("completed");
  });

  it("cancelled → muted cancelled label, no timer", () => {
    const v = workerStateView(mkJob({ status: "cancelled", finishedAt: NOW }), "board", NOW);
    expect(v!.kind).toBe("cancelled");
    expect(v!.label).toBe("cancelled");
    expect(v!.ticking).toBe(false);
  });

  it("crashed → red badge with the exit code in the tooltip", () => {
    const job = mkJob({ status: "crashed", finishedAt: NOW, exitCode: 137 });
    const v = workerStateView(job, "board", NOW);
    expect(v!.kind).toBe("crashed");
    expect(v!.label).toBe("crashed");
    expect(v!.title).toBe("exit code: 137");
  });

  it("orphaned → red badge with the worktree path in the tooltip", () => {
    const job = mkJob({ status: "orphaned", worktreePath: "/repo/.worktrees/x" });
    const v = workerStateView(job, "phase", NOW);
    expect(v!.kind).toBe("orphaned");
    expect(v!.label).toBe("orphaned");
    expect(v!.title).toContain("/repo/.worktrees/x");
  });

  it("terminal states are not swallowed by the idle branch in either lane", () => {
    for (const lane of ["board", "phase"] as const) {
      const v = workerStateView(mkJob({ status: "crashed", finishedAt: NOW - 60 * 60_000 }), lane, NOW);
      expect(v!.kind).toBe("crashed");
    }
  });
});
