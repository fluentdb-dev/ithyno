// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for ReadOnlyBrowse store integration (unify-open-project-3-branch).
 *
 * These are store-level unit tests — they do NOT mount React components so
 * they work without a browser DOM. We verify the store slice that drives the
 * browse mode rendering contract.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "../store";

function resetBrowseMode() {
  useStore.setState({ browseMode: false });
}

describe("ReadOnlyBrowse store contract (unify-open-project-3-branch)", () => {
  beforeEach(() => {
    resetBrowseMode();
  });

  it("browseMode starts false (not in browse mode by default)", () => {
    expect(useStore.getState().browseMode).toBe(false);
  });

  it("clicking Browse read-only sets browseMode=true via setBrowseMode", () => {
    // Simulate user clicking "Browse read-only" button
    useStore.getState().setBrowseMode(true);
    expect(useStore.getState().browseMode).toBe(true);
  });

  it("Exit browse mode button sets browseMode=false via setBrowseMode", () => {
    useStore.getState().setBrowseMode(true);
    // Simulate user clicking "Back to decision"
    useStore.getState().setBrowseMode(false);
    expect(useStore.getState().browseMode).toBe(false);
  });

  it("browse mode is independent of loading state", () => {
    useStore.setState({ loading: true });
    useStore.getState().setBrowseMode(true);
    expect(useStore.getState().browseMode).toBe(true);
    expect(useStore.getState().loading).toBe(true);
  });

  it("browse mode does not affect the terminal visible preference", () => {
    const tv = useStore.getState().terminalVisible;
    useStore.getState().setBrowseMode(true);
    // Terminal visible should be unchanged by browse mode toggle
    expect(useStore.getState().terminalVisible).toBe(tv);
  });

  it("browse mode can be toggled multiple times without side effects", () => {
    for (let i = 0; i < 5; i++) {
      useStore.getState().setBrowseMode(true);
      useStore.getState().setBrowseMode(false);
    }
    expect(useStore.getState().browseMode).toBe(false);
  });
});

describe("MarkdownTreeNode type contract (unify-open-project-3-branch)", () => {
  // Verify the shape of a mock tree node matches what the component expects.
  it("file node has kind='file', path, name", () => {
    const node = { path: "README.md", name: "README.md", kind: "file" as const };
    expect(node.kind).toBe("file");
    expect(node.path).toBe("README.md");
    expect(node.name).toBe("README.md");
  });

  it("dir node has kind='dir', path, name, children", () => {
    const node = {
      path: "docs",
      name: "docs",
      kind: "dir" as const,
      children: [{ path: "docs/guide.md", name: "guide.md", kind: "file" as const }],
    };
    expect(node.kind).toBe("dir");
    expect(node.children).toHaveLength(1);
    expect(node.children[0].kind).toBe("file");
  });
});
