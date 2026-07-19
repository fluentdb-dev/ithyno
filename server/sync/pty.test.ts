// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../agents/registry.js";
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
  it("null registry + no env → fallback is fresh `claude` (no --continue)", () => {
    // pty-startup-default-fresh-session: was `claude --continue`, now
    // `claude` so freshly-scaffolded projects don't hit "No conversation
    // found to continue" on first PTY open.
    expect(ptyStartup(null)).toEqual({ startup: "claude" });
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
