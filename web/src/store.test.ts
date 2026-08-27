// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for store WS message routing — `import-completed` event handling.
 * (enable-import-both-patterns task 9.5)
 *
 * Tests the routing logic in isolation, mirroring the behavior of
 * connectWs's onmessage handler without mounting React.
 */
import { describe, it, expect } from "vitest";
import { shouldBlockForWorkspaceLoad, type ImportedProjectNotification } from "./store";
import { recoverDecision } from "./focusRecovery";
import type {
  ImportCompletedEvent,
  ManagerActivity,
  ManagerActivityUpdatedEvent,
  WorkspaceState,
} from "./types";

// ---- Focus recovery decisions (preserve-dashboard-dialog-input) -------------
//
// shouldBlockForWorkspaceLoad gates the initial-load spinner but is NOT the
// complete picture of focus-recovery behavior. recoverDecision (below) covers
// the runtime event → action mapping that prevents unnecessary workspace
// reloads on healthy focus events.

describe("shouldBlockForWorkspaceLoad — initial load gate", () => {
  it("blocks the application shell before the initial workspace load", () => {
    expect(shouldBlockForWorkspaceLoad(null)).toBe(true);
  });

  it("keeps mounted routes and dialogs during a background refresh", () => {
    expect(shouldBlockForWorkspaceLoad({} as WorkspaceState)).toBe(false);
  });
});

describe("recoverDecision — focus/visibility event → action mapping", () => {
  it("healthy connected dashboard: all auth outcomes are no-ops", () => {
    expect(recoverDecision(true, "valid")).toBe("no-op");
    expect(recoverDecision(true, "unauthorized")).toBe("no-op");
    expect(recoverDecision(true, "unavailable")).toBe("no-op");
  });

  it("disconnected + auth valid: reconnect without shell reload", () => {
    expect(recoverDecision(false, "valid")).toBe("reconnect");
  });

  it("disconnected + auth unauthorized: reload the containing shell", () => {
    expect(recoverDecision(false, "unauthorized")).toBe("reload-shell");
  });

  it("disconnected + auth unavailable: no-op (leave UI mounted)", () => {
    expect(recoverDecision(false, "unavailable")).toBe("no-op");
  });
});

describe("dialog continuity on healthy focus restoration", () => {
  it("healthy focus does not trigger a workspace reload", () => {
    // When connected, recoverDecision returns "no-op", so neither load()
    // nor connectWs() is called. An open dialog and its typed values survive.
    let loadCalled = false;
    const decision = recoverDecision(true, "valid");
    if (decision === "reconnect") loadCalled = true;
    expect(loadCalled).toBe(false);
  });

  it("disconnected valid-auth recovery reconnects but does not reload the shell", () => {
    let shellReloaded = false;
    const decision = recoverDecision(false, "valid");
    if (decision === "reload-shell") shellReloaded = true;
    expect(decision).toBe("reconnect");
    expect(shellReloaded).toBe(false);
  });

  it("unavailable auth during recovery leaves the dialog intact", () => {
    let loadCalled = false;
    let shellReloaded = false;
    const decision = recoverDecision(false, "unavailable");
    if (decision === "reconnect") loadCalled = true;
    if (decision === "reload-shell") shellReloaded = true;
    expect(loadCalled).toBe(false);
    expect(shellReloaded).toBe(false);
  });
});

// ---- Route logic (extracted from store for unit-testability) ---------------

type FakeStoreState = {
  importedProjectNotifications: ImportedProjectNotification[];
  stateLoadTriggered: boolean;
};

function handleImportCompleted(
  ev: ImportCompletedEvent,
  state: FakeStoreState,
): FakeStoreState {
  if (ev.pattern === "B") {
    return { ...state, stateLoadTriggered: true };
  }
  // Pattern A: push notification.
  return {
    ...state,
    importedProjectNotifications: [
      ...state.importedProjectNotifications,
      {
        id: ev.jobId,
        targetPath: ev.targetPath,
        completedAt: 0, // ignored in routing tests
      },
    ],
  };
}

const initialState: FakeStoreState = {
  importedProjectNotifications: [],
  stateLoadTriggered: false,
};

describe("import-completed WS message routing", () => {
  it("Pattern B triggers state reload (not a notification)", () => {
    const ev: ImportCompletedEvent = {
      type: "import-completed",
      jobId: "job-b",
      targetPath: "/home/user/project",
      pattern: "B",
    };
    const next = handleImportCompleted(ev, { ...initialState });
    expect(next.stateLoadTriggered).toBe(true);
    expect(next.importedProjectNotifications).toHaveLength(0);
  });

  it("Pattern A pushes a notification (not a state reload)", () => {
    const ev: ImportCompletedEvent = {
      type: "import-completed",
      jobId: "job-a",
      targetPath: "/home/user/other-project",
      pattern: "A",
    };
    const next = handleImportCompleted(ev, { ...initialState });
    expect(next.stateLoadTriggered).toBe(false);
    expect(next.importedProjectNotifications).toHaveLength(1);
    expect(next.importedProjectNotifications[0].id).toBe("job-a");
    expect(next.importedProjectNotifications[0].targetPath).toBe("/home/user/other-project");
  });

  it("multiple Pattern A events each produce an independent notification", () => {
    let state = { ...initialState };
    const targets = ["/project-alpha", "/project-beta", "/project-gamma"];
    for (let i = 0; i < targets.length; i++) {
      const ev: ImportCompletedEvent = {
        type: "import-completed",
        jobId: `job-${i}`,
        targetPath: targets[i],
        pattern: "A",
      };
      state = handleImportCompleted(ev, state);
    }
    expect(state.importedProjectNotifications).toHaveLength(3);
    expect(state.importedProjectNotifications.map((n) => n.targetPath)).toEqual(targets);
  });

  it("Pattern B does not add a notification even when notifications already exist", () => {
    const existing: ImportedProjectNotification = {
      id: "pre-existing",
      targetPath: "/pre-existing",
      completedAt: 0,
    };
    let state: FakeStoreState = {
      importedProjectNotifications: [existing],
      stateLoadTriggered: false,
    };
    const ev: ImportCompletedEvent = {
      type: "import-completed",
      jobId: "job-b2",
      targetPath: "/same-project",
      pattern: "B",
    };
    state = handleImportCompleted(ev, state);
    expect(state.importedProjectNotifications).toHaveLength(1);
    expect(state.stateLoadTriggered).toBe(true);
  });
});

// ---- manager-activity-updated routing (expose-manager-activity-per-change) --
//
// Mirrors the store's `setManagerActivity` reducer + the WS branch that feeds
// it. Same shape as the import-completed tests above: the routing logic is
// exercised in isolation rather than by mounting React (the vitest run is
// node-environment).

type ManagerActivityState = { managerActivity: Record<string, ManagerActivity> };

function setManagerActivity(
  state: ManagerActivityState,
  changeId: string,
  activity: ManagerActivity | null,
): ManagerActivityState {
  if (activity === null) {
    if (!(changeId in state.managerActivity)) return state;
    const { [changeId]: _drop, ...rest } = state.managerActivity;
    return { managerActivity: rest };
  }
  return { managerActivity: { ...state.managerActivity, [changeId]: activity } };
}

function handleManagerActivityUpdated(
  ev: ManagerActivityUpdatedEvent,
  state: ManagerActivityState,
): ManagerActivityState {
  return setManagerActivity(state, ev.changeId, ev.activity ?? null);
}

function mkActivity(partial: Partial<ManagerActivity> = {}): ManagerActivity {
  return {
    changeId: "x",
    role: "code",
    activity: "waiting",
    startedAt: 1_000,
    ...partial,
  };
}

describe("manager-activity-updated WS message routing", () => {
  const empty: ManagerActivityState = { managerActivity: {} };

  it("stores the activity under its changeId", () => {
    const activity = mkActivity({ detail: "claude" });
    const next = handleManagerActivityUpdated(
      { type: "manager-activity-updated", changeId: "x", activity },
      { ...empty },
    );
    expect(next.managerActivity.x).toEqual(activity);
  });

  it("a later event for the same change replaces the entry", () => {
    let state: ManagerActivityState = { ...empty };
    state = handleManagerActivityUpdated(
      { type: "manager-activity-updated", changeId: "x", activity: mkActivity() },
      state,
    );
    state = handleManagerActivityUpdated(
      {
        type: "manager-activity-updated",
        changeId: "x",
        activity: mkActivity({ activity: "judging", startedAt: 2_000 }),
      },
      state,
    );
    expect(Object.keys(state.managerActivity)).toEqual(["x"]);
    expect(state.managerActivity.x.activity).toBe("judging");
    expect(state.managerActivity.x.startedAt).toBe(2_000);
  });

  it("null activity clears the entry", () => {
    let state = handleManagerActivityUpdated(
      { type: "manager-activity-updated", changeId: "x", activity: mkActivity() },
      { ...empty },
    );
    state = handleManagerActivityUpdated(
      { type: "manager-activity-updated", changeId: "x", activity: null },
      state,
    );
    expect(state.managerActivity).toEqual({});
  });

  it("null activity for an unknown change is a no-op", () => {
    const state = handleManagerActivityUpdated(
      { type: "manager-activity-updated", changeId: "never-seen", activity: null },
      { ...empty },
    );
    expect(state.managerActivity).toEqual({});
  });

  it("multiple changes coexist and clear independently", () => {
    let state: ManagerActivityState = { ...empty };
    state = handleManagerActivityUpdated(
      {
        type: "manager-activity-updated",
        changeId: "X",
        activity: mkActivity({ changeId: "X", activity: "waiting", detail: "claude" }),
      },
      state,
    );
    state = handleManagerActivityUpdated(
      {
        type: "manager-activity-updated",
        changeId: "Y",
        activity: mkActivity({ changeId: "Y", role: "review", activity: "judging" }),
      },
      state,
    );
    expect(Object.keys(state.managerActivity).sort()).toEqual(["X", "Y"]);
    expect(state.managerActivity.X.activity).toBe("waiting");
    expect(state.managerActivity.Y.role).toBe("review");

    state = handleManagerActivityUpdated(
      { type: "manager-activity-updated", changeId: "X", activity: null },
      state,
    );
    expect(Object.keys(state.managerActivity)).toEqual(["Y"]);
  });

  it("does not mutate the previous state object (zustand immutability)", () => {
    const before: ManagerActivityState = { managerActivity: {} };
    const after = handleManagerActivityUpdated(
      { type: "manager-activity-updated", changeId: "x", activity: mkActivity() },
      before,
    );
    expect(before.managerActivity).toEqual({});
    expect(after).not.toBe(before);
  });
});
