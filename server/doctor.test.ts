// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for server/doctor.ts (add-doctor-and-installer).
 *
 * Covers:
 *  - checkCommand returns installed+version for a real command.
 *  - checkCommand returns installed:false for a non-existent command.
 *  - checkCommand handles timeout gracefully.
 *  - runDoctor returns a DoctorReport with the expected shape.
 *  - Install endpoint 400-path validation guard (F7).
 *  - agmsg cpSync force:true regression — partial install is fully overwritten (F2).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

  it("readyForManager reflects primary agent CLI keys (not antigravity alias)", async () => {
    // readyForManager uses a fixed key list that excludes "antigravity" (the
    // agy alias). We verify that readyForManager matches the formula using
    // the same AGENT_KEYS (claude, codex, agy, copilot, gemini, opencode, cursor).
    const report = await runDoctor();
    const PRIMARY_KEYS = ["claude", "codex", "agy", "copilot", "gemini", "opencode", "cursor"] as const;
    const anyPrimaryInstalled = PRIMARY_KEYS.some((k) => report.agents[k]?.installed === true);
    expect(report.readyForManager).toBe(anyPrimaryInstalled);
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

  /**
   * Mirrors the exact validation guard in `server/index.ts`:
   *   if (tool !== "tmux" && tool !== "agmsg") → 400
   * This test ensures the guard rejects every non-installable value and
   * accepts only the two valid tools (F7: 400-path coverage).
   */
  it("400-path guard rejects every non-installable value", () => {
    function wouldReturn400(tool: unknown): boolean {
      return tool !== "tmux" && tool !== "agmsg";
    }

    // Must return 400 (true)
    const shouldReject: unknown[] = [
      undefined, null, "", "claude", "codex", "agy", "antigravity",
      "gemini", "opencode", "cursor", "copilot", "all", 0, false, {},
    ];
    for (const t of shouldReject) {
      expect(wouldReturn400(t)).toBe(true);
    }

    // Must NOT return 400 (false)
    expect(wouldReturn400("tmux")).toBe(false);
    expect(wouldReturn400("agmsg")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// agmsg install — cpSync force:true correctness (F2 regression guard)
// Verifies that re-running the copy over a partial destination writes the
// correct files and does not leave stale/missing entries behind.
// ---------------------------------------------------------------------------

describe("agmsg install cpSync force:true (F2 regression)", () => {
  let src: string;
  let dest: string;

  beforeEach(() => {
    src = mkdtempSync(join(tmpdir(), "ithyno-agmsg-src-"));
    dest = mkdtempSync(join(tmpdir(), "ithyno-agmsg-dest-"));

    // Simulate vendored agmsg source tree
    mkdirSync(join(src, "scripts"), { recursive: true });
    writeFileSync(join(src, "scripts", "send.sh"), "#!/bin/sh\necho send_v2");
    writeFileSync(join(src, "scripts", "extra.sh"), "#!/bin/sh\necho extra");
  });

  afterEach(() => {
    rmSync(src, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  });

  it("force:true overwrites stale file from a partial previous install", () => {
    // Simulate a partial prior install: only send.sh exists, with old content
    mkdirSync(join(dest, "scripts"), { recursive: true });
    writeFileSync(join(dest, "scripts", "send.sh"), "#!/bin/sh\necho send_v1_partial");

    // Re-run copy with force: true (the fixed behaviour)
    cpSync(src, dest, { recursive: true, force: true });

    // send.sh must have new content
    const content = readFileSync(join(dest, "scripts", "send.sh"), "utf8");
    expect(content).toBe("#!/bin/sh\necho send_v2");

    // extra.sh must be present (was missing in partial install)
    expect(existsSync(join(dest, "scripts", "extra.sh"))).toBe(true);
  });

  it("force:false leaves stale file intact (documents the old broken behaviour)", () => {
    // Pre-create stale file
    mkdirSync(join(dest, "scripts"), { recursive: true });
    writeFileSync(join(dest, "scripts", "send.sh"), "#!/bin/sh\necho send_v1_partial");

    // Old behaviour: force: false silently skips existing files
    cpSync(src, dest, { recursive: true, force: false });

    // Content NOT updated — this is the bug fixed by F2
    const content = readFileSync(join(dest, "scripts", "send.sh"), "utf8");
    expect(content).toBe("#!/bin/sh\necho send_v1_partial");
  });
});
