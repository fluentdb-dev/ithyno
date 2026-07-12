// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../agents/registry.js";
import { ptyStartup } from "./pty.js";

/**
 * Priority chain for the Terminal panel's PTY startup command
 * (add-manager-agent-config):
 *   1. `registry.managerAgent()` (first `role: manager` entry)
 *   2. `ITHYNO_TERMINAL_STARTUP` env var
 *   3. hardcoded `claude --continue`
 */

let dir: string;
let savedEnv: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-pty-test-"));
  savedEnv = process.env.ITHYNO_TERMINAL_STARTUP;
  delete process.env.ITHYNO_TERMINAL_STARTUP;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedEnv !== undefined) process.env.ITHYNO_TERMINAL_STARTUP = savedEnv;
  else delete process.env.ITHYNO_TERMINAL_STARTUP;
});

async function loadWith(yaml: string): Promise<AgentRegistry> {
  writeFileSync(join(dir, "agents.yaml"), yaml);
  const reg = new AgentRegistry(dir);
  await reg.load();
  return reg;
}

describe("ptyStartup — priority chain", () => {
  it("null registry + no env → hardcoded default", () => {
    expect(ptyStartup(null)).toEqual({ startup: "claude --continue" });
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
