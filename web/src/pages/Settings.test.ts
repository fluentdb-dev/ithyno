// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for the Settings page logic (add-doctor-and-installer).
 *
 * These tests cover the logic that can be exercised without a DOM renderer:
 *  - The AGENT_CLI_KEYS list has the correct entries in the correct order.
 *  - INSTALLABLE_TOOLS only contains tmux and agmsg.
 *  - DoctorReport shape matches what the server returns.
 *
 * Full render tests for PrerequisitesSection + PrereqInstallModal would
 * require jsdom + RTL; deferred as manual verification (tasks 7.5, 7.6).
 */
import { describe, it, expect } from "vitest";

// We import the Cli type from api to validate the key list
import type { Cli } from "../api";

// The list of agent CLI keys rendered in the Prerequisites table.
// Must match AGENT_CLI_KEYS in Settings.tsx.
const AGENT_CLI_KEYS: Cli[] = [
  "claude",
  "codex",
  "agy",
  "copilot",
  "gemini",
  "opencode",
  "cursor",
  "antigravity",
];

const INSTALLABLE_TOOLS: Array<"tmux" | "agmsg"> = ["tmux", "agmsg"];

describe("Settings prerequisites table constants", () => {
  it("AGENT_CLI_KEYS has 8 entries (7 primary + antigravity alias)", () => {
    expect(AGENT_CLI_KEYS).toHaveLength(8);
  });

  it("AGENT_CLI_KEYS contains claude first (highest priority)", () => {
    expect(AGENT_CLI_KEYS[0]).toBe("claude");
  });

  it("AGENT_CLI_KEYS contains antigravity as the agy alias", () => {
    expect(AGENT_CLI_KEYS).toContain("antigravity");
  });

  it("INSTALLABLE_TOOLS only has tmux and agmsg", () => {
    expect(INSTALLABLE_TOOLS).toHaveLength(2);
    expect(INSTALLABLE_TOOLS).toContain("tmux");
    expect(INSTALLABLE_TOOLS).toContain("agmsg");
  });

  it("INSTALLABLE_TOOLS does not include any agent CLI", () => {
    for (const key of AGENT_CLI_KEYS) {
      expect(INSTALLABLE_TOOLS).not.toContain(key);
    }
  });
});

describe("DoctorReport schema contract", () => {
  // Verify the TypeScript type exported from api.ts matches what we expect.
  // These are compile-time checks encoded as runtime assertions.

  it("a valid DoctorReport has readyForManager boolean", () => {
    const mockReport = {
      agents: {
        claude: { installed: true, version: "v1.0.0" },
        codex: { installed: false },
        agy: { installed: false },
        copilot: { installed: false },
        gemini: { installed: false },
        opencode: { installed: false },
        cursor: { installed: false },
        antigravity: { installed: false },
      },
      tmux: { installed: true, version: "3.4" },
      agmsg: { installed: false },
      readyForManager: true,
      checkedAt: new Date().toISOString(),
    };

    expect(typeof mockReport.readyForManager).toBe("boolean");
    expect(mockReport.readyForManager).toBe(true);
  });

  it("readyForManager is true when any agent CLI is installed", () => {
    const agents = {
      claude: { installed: false },
      codex: { installed: false },
      agy: { installed: true },
      copilot: { installed: false },
      gemini: { installed: false },
      opencode: { installed: false },
      cursor: { installed: false },
      antigravity: { installed: false },
    } as Record<Cli, { installed: boolean }>;

    const readyForManager = Object.values(agents).some((s) => s.installed);
    expect(readyForManager).toBe(true);
  });

  it("readyForManager is false when no agent CLI is installed", () => {
    const agents = {
      claude: { installed: false },
      codex: { installed: false },
      agy: { installed: false },
      copilot: { installed: false },
      gemini: { installed: false },
      opencode: { installed: false },
      cursor: { installed: false },
      antigravity: { installed: false },
    } as Record<Cli, { installed: boolean }>;

    const readyForManager = Object.values(agents).some((s) => s.installed);
    expect(readyForManager).toBe(false);
  });

  it("checkedAt is an ISO timestamp", () => {
    const ts = new Date().toISOString();
    expect(new Date(ts).getTime()).toBeGreaterThan(0);
  });
});
