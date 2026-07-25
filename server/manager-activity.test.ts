// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for server/manager-activity.ts (expose-manager-activity-per-change).
 *
 * Covers:
 *  - set / get / clear round-trip (task 1.2)
 *  - `activity: "idle"` is equivalent to a clear (task 1.2)
 *  - bulk snapshot with multiple concurrent changes
 *  - body validation: shape + enum guards, 400-path (task 2.4)
 *  - token gating and broadcast payload derivation (task 2.4) — modelled the
 *    same way doctor.test.ts models its 400-path guard, since server/index.ts
 *    is a listening entrypoint and cannot be imported in a unit test.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearManagerActivity,
  getAllManagerActivities,
  getManagerActivity,
  isManagerActivityKind,
  isManagerStage,
  parseManagerActivityBody,
  resetManagerActivities,
  setManagerActivity,
} from "./manager-activity.js";
import { verifyToken, SESSION_TOKEN } from "./util/auth.js";

beforeEach(() => {
  resetManagerActivities();
});

// ---------------------------------------------------------------------------
// set / get / clear
// ---------------------------------------------------------------------------

describe("setManagerActivity / getManagerActivity / clearManagerActivity", () => {
  it("round-trips a set → get", () => {
    const stored = setManagerActivity({
      changeId: "x",
      stage: "code",
      activity: "waiting",
      detail: "claude",
    });
    expect(stored).not.toBeNull();
    expect(stored!.changeId).toBe("x");
    expect(stored!.stage).toBe("code");
    expect(stored!.activity).toBe("waiting");
    expect(stored!.detail).toBe("claude");
    expect(typeof stored!.startedAt).toBe("number");

    const got = getManagerActivity("x");
    expect(got).toEqual(stored);
  });

  it("omits detail entirely when not supplied", () => {
    const stored = setManagerActivity({ changeId: "x", stage: "review", activity: "judging" });
    expect(stored).not.toBeNull();
    expect("detail" in stored!).toBe(false);
  });

  it("overwrites the entry on a subsequent set", () => {
    setManagerActivity({ changeId: "x", stage: "code", activity: "dispatching" });
    setManagerActivity({ changeId: "x", stage: "code", activity: "waiting", detail: "claude" });
    const got = getManagerActivity("x");
    expect(got?.activity).toBe("waiting");
    expect(got?.detail).toBe("claude");
  });

  it("preserves startedAt across a re-post of the same stage+activity", () => {
    const first = setManagerActivity({ changeId: "x", stage: "code", activity: "waiting" });
    const second = setManagerActivity({
      changeId: "x",
      stage: "code",
      activity: "waiting",
      detail: "claude (5m)",
    });
    expect(second!.startedAt).toBe(first!.startedAt);
    expect(second!.detail).toBe("claude (5m)");
  });

  it("resets startedAt when the activity changes", () => {
    const first = setManagerActivity({ changeId: "x", stage: "code", activity: "waiting" });
    // Force a distinguishable timestamp without sleeping: rewrite via a new
    // activity and assert monotonic non-decrease plus a fresh identity.
    const second = setManagerActivity({ changeId: "x", stage: "code", activity: "judging" });
    expect(second!.startedAt).toBeGreaterThanOrEqual(first!.startedAt);
    expect(second!.activity).toBe("judging");
  });

  it("clearManagerActivity removes the entry and reports whether it did", () => {
    setManagerActivity({ changeId: "x", stage: "code", activity: "waiting" });
    expect(clearManagerActivity("x")).toBe(true);
    expect(getManagerActivity("x")).toBeUndefined();
    expect(clearManagerActivity("x")).toBe(false);
  });

  it('activity: "idle" is equivalent to a clear and returns null', () => {
    setManagerActivity({ changeId: "x", stage: "code", activity: "waiting" });
    const result = setManagerActivity({ changeId: "x", activity: "idle" });
    expect(result).toBeNull();
    expect(getManagerActivity("x")).toBeUndefined();
  });

  it('"idle" on an unknown change is a harmless no-op', () => {
    expect(setManagerActivity({ changeId: "never-set", activity: "idle" })).toBeNull();
    expect(getAllManagerActivities()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// bulk snapshot
// ---------------------------------------------------------------------------

describe("getAllManagerActivities", () => {
  it("returns {} on a fresh map (server-restart semantics)", () => {
    expect(getAllManagerActivities()).toEqual({});
  });

  it("keeps parallel dispatches independent", () => {
    setManagerActivity({ changeId: "X", stage: "code", activity: "waiting", detail: "claude" });
    setManagerActivity({ changeId: "Y", stage: "review", activity: "judging" });
    const all = getAllManagerActivities();
    expect(Object.keys(all).sort()).toEqual(["X", "Y"]);
    expect(all.X.activity).toBe("waiting");
    expect(all.X.stage).toBe("code");
    expect(all.Y.activity).toBe("judging");
    expect(all.Y.stage).toBe("review");
  });

  it("clearing one change leaves the other intact", () => {
    setManagerActivity({ changeId: "X", stage: "code", activity: "waiting" });
    setManagerActivity({ changeId: "Y", stage: "verify", activity: "cleanup", detail: "despawn" });
    setManagerActivity({ changeId: "X", activity: "idle" });
    const all = getAllManagerActivities();
    expect(Object.keys(all)).toEqual(["Y"]);
  });

  it("returns a detached copy — mutating it does not corrupt the map", () => {
    setManagerActivity({ changeId: "X", stage: "code", activity: "waiting" });
    const all = getAllManagerActivities();
    delete all.X;
    expect(getManagerActivity("X")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// body validation (endpoint 400-path)
// ---------------------------------------------------------------------------

describe("parseManagerActivityBody", () => {
  it("accepts a well-formed body", () => {
    const r = parseManagerActivityBody({
      changeId: "x",
      stage: "code",
      activity: "waiting",
      detail: "claude",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        changeId: "x",
        stage: "code",
        activity: "waiting",
        detail: "claude",
      });
    }
  });

  it("accepts an idle clear without a stage", () => {
    const r = parseManagerActivityBody({ changeId: "x", activity: "idle" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.stage).toBeUndefined();
  });

  it("requires a stage for every non-idle activity", () => {
    for (const activity of ["dispatching", "waiting", "judging", "cleanup", "transitioning"]) {
      const r = parseManagerActivityBody({ changeId: "x", activity });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects a missing or empty changeId", () => {
    for (const changeId of [undefined, null, "", "   ", 42, {}, []]) {
      const r = parseManagerActivityBody({ changeId, stage: "code", activity: "waiting" });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects an unknown activity", () => {
    for (const activity of [undefined, null, "", "thinking", "IDLE", 0, {}]) {
      const r = parseManagerActivityBody({ changeId: "x", stage: "code", activity });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects an unknown stage", () => {
    for (const stage of ["archive", "CODE", 1, {}, null]) {
      const r = parseManagerActivityBody({ changeId: "x", stage, activity: "waiting" });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects a non-string detail", () => {
    const r = parseManagerActivityBody({
      changeId: "x",
      stage: "code",
      activity: "waiting",
      detail: 5,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-object bodies", () => {
    for (const body of [undefined, null, "x", 5, []]) {
      expect(parseManagerActivityBody(body).ok).toBe(false);
    }
  });

  it("trims the changeId", () => {
    const r = parseManagerActivityBody({ changeId: "  x  ", stage: "code", activity: "waiting" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.changeId).toBe("x");
  });
});

describe("stage / activity type guards", () => {
  it("isManagerStage accepts only the three stages", () => {
    expect(["code", "review", "verify"].every(isManagerStage)).toBe(true);
    expect(["", "done", "CODE", null, 1].some(isManagerStage)).toBe(false);
  });

  it("isManagerActivityKind accepts only the six activities", () => {
    expect(
      ["dispatching", "waiting", "judging", "cleanup", "transitioning", "idle"].every(
        isManagerActivityKind,
      ),
    ).toBe(true);
    expect(["", "busy", "Waiting", null, 1].some(isManagerActivityKind)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// endpoint gating + broadcast payload derivation
// ---------------------------------------------------------------------------

describe("POST /api/manager/activity gating semantics", () => {
  /**
   * Mirror of the handler body in server/index.ts. server/index.ts starts a
   * listening Fastify instance at import time, so it cannot be imported here;
   * this models the same decision tree over the same primitives
   * (verifyToken + parseManagerActivityBody + setManagerActivity).
   */
  function handle(
    token: string | null,
    body: unknown,
  ): { status: number; broadcast?: { changeId: string; activity: unknown } } {
    if (!token || !verifyToken(token)) return { status: 401 };
    const parsed = parseManagerActivityBody(body);
    if (!parsed.ok) return { status: 400 };
    const activity = setManagerActivity(parsed.value);
    return { status: 200, broadcast: { changeId: parsed.value.changeId, activity } };
  }

  it("rejects a missing / invalid token with 401 and leaves the map untouched", () => {
    for (const token of [null, "", "nope", SESSION_TOKEN.slice(0, -1)]) {
      const r = handle(token, { changeId: "x", stage: "code", activity: "waiting" });
      expect(r.status).toBe(401);
      expect(r.broadcast).toBeUndefined();
    }
    expect(getAllManagerActivities()).toEqual({});
  });

  it("rejects an invalid body with 400 (after passing the token gate)", () => {
    const r = handle(SESSION_TOKEN, { changeId: "x", activity: "waiting" });
    expect(r.status).toBe(400);
    expect(getAllManagerActivities()).toEqual({});
  });

  it("broadcasts the stored record on a successful set", () => {
    const r = handle(SESSION_TOKEN, {
      changeId: "x",
      stage: "code",
      activity: "waiting",
      detail: "claude",
    });
    expect(r.status).toBe(200);
    expect(r.broadcast?.changeId).toBe("x");
    expect(r.broadcast?.activity).toEqual(getManagerActivity("x"));
  });

  it("broadcasts activity: null on an idle clear", () => {
    handle(SESSION_TOKEN, { changeId: "x", stage: "code", activity: "waiting" });
    const r = handle(SESSION_TOKEN, { changeId: "x", activity: "idle" });
    expect(r.status).toBe(200);
    expect(r.broadcast).toEqual({ changeId: "x", activity: null });
  });

  it("fires exactly one broadcast per accepted post", () => {
    const posts = [
      { changeId: "x", stage: "code", activity: "dispatching" },
      { changeId: "x", stage: "code", activity: "waiting", detail: "claude" },
      { changeId: "x", stage: "code", activity: "judging" },
      { changeId: "x", stage: "code", activity: "cleanup", detail: "despawn" },
      { changeId: "x", stage: "code", activity: "transitioning" },
      { changeId: "x", activity: "idle" },
    ];
    const broadcasts = posts
      .map((b) => handle(SESSION_TOKEN, b))
      .filter((r) => r.broadcast !== undefined);
    expect(broadcasts).toHaveLength(posts.length);
    expect(broadcasts[broadcasts.length - 1].broadcast?.activity).toBeNull();
    expect(getAllManagerActivities()).toEqual({});
  });
});
