// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for ManagerActivityBadge's render logic
 * (expose-manager-activity-per-change, task 7.1).
 *
 * NOTE: the vitest run is `environment: "node"` with `include:
 * web/src/**\/*.test.ts` — there is no jsdom and no React Testing Library in
 * this repo, so component *rendering* is not exercised anywhere in the suite.
 * Following the existing convention (Kanban.test.ts, PhaseLaneBoard.test.ts,
 * InitDialog.test.ts …), the render decisions live in exported pure helpers
 * and those are what we assert on — one case per activity variant.
 */
import { describe, expect, it } from "vitest";
import {
  activityLabel,
  activityTitle,
  formatElapsed,
} from "./ManagerActivityBadge";
import type { ManagerActivity } from "../types";

function mk(partial: Partial<ManagerActivity> = {}): ManagerActivity {
  return {
    changeId: "x",
    stage: "code",
    activity: "waiting",
    startedAt: 0,
    ...partial,
  };
}

describe("activityLabel — one case per activity variant", () => {
  it("dispatching → plain label (spinner supplies the motion)", () => {
    expect(activityLabel("dispatching")).toBe("dispatching");
    // detail is ignored for dispatching — the boundary post carries none.
    expect(activityLabel("dispatching", "claude")).toBe("dispatching");
  });

  it("waiting → appends the worker detail when present", () => {
    expect(activityLabel("waiting", "claude")).toBe("waiting: claude");
    expect(activityLabel("waiting")).toBe("waiting");
    expect(activityLabel("waiting", "   ")).toBe("waiting");
  });

  it("judging → plain label", () => {
    expect(activityLabel("judging")).toBe("judging");
  });

  it("cleanup → appends the step detail when present", () => {
    expect(activityLabel("cleanup", "worktree-remove")).toBe("cleanup: worktree-remove");
    expect(activityLabel("cleanup", "despawn")).toBe("cleanup: despawn");
    expect(activityLabel("cleanup")).toBe("cleanup");
  });

  it("transitioning → plain label", () => {
    expect(activityLabel("transitioning")).toBe("transitioning");
  });

  it("idle → null (the badge SHALL NOT render)", () => {
    expect(activityLabel("idle")).toBeNull();
    expect(activityLabel("idle", "anything")).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("renders seconds under a minute", () => {
    expect(formatElapsed(0, 15_000)).toBe("15s");
    expect(formatElapsed(0, 59_999)).toBe("59s");
  });

  it("renders minutes under an hour", () => {
    expect(formatElapsed(0, 60_000)).toBe("1m");
    expect(formatElapsed(0, 2 * 60_000)).toBe("2m");
    expect(formatElapsed(0, 59 * 60_000)).toBe("59m");
  });

  it("renders hours beyond that", () => {
    expect(formatElapsed(0, 60 * 60_000)).toBe("1h");
    expect(formatElapsed(0, 5 * 60 * 60_000)).toBe("5h");
  });

  it("clamps negative deltas (server/browser clock skew) to 0s", () => {
    expect(formatElapsed(10_000, 0)).toBe("0s");
  });
});

describe("badge composition (spec scenarios)", () => {
  it("waiting badge shows agent detail and a 2m elapsed suffix", () => {
    const a = mk({ activity: "waiting", detail: "claude", startedAt: 0 });
    const now = 2 * 60_000;
    expect(activityLabel(a.activity, a.detail)).toBe("waiting: claude");
    expect(formatElapsed(a.startedAt, now)).toBe("2m");
    expect(activityTitle(a, now)).toBe("Manager · code stage · waiting: claude · 2m");
  });

  it("cleanup badge shows step detail and a 15s elapsed suffix", () => {
    const a = mk({ activity: "cleanup", detail: "worktree-remove", stage: "verify", startedAt: 0 });
    const now = 15_000;
    expect(activityLabel(a.activity, a.detail)).toBe("cleanup: worktree-remove");
    expect(formatElapsed(a.startedAt, now)).toBe("15s");
    expect(activityTitle(a, now)).toBe(
      "Manager · verify stage · cleanup: worktree-remove · 15s",
    );
  });
});
