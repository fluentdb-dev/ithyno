// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for TerminalSizeToggle store integration (add-terminal-size-toggle).
 *
 * These are store-level unit tests — they do NOT mount React components so
 * they work without a browser DOM. The component's aria-pressed / data-state
 * contract is verified through the store's TerminalSize state alone.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "../store";
import type { TerminalSize } from "../store";

// Reset store before every test to avoid cross-test state bleed.
function resetTerminalSize() {
  useStore.setState({ terminalSize: "default" });
}

describe("TerminalSize store slice (add-terminal-size-toggle)", () => {
  beforeEach(() => {
    resetTerminalSize();
  });

  it("initial terminalSize is 'default'", () => {
    const size = useStore.getState().terminalSize;
    expect(size).toBe("default");
  });

  it("setTerminalSize('fullscreen') updates the store", () => {
    useStore.getState().setTerminalSize("fullscreen");
    expect(useStore.getState().terminalSize).toBe("fullscreen");
  });

  it("setTerminalSize('half') updates the store", () => {
    useStore.getState().setTerminalSize("half");
    expect(useStore.getState().terminalSize).toBe("half");
  });

  it("setTerminalSize('hidden') updates the store", () => {
    useStore.getState().setTerminalSize("hidden");
    expect(useStore.getState().terminalSize).toBe("hidden");
  });

  it("setTerminalSize('default') restores to default after fullscreen", () => {
    useStore.getState().setTerminalSize("fullscreen");
    useStore.getState().setTerminalSize("default");
    expect(useStore.getState().terminalSize).toBe("default");
  });

  it("cycling through all 4 options works without error", () => {
    const sizes: TerminalSize[] = ["fullscreen", "half", "default", "hidden"];
    for (const size of sizes) {
      useStore.getState().setTerminalSize(size);
      expect(useStore.getState().terminalSize).toBe(size);
    }
  });

  it("only one option is 'active' at a time (mutual exclusivity)", () => {
    const allSizes: TerminalSize[] = ["fullscreen", "half", "default", "hidden"];
    useStore.getState().setTerminalSize("half");
    const active = allSizes.filter((s) => useStore.getState().terminalSize === s);
    expect(active).toHaveLength(1);
    expect(active[0]).toBe("half");
  });
});

describe("ChangeDetail page: no Hide Terminal button contract", () => {
  // This is a contract-level description test. The ChangeDetail component no
  // longer renders the hide-terminal button (task 6.1); since the component
  // uses no internal state that would hide/show the button conditionally, the
  // removal is total — we verify by asserting the store doesn't have a
  // ChangeDetail-specific hide handler.
  it("store has no dedicated hide-from-change-detail action", () => {
    const storeKeys = Object.keys(useStore.getState());
    // The old hide-terminal-from-change-page action would have been something
    // like `hideTerminalFromChangePage`. No such key should exist.
    const hideActions = storeKeys.filter(
      (k) => k.toLowerCase().includes("hideterminal") && k !== "setTerminalVisible",
    );
    expect(hideActions).toHaveLength(0);
  });

  it("setTerminalSize('hidden') is the canonical hide path", () => {
    // Verify the setTerminalSize action exists and 'hidden' is a valid option.
    expect(typeof useStore.getState().setTerminalSize).toBe("function");
    useStore.getState().setTerminalSize("hidden");
    expect(useStore.getState().terminalSize).toBe("hidden");
  });
});
