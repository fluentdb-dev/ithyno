// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../agents/registry.js";
import { hasAgentsYaml } from "../agents/registry.js";
import { _setTmuxCacheForTest, ptyStartup } from "./pty.js";

/**
 * Priority chain for the Terminal panel's PTY startup command
 * (add-manager-agent-config):
 *   1. `registry.managerAgent()` (first `role: manager` entry)
 *   2. `ITHYNO_TERMINAL_STARTUP` env var
 *   3. hardcoded `claude` (fresh session — pty-startup-default-fresh-session)
 */

let dir: string;
let savedEnv: string | undefined;
let savedSession: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-pty-test-"));
  savedEnv = process.env.ITHYNO_TERMINAL_STARTUP;
  savedSession = process.env.ITHYNO_TMUX_SESSION;
  delete process.env.ITHYNO_TERMINAL_STARTUP;
  delete process.env.ITHYNO_TMUX_SESSION;
  _setTmuxCacheForTest(null);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedEnv !== undefined) process.env.ITHYNO_TERMINAL_STARTUP = savedEnv;
  else delete process.env.ITHYNO_TERMINAL_STARTUP;
  if (savedSession !== undefined) process.env.ITHYNO_TMUX_SESSION = savedSession;
  else delete process.env.ITHYNO_TMUX_SESSION;
  _setTmuxCacheForTest(null);
});

async function loadWith(yaml: string): Promise<AgentRegistry> {
  writeFileSync(join(dir, "agents.yaml"), yaml);
  const reg = new AgentRegistry(dir);
  await reg.load();
  return reg;
}

describe("ptyStartup — priority chain", () => {
  it("null registry + no env + no projectRoot → fallback is fresh `claude`", () => {
    // pty-startup-uses-project-session-id: without a projectRoot,
    // there's nowhere to persist a session id, so we fall through to
    // plain `claude` (fresh). Same as pre-2026-07-19 for tests /
    // callers that don't yet pass a projectRoot.
    expect(ptyStartup(null)).toEqual({ startup: "claude" });
  });

  it("null registry + no env + projectRoot without .ithyno/session-id → mints UUID and emits --session-id", async () => {
    const { mkdtempSync, rmSync, existsSync, readFileSync } = await import(
      "node:fs"
    );
    const { tmpdir: osTmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const proj = mkdtempSync(pathJoin(osTmpdir(), "pty-session-fresh-"));
    try {
      const result = ptyStartup(null, proj);
      expect(result.startup).toMatch(
        /^claude --session-id [0-9a-f-]{36}$/,
      );
      // Session-id file was created and contains the same UUID.
      const idPath = pathJoin(proj, ".ithyno", "session-id");
      expect(existsSync(idPath)).toBe(true);
      const stored = readFileSync(idPath, "utf8").trim();
      expect(result.startup).toContain(stored);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("null registry + no env + projectRoot WITH .ithyno/session-id → --resume", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
      "node:fs"
    );
    const { tmpdir: osTmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const proj = mkdtempSync(pathJoin(osTmpdir(), "pty-session-resume-"));
    const uuid = "12345678-1234-1234-1234-123456789012";
    try {
      mkdirSync(pathJoin(proj, ".ithyno"), { recursive: true });
      writeFileSync(pathJoin(proj, ".ithyno", "session-id"), `${uuid}\n`);
      const result = ptyStartup(null, proj);
      expect(result.startup).toBe(`claude --resume ${uuid}`);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("empty session-id file → mints fresh", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
      "node:fs"
    );
    const { tmpdir: osTmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const proj = mkdtempSync(pathJoin(osTmpdir(), "pty-session-empty-"));
    try {
      mkdirSync(pathJoin(proj, ".ithyno"), { recursive: true });
      writeFileSync(pathJoin(proj, ".ithyno", "session-id"), "   \n");
      const result = ptyStartup(null, proj);
      expect(result.startup).toMatch(
        /^claude --session-id [0-9a-f-]{36}$/,
      );
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("null registry + env var → uses env var", () => {
    process.env.ITHYNO_TERMINAL_STARTUP = "aider";
    expect(ptyStartup(null)).toEqual({ startup: "aider" });
  });

  it("null registry + empty-string env var → returns empty startup (raw shell)", () => {
    process.env.ITHYNO_TERMINAL_STARTUP = "";
    expect(ptyStartup(null)).toEqual({ startup: "" });
  });

  it("registry without manager entry → falls through to env var", async () => {
    process.env.ITHYNO_TERMINAL_STARTUP = "codex";
    const reg = await loadWith(
      `agents:
  - name: coder
    command: claude
    args: []
`,
    );
    expect(ptyStartup(reg)).toEqual({ startup: "codex" });
  });

  it("registry with manager entry wins over env var", async () => {
    process.env.ITHYNO_TERMINAL_STARTUP = "aider";
    const reg = await loadWith(
      `agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
`,
    );
    expect(ptyStartup(reg)).toEqual({ startup: "claude --continue" });
  });

  it("passes through initialInput when the manager declares one", async () => {
    const reg = await loadWith(
      `agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
    initialInput: /opsx:manage
`,
    );
    expect(ptyStartup(reg)).toEqual({
      startup: "claude --continue",
      initialInput: "/opsx:manage",
    });
  });

  it("omits initialInput when the manager doesn't declare one", async () => {
    const reg = await loadWith(
      `agents:
  - name: primary
    role: manager
    command: claude
    args: []
`,
    );
    const r = ptyStartup(reg);
    expect(r.startup).toBe("claude");
    expect(r.initialInput).toBeUndefined();
  });

  it("shell-quotes args that contain spaces or special chars", async () => {
    const reg = await loadWith(
      `agents:
  - name: primary
    role: manager
    command: claude
    args: ["--project", "my project"]
`,
    );
    // "my project" contains a space → single-quoted; --project is fine unquoted.
    expect(ptyStartup(reg).startup).toBe("claude --project 'my project'");
  });
});

describe("ptyStartup — tmux wrap (wrap-embedded-pty-in-tmux)", () => {
  it("agmsg absent → direct spawn unchanged (regression lock)", async () => {
    _setTmuxCacheForTest(true); // tmux available but no agmsg → still no wrap
    const reg = await loadWith(
      `agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
`,
    );
    expect(ptyStartup(reg)).toEqual({ startup: "claude --continue" });
  });

  it("agmsg present + tmux available → wraps in tmux new-session -A -s ithyno --", async () => {
    _setTmuxCacheForTest(true);
    const reg = await loadWith(
      `agmsg:
  team: alpha
agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
`,
    );
    expect(ptyStartup(reg)).toEqual({
      startup: "tmux new-session -A -s ithyno -- claude --continue",
    });
  });

  it("agmsg present + tmux missing → fallback banner; initialInput suppressed", async () => {
    _setTmuxCacheForTest(false);
    const reg = await loadWith(
      `agmsg:
  team: alpha
agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
    initialInput: /ithy-opsx:dispatch
`,
    );
    const r = ptyStartup(reg);
    expect(r.startup).toMatch(/^printf '/);
    expect(r.startup).toMatch(/agmsg is configured/);
    expect(r.startup).toMatch(/tmux was not found on PATH/);
    expect(r.startup).toMatch(/brew install tmux/);
    expect(r.initialInput).toBeUndefined();
  });

  it("ITHYNO_TMUX_SESSION env overrides the session name", async () => {
    _setTmuxCacheForTest(true);
    process.env.ITHYNO_TMUX_SESSION = "proj-a";
    const reg = await loadWith(
      `agmsg:
  team: alpha
agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
`,
    );
    expect(ptyStartup(reg).startup).toBe(
      "tmux new-session -A -s proj-a -- claude --continue",
    );
  });

  it("shell-quotes manager args so tmux sees them as separate tokens (agmsg wrap)", async () => {
    _setTmuxCacheForTest(true);
    const reg = await loadWith(
      `agmsg:
  team: alpha
agents:
  - name: primary
    role: manager
    command: claude
    args: ["--project", "my project"]
`,
    );
    expect(ptyStartup(reg).startup).toBe(
      "tmux new-session -A -s ithyno -- claude --project 'my project'",
    );
  });

  it("passes initialInput through when agmsg wraps (tmux forwards stdin to pane 0)", async () => {
    _setTmuxCacheForTest(true);
    const reg = await loadWith(
      `agmsg:
  team: alpha
agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
    initialInput: /ithy-opsx:dispatch
`,
    );
    expect(ptyStartup(reg)).toEqual({
      startup: "tmux new-session -A -s ithyno -- claude --continue",
      initialInput: "/ithy-opsx:dispatch",
    });
  });
});

// ---- guard: hasAgentsYaml gates the auto-launch injection (guard-terminal-autolaunch-on-agents-yaml) ----
describe("auto-launch guard: hasAgentsYaml + ptyStartup composition", () => {
  it("WITHOUT agents.yaml: hasAgentsYaml returns false, ptyStartup still produces a non-empty startup (injection skipped by caller)", async () => {
    // Simulate a project root WITHOUT agents.yaml.
    // hasAgentsYaml() must return false so the caller (attachPtyToSocket) knows
    // to skip the injection. ptyStartup() is still called and returns a startup
    // string (the session-id fallback) — the caller discards it.
    const projectRoot = dir; // dir has no agents.yaml
    expect(hasAgentsYaml(projectRoot)).toBe(false);
    // ptyStartup still resolves a startup (e.g. mints a session-id) — the
    // guard check in attachPtyToSocket suppresses the write, not ptyStartup.
    const { startup } = ptyStartup(null, projectRoot);
    expect(startup.length).toBeGreaterThan(0);
  });

  it("WITH agents.yaml: hasAgentsYaml returns true, ptyStartup produces startup for injection", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: [--continue]
`,
    );
    const reg = new AgentRegistry(dir);
    await reg.load();

    expect(hasAgentsYaml(dir)).toBe(true);
    const { startup } = ptyStartup(reg, dir);
    expect(startup).toBe("claude --continue");
  });
});
