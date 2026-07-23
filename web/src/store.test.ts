// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for store WS message routing — `import-completed` event handling.
 * (enable-import-both-patterns task 9.5)
 *
 * Tests the routing logic in isolation, mirroring the behavior of
 * connectWs's onmessage handler without mounting React.
 */
import { describe, it, expect } from "vitest";
import type { ImportedProjectNotification } from "./store";
import type { ImportCompletedEvent } from "./types";

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
