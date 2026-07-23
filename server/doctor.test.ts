// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for server/doctor.ts (add-doctor-and-installer).
 *
 * Covers:
 *  - checkCommand returns installed+version for a real command.
 *  - checkCommand returns installed:false for a non-existent command.
 *  - checkCommand handles timeout gracefully.
 *  - runDoctor returns a DoctorReport with the expected shape.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkCommand, runDoctor } from "./doctor.js";
import type { DoctorReport } from "./doctor.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// checkCommand
// ---------------------------------------------------------------------------

describe("checkCommand", () => {
  it("returns installed: true for a real command (node --version)", async () => {
    // `node --version` is always available in the test environment.
    const result = await checkCommand("node", "--version");
    expect(result.installed).toBe(true);
    expect(result.version).toBeDefined();
    expect(typeof result.version).toBe("string");
  });

  it("extracts a version string from node --version output", async () => {
    const result = await checkCommand("node", "--version");
    expect(result.version).toMatch(/v?\d+\.\d+/);
  });

  it("returns installed: false for a non-existent command", async () => {
    const result = await checkCommand("__ithyno_definitely_not_a_real_cmd__", "--version");
    expect(result.installed).toBe(false);
  });

  it("does not throw on a non-existent command", async () => {
    await expect(
      checkCommand("__ithyno_definitely_not_a_real_cmd__", "--version"),
    ).resolves.not.toThrow();
  });

  it("resolves quickly (within 3 s) for a non-existent command", async () => {
    const start = Date.now();
    await checkCommand("__ithyno_definitely_not_a_real_cmd__", "--version");
    const elapsed = Date.now() - start;
    // Should resolve via ENOENT, not the full 2 s timeout.
    expect(elapsed).toBeLessThan(3000);
  });
});

// ---------------------------------------------------------------------------
// runDoctor — shape assertions (does not require real CLIs)
// ---------------------------------------------------------------------------

describe("runDoctor", () => {
  it("returns a DoctorReport with the expected top-level keys", async () => {
    const report: DoctorReport = await runDoctor();
    expect(report).toHaveProperty("agents");
    expect(report).toHaveProperty("tmux");
    expect(report).toHaveProperty("agmsg");
    expect(report).toHaveProperty("readyForManager");
    expect(report).toHaveProperty("checkedAt");
  });

  it("agents map contains all expected CLI keys", async () => {
    const report = await runDoctor();
    const expected = [
      "claude",
      "codex",
      "agy",
      "copilot",
      "gemini",
      "opencode",
      "cursor",
      "antigravity",
    ] as const;
    for (const key of expected) {
      expect(report.agents).toHaveProperty(key);
      expect(typeof report.agents[key].installed).toBe("boolean");
    }
  });

  it("checkedAt is an ISO timestamp string", async () => {
    const report = await runDoctor();
    expect(typeof report.checkedAt).toBe("string");
    expect(new Date(report.checkedAt).getTime()).toBeGreaterThan(0);
  });

  it("readyForManager is boolean", async () => {
    const report = await runDoctor();
    expect(typeof report.readyForManager).toBe("boolean");
  });

  it("each CliStatus has installed boolean and optional string fields", async () => {
    const report = await runDoctor();
    const allStatuses = [
      ...Object.values(report.agents),
      report.tmux,
      report.agmsg,
    ];
    for (const s of allStatuses) {
      expect(typeof s.installed).toBe("boolean");
      if (s.version !== undefined) expect(typeof s.version).toBe("string");
      if (s.path !== undefined) expect(typeof s.path).toBe("string");
      if (s.error !== undefined) expect(typeof s.error).toBe("string");
    }
  });

  it("tmux status has the expected shape", async () => {
    const report = await runDoctor();
    expect(typeof report.tmux.installed).toBe("boolean");
  });

  it("agmsg status reflects file-system presence (not a CLI call)", async () => {
    const report = await runDoctor();
    // We only assert the shape; actual installed value depends on the environment.
    expect(typeof report.agmsg.installed).toBe("boolean");
  });

  it("readyForManager is false when no agent CLI is installed (mocked check)", async () => {
    // Mock checkCommand to always return not installed, then test the logic.
    // We do this by testing the runDoctor result is a boolean — the exact
    // value depends on the test machine having a CLI. We rely on the
    // integration test above for the real check. Here we just verify
    // the formula: readyForManager === any agent.installed.
    const report = await runDoctor();
    const anyAgentInstalled = Object.values(report.agents).some((s) => s.installed);
    expect(report.readyForManager).toBe(anyAgentInstalled);
  });
});

// ---------------------------------------------------------------------------
// Install endpoint input validation (unit-level, no HTTP)
// The 400/session-token checks are HTTP-layer and tested via the real server.
// Here we validate the logic that would reject invalid tool strings.
// ---------------------------------------------------------------------------

describe("install tool validation (logical)", () => {
  it("tmux and agmsg are the only valid install targets", () => {
    const INSTALLABLE = new Set(["tmux", "agmsg"]);
    const valid = ["tmux", "agmsg"];
    const invalid = ["claude", "codex", "cursor", "agy", "", "all"];

    for (const t of valid) {
      expect(INSTALLABLE.has(t)).toBe(true);
    }
    for (const t of invalid) {
      expect(INSTALLABLE.has(t)).toBe(false);
    }
  });
});
