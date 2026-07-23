// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for ImportProgress completion-detection logic.
 *
 * The component itself subscribes to the Zustand store and fires
 * onComplete when `state.exists === true && state.generatedMarkerPresent === true`.
 * These tests exercise that detection logic in isolation without a DOM
 * (the store subscription is a plain selector — easy to unit-test).
 *
 * Both predicates are required and correct:
 *   - `state.exists` is true when /api/state resolves openspecDir dynamically
 *     (the server-side F1 fix in server/index.ts). The server re-calls
 *     resolveOpenspecDir(PROJECT_ROOT) on every /api/state request so that
 *     a runtime openspec/ creation (import sub-agent) is reflected immediately.
 *   - `state.generatedMarkerPresent` is true when openspec/GENERATED.md exists,
 *     which the import sub-agent writes last.
 *
 * Full DOM rendering is deferred to manual task 8.5.
 */
import { describe, expect, it } from "vitest";
import type { WorkspaceState } from "../types";

// Minimal factory for WorkspaceState so tests stay concise.
function makeState(overrides: Partial<WorkspaceState>): WorkspaceState {
  return {
    root: "/tmp/test-project",
    exists: false,
    specs: [],
    changes: [],
    archive: [],
    gitStatus: { isRepo: false },
    lock: null,
    hasClaudeMd: false,
    hasAgentsYaml: false,
    generatedMarkerPresent: false,
    ...overrides,
  };
}

/**
 * Mirror of the completion predicate used in ImportProgress.tsx's useEffect:
 *   state && state.exists && state.generatedMarkerPresent
 */
function isImportComplete(state: WorkspaceState | null): boolean {
  return state !== null && state.exists && state.generatedMarkerPresent;
}

describe("ImportProgress completion detection", () => {
  it("does NOT complete when state is null", () => {
    expect(isImportComplete(null)).toBe(false);
  });

  it("does NOT complete when exists is false", () => {
    const state = makeState({ exists: false, generatedMarkerPresent: true });
    expect(isImportComplete(state)).toBe(false);
  });

  it("does NOT complete when generatedMarkerPresent is false", () => {
    const state = makeState({ exists: true, generatedMarkerPresent: false });
    expect(isImportComplete(state)).toBe(false);
  });

  it("does NOT complete when both exists and generatedMarkerPresent are false", () => {
    const state = makeState({ exists: false, generatedMarkerPresent: false });
    expect(isImportComplete(state)).toBe(false);
  });

  it("completes when exists === true AND generatedMarkerPresent === true", () => {
    const state = makeState({ exists: true, generatedMarkerPresent: true });
    expect(isImportComplete(state)).toBe(true);
  });

  it("passes the full state to onComplete (simulated)", () => {
    const state = makeState({
      exists: true,
      generatedMarkerPresent: true,
      root: "/Users/cishihara/projects/my-app/openspec",
    });
    const received: WorkspaceState[] = [];
    const onComplete = (s: WorkspaceState) => received.push(s);

    if (isImportComplete(state)) {
      onComplete(state);
    }

    expect(received).toHaveLength(1);
    expect(received[0].root).toBe("/Users/cishihara/projects/my-app/openspec");
    expect(received[0].generatedMarkerPresent).toBe(true);
  });
});

describe("generatedMarkerPresent state transitions", () => {
  it("initial state (before import dispatch) does not trigger completion", () => {
    // The workspace doesn't exist yet — no openspec/ present.
    const initial = makeState({ exists: false, generatedMarkerPresent: false });
    expect(isImportComplete(initial)).toBe(false);
  });

  it("state after dispatch (job enqueued, GENERATED.md not yet written) does not complete", () => {
    // openspec/ might appear from openspec-init but GENERATED.md not yet there
    const midImport = makeState({ exists: true, generatedMarkerPresent: false });
    expect(isImportComplete(midImport)).toBe(false);
  });

  it("state after sub-agent writes GENERATED.md triggers completion", () => {
    // Final state-replaced fires; GENERATED.md now present
    const complete = makeState({ exists: true, generatedMarkerPresent: true });
    expect(isImportComplete(complete)).toBe(true);
  });

  it("handles rapid state updates — only the final complete state fires onComplete", () => {
    const states: Array<WorkspaceState | null> = [
      null,
      makeState({ exists: false }),
      makeState({ exists: true, generatedMarkerPresent: false }),
      makeState({ exists: true, generatedMarkerPresent: true }),
    ];
    const completions: WorkspaceState[] = [];
    for (const s of states) {
      if (isImportComplete(s)) completions.push(s!);
    }
    expect(completions).toHaveLength(1);
    expect(completions[0].generatedMarkerPresent).toBe(true);
  });
});
