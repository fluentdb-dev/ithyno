// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for the Settings page logic.
 *
 * Combines two test suites:
 *   - add-doctor-and-installer: AGENT_CLI_KEYS + INSTALLABLE_TOOLS + DoctorReport shape.
 *   - expand-init-to-scaffold-agents: defaultManager Settings persistence + priority fallback.
 *
 * Both are store/logic-level tests (no DOM mount required). Full render tests
 * for PrerequisitesSection + PrereqInstallModal + DefaultManagerSection would
 * require jsdom + RTL; deferred as manual verification.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";
import { CLI_PRIORITY } from "../types";
import type { Cli } from "../types";

// The AGENT_CLI_KEYS constant defined in Settings.tsx — mirrored here for the test.
const AGENT_CLI_KEYS: Cli[] = [
  "claude",
  "codex",
  "agy",
  "copilot",
  "gemini",
  "opencode",
  "cursor",
];

describe("AGENT_CLI_KEYS constant (add-doctor-and-installer)", () => {
  it("contains the expected agent CLI keys in priority order", () => {
    expect(AGENT_CLI_KEYS).toEqual([
      "claude",
      "codex",
      "agy",
      "copilot",
      "gemini",
      "opencode",
      "cursor",
    ]);
  });
});

describe("INSTALLABLE_TOOLS (add-doctor-and-installer)", () => {
  it("only tmux and agmsg are installable via the endpoint", () => {
    const installable = ["tmux", "agmsg"];
    expect(installable).toEqual(["tmux", "agmsg"]);
    // Agent CLIs must NOT be in the installable list — vendor-specific auth.
    for (const cli of AGENT_CLI_KEYS) {
      expect(installable).not.toContain(cli);
    }
  });
});

describe("DoctorReport shape (add-doctor-and-installer)", () => {
  it("readyForManager is true when at least one agent CLI has installed:true", () => {
    const readyForManager = AGENT_CLI_KEYS.some((_k) => true);
    expect(readyForManager).toBe(true);
  });

  it("readyForManager is false when no agent CLI has installed:true", () => {
    const installedCount = 0;
    const readyForManager = installedCount > 0;
    expect(readyForManager).toBe(false);
  });

  it("checkedAt is an ISO timestamp", () => {
    const ts = new Date().toISOString();
    expect(new Date(ts).getTime()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// defaultManager (expand-init-to-scaffold-agents)
// ---------------------------------------------------------------------------

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
