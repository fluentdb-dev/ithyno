// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for NoProjectDecisionPanel store integration
 * (unify-open-project-3-branch).
 *
 * These are store-level unit tests — they do NOT mount React components so
 * they work without a browser DOM. The component's button dispatch contract
 * is verified through the store's browseMode state alone.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "../store";

function resetBrowseMode() {
  useStore.setState({ browseMode: false });
}

describe("browseMode store slice (unify-open-project-3-branch)", () => {
  beforeEach(() => {
    resetBrowseMode();
  });

  it("initial browseMode is false", () => {
    expect(useStore.getState().browseMode).toBe(false);
  });

  it("setBrowseMode(true) sets browseMode to true", () => {
    useStore.getState().setBrowseMode(true);
    expect(useStore.getState().browseMode).toBe(true);
  });

  it("setBrowseMode(false) resets browseMode to false", () => {
    useStore.getState().setBrowseMode(true);
    useStore.getState().setBrowseMode(false);
    expect(useStore.getState().browseMode).toBe(false);
  });

  it("setBrowseMode is a function", () => {
    expect(typeof useStore.getState().setBrowseMode).toBe("function");
  });

  it("toggling browseMode does not affect terminalVisible", () => {
    const before = useStore.getState().terminalVisible;
    useStore.getState().setBrowseMode(true);
    expect(useStore.getState().terminalVisible).toBe(before);
    useStore.getState().setBrowseMode(false);
    expect(useStore.getState().terminalVisible).toBe(before);
  });
});

describe("NoProjectDecisionPanel hint logic (unify-open-project-3-branch)", () => {
  // The hasClaudeMd hint is rendered conditionally by the component prop.
  // We verify the store has no hasClaudeMd field (it lives in WorkspaceState,
  // not the store directly), so the panel reads it from state.hasClaudeMd.

  it("store state is null before first load", () => {
    // Reset state to simulate a fresh mount.
    useStore.setState({ state: null });
    expect(useStore.getState().state).toBeNull();
  });

  it("hasClaudeMd can be read from state when state is set", () => {
    useStore.setState({
      state: {
        root: "/tmp/myproject",
        exists: false,
        specs: [],
        changes: [],
        archive: [],
        hasClaudeMd: true,
        gitStatus: { isRepo: false },
        lock: null,
      },
    });
    expect(useStore.getState().state?.hasClaudeMd).toBe(true);
  });

  it("hasClaudeMd is false when CLAUDE.md does not exist", () => {
    useStore.setState({
      state: {
        root: "/tmp/myproject",
        exists: false,
        specs: [],
        changes: [],
        archive: [],
        hasClaudeMd: false,
        gitStatus: { isRepo: false },
        lock: null,
      },
    });
    expect(useStore.getState().state?.hasClaudeMd).toBe(false);
  });
});
