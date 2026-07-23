// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Settings page — defaultManager preference tests
 * (expand-init-to-scaffold-agents).
 *
 * Store-level unit tests. No DOM mount needed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";
import { CLI_PRIORITY } from "../types";
import type { Cli } from "../types";

// The localStorage key must match the constant in store.ts.
const DEFAULT_MANAGER_KEY = "ithyno.defaultManager";

function resetStore() {
  useStore.setState({ defaultManager: null });
  try {
    localStorage.removeItem(DEFAULT_MANAGER_KEY);
  } catch {
    /* jsdom may not be available in node environment */
  }
}

describe("defaultManager Settings persistence (expand-init-to-scaffold-agents)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("store initializes defaultManager to null when localStorage is empty", () => {
    // In node environment localStorage is not available, so readDefaultManager
    // returns null. Confirm the store slice starts as null.
    expect(useStore.getState().defaultManager).toBeNull();
  });

  it("setDefaultManager updates the store slice", () => {
    useStore.getState().setDefaultManager("claude");
    expect(useStore.getState().defaultManager).toBe("claude");
  });

  it("setDefaultManager overwrites a previously set value", () => {
    useStore.getState().setDefaultManager("claude");
    useStore.getState().setDefaultManager("codex");
    expect(useStore.getState().defaultManager).toBe("codex");
  });

  it("setDefaultManager accepts all valid CLI identifiers", () => {
    for (const cli of CLI_PRIORITY) {
      useStore.getState().setDefaultManager(cli as Cli);
      expect(useStore.getState().defaultManager).toBe(cli);
    }
  });

  it("setting defaultManager does not affect other store slices", () => {
    const before = useStore.getState().browseMode;
    useStore.getState().setDefaultManager("gemini");
    expect(useStore.getState().browseMode).toBe(before);
  });
});

describe("defaultManager priority fallback (expand-init-to-scaffold-agents)", () => {
  beforeEach(() => {
    resetStore();
  });

  /**
   * Simulate the priority-fallback logic used by InitDialog and
   * DefaultManagerSection when defaultManager is null.
   *
   * Logic: defaultManager if in installed list, else installed[0].
   */
  function resolvePriority(defaultMgr: Cli | null, installed: Cli[]): Cli | null {
    if (defaultMgr && installed.includes(defaultMgr)) return defaultMgr;
    return installed[0] ?? null;
  }

  it("resolves to claude when defaultManager is null and claude is first installed", () => {
    const installed: Cli[] = ["claude", "codex"];
    expect(resolvePriority(null, installed)).toBe("claude");
  });

  it("resolves to codex when claude is absent and codex is the first installed", () => {
    const installed: Cli[] = ["codex"];
    expect(resolvePriority(null, installed)).toBe("codex");
  });

  it("resolves to stored defaultManager when it is in the installed list", () => {
    const installed: Cli[] = ["claude", "codex"];
    useStore.getState().setDefaultManager("codex");
    const stored = useStore.getState().defaultManager;
    expect(resolvePriority(stored, installed)).toBe("codex");
  });

  it("falls back to priority order when stored defaultManager is not installed", () => {
    const installed: Cli[] = ["claude"];
    useStore.getState().setDefaultManager("gemini");
    const stored = useStore.getState().defaultManager;
    expect(resolvePriority(stored, installed)).toBe("claude");
  });

  it("resolves to null when no CLI is installed", () => {
    const installed: Cli[] = [];
    expect(resolvePriority(null, installed)).toBeNull();
  });
});
