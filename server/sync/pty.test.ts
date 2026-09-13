// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import Fastify from "fastify";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AgentRegistry } from "../agents/registry.js";
import { hasAgentsYaml } from "../agents/registry.js";
import * as ptyModule from "./pty.js";
import {
  _setTmuxCacheForTest,
  attachPtyToSocket,
  ptyStartup,
  resolveManagerStartup,
  resolvePtySessionKey,
  parsePtyConnectionIdentity,
  terminateAllLivePtys,
  activeTerminalCount,
  tmuxSessionName,
  buildManagerPtyEnv,
  setPtyIdleTtlForTest,
} from "./pty.js";
import { registerProductionShutdown } from "../production-shutdown.js";

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
  ptyModule._resetPtyRuntimeForTest();
  dir = mkdtempSync(join(tmpdir(), "ithyno-pty-test-"));
  savedEnv = process.env.ITHYNO_TERMINAL_STARTUP;
  savedSession = process.env.ITHYNO_TMUX_SESSION;
  delete process.env.ITHYNO_TERMINAL_STARTUP;
  delete process.env.ITHYNO_TMUX_SESSION;
  _setTmuxCacheForTest(null);
});

afterEach(() => {
  ptyModule._resetPtyRuntimeForTest();
  setPtyIdleTtlForTest(null);
  vi.restoreAllMocks();
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

function makeFakeWs() {
  const handlers = new Map<string, Array<(...args: any[]) => void>>();
  const ws: any = {
    readyState: 1,
    sent: [] as any[],
    close: vi.fn((code?: number, reason?: string) => {
      ws.readyState = 3;
      for (const handler of handlers.get("close") ?? []) handler(code, reason);
    }),
    send: vi.fn((payload: any) => {
      ws.sent.push(payload);
    }),
    on: (event: string, handler: (...args: any[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return ws;
    },
    emitMessage: (payload: any) => {
      for (const handler of handlers.get("message") ?? []) handler(payload);
    },
    emitClose: () => {
      for (const handler of handlers.get("close") ?? []) handler(1000, "close");
    },
  };
  return ws;
}

function makeFakePty() {
  const rx = new EventEmitter();
  const term: any = {
    kill: vi.fn(() => {
      term.killed = true;
      rx.emit("exit");
    }),
    write: vi.fn((data: string) => {
      term.writes.push(data);
      return true;
    }),
    resize: vi.fn((cols: number, rows: number) => {
      term.resizeCalls.push({ cols, rows });
    }),
    writes: [] as string[],
    resizeCalls: [] as Array<{ cols: number; rows: number }>,
    killed: false,
    onData: (fn: (data: string) => void) => {
      term.dataHandler = fn;
    },
    emitData: (data: string) => {
      if (term.dataHandler) term.dataHandler(data);
    },
    onExit: (fn: () => void) => {
      rx.on("exit", fn);
    },
  };
  return term;
}

describe("ptyStartup — priority chain", () => {
  it("null registry + no env + no projectRoot → fallback is fresh `claude`", () => {
    // pty-startup-uses-project-session-id: without a projectRoot,
    // there's nowhere to persist a session id, so we fall through to
    // plain `claude` (fresh). Same as pre-2026-07-19 for tests /
    // callers that don't yet pass a projectRoot.
    expect(ptyStartup(null)).toEqual({ startup: "claude" });
  });

  it("null registry + no env + projectRoot without any session file → mints UUID and emits --session-id at .ithyno/session-claude", async () => {
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
      // First mint lands in the new per-CLI location.
      const claudePath = pathJoin(proj, ".ithyno", "session-claude");
      expect(existsSync(claudePath)).toBe(true);
      const stored = readFileSync(claudePath, "utf8").trim();
      expect(result.startup).toContain(stored);
      // Legacy generic location is NOT written on fresh launch.
      expect(existsSync(pathJoin(proj, ".ithyno", "session-id"))).toBe(false);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("null registry + no env + legacy .ithyno/session-id (only) → --resume (fallback read for existing dev envs)", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
      "node:fs"
    );
    const { tmpdir: osTmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const proj = mkdtempSync(pathJoin(osTmpdir(), "pty-session-legacy-"));
    const uuid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    try {
      mkdirSync(pathJoin(proj, ".ithyno"), { recursive: true });
      writeFileSync(pathJoin(proj, ".ithyno", "session-id"), `${uuid}\n`);
      const result = ptyStartup(null, proj);
      expect(result.startup).toBe(`claude --resume ${uuid}`);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("null registry + no env + projectRoot WITH .ithyno/session-claude → --resume", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
      "node:fs"
    );
    const { tmpdir: osTmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const proj = mkdtempSync(pathJoin(osTmpdir(), "pty-session-resume-"));
    const uuid = "12345678-1234-1234-1234-123456789012";
    try {
      mkdirSync(pathJoin(proj, ".ithyno"), { recursive: true });
      writeFileSync(pathJoin(proj, ".ithyno", "session-claude"), `${uuid}\n`);
      const result = ptyStartup(null, proj);
      expect(result.startup).toBe(`claude --resume ${uuid}`);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("empty session-claude file → mints fresh", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
      "node:fs"
    );
    const { tmpdir: osTmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const proj = mkdtempSync(pathJoin(osTmpdir(), "pty-session-empty-"));
    try {
      mkdirSync(pathJoin(proj, ".ithyno"), { recursive: true });
      writeFileSync(pathJoin(proj, ".ithyno", "session-claude"), "   \n");
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

// ---- per-CLI Manager startup dispatch (this-merge Manager fix) ----
describe("Manager startup — per-CLI dispatch (empty args → smart resolver)", () => {
  it("resolveManagerStartup(claude, projectRoot) mints session-id on first launch", async () => {
    const { existsSync, mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir: osTmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const proj = mkdtempSync(pathJoin(osTmpdir(), "mgr-claude-fresh-"));
    try {
      const line = resolveManagerStartup("claude", proj);
      expect(line).toMatch(/^claude --session-id [0-9a-f-]{36}$/);
      expect(existsSync(pathJoin(proj, ".ithyno", "session-claude"))).toBe(true);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("resolveManagerStartup(codex, projectRoot) → plain 'codex' (no strategy yet)", () => {
    const line = resolveManagerStartup("codex", "/nowhere");
    expect(line).toBe("codex");
  });

  it("resolveManagerStartup(agy, undefined) → plain 'agy' (no strategy, no projectRoot)", () => {
    expect(resolveManagerStartup("agy", undefined)).toBe("agy");
  });

  it("resolveManagerStartup(claude, undefined) → plain 'claude' (no projectRoot for session file)", () => {
    expect(resolveManagerStartup("claude", undefined)).toBe("claude");
  });

  it("ptyStartup with manager 'claude' + empty args uses smart session dispatch (NOT --continue)", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    roles: [manager]
    mode: live-shell
    command: claude
    args: []
`,
    );
    const reg = new AgentRegistry(dir);
    await reg.load();
    const line = ptyStartup(reg, dir).startup;
    // Must NOT be the broken template default; must be a session-id line.
    expect(line).not.toContain("--continue");
    expect(line).toMatch(/^claude --session-id [0-9a-f-]{36}$/);
  });

  it("ptyStartup with manager 'codex' + empty args → plain 'codex' (safe first-launch default)", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    roles: [manager]
    mode: live-shell
    command: codex
    args: []
`,
    );
    const reg = new AgentRegistry(dir);
    await reg.load();
    const line = ptyStartup(reg, dir).startup;
    expect(line).toBe("codex");
    // Critically: no --continue leak into a CLI that doesn't support it.
    expect(line).not.toContain("--continue");
  });

  it("ptyStartup honors explicit args (backward compat — smart dispatch is opt-in via empty args)", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    roles: [manager]
    mode: live-shell
    command: claude
    args: ['--dangerously-skip-permissions']
`,
    );
    const reg = new AgentRegistry(dir);
    await reg.load();
    const line = ptyStartup(reg, dir).startup;
    expect(line).toBe("claude --dangerously-skip-permissions");
  });
});

describe("buildManagerPtyEnv", () => {
  it("uses the server's active port/token when explicit values are present", () => {
    const env = buildManagerPtyEnv(57703, "abc123");
    expect(env.ITHYNO_PORT).toBe("57703");
    expect(env.ITHYNO_BASE).toBe("http://localhost:57703");
    expect(env.ITHYNO_SESSION_TOKEN).toBe("abc123");
  });

  it("falls back to the default port only when no explicit port was supplied", () => {
    const env = buildManagerPtyEnv(undefined, "abc123");
    expect(env.ITHYNO_PORT).toBe("4321");
    expect(env.ITHYNO_BASE).toBe("http://localhost:4321");
  });

  it("removes inherited launcher tokens before handing the env to the Manager PTY", () => {
    process.env.ITHYNO_LAUNCHER_SESSION_TOKEN = "stale-token";
    const env = buildManagerPtyEnv(57703, "abc123");
    expect(env.ITHYNO_LAUNCHER_SESSION_TOKEN).toBeUndefined();
    expect(env.ITHYNO_SESSION_TOKEN).toBe("abc123");
  });
  it("does not inherit host harness color suppression into the embedded xterm", async () => {
    const previousNoColor = process.env.NO_COLOR;
    const previousColorTerm = process.env.COLORTERM;
    try {
      process.env.NO_COLOR = "1";
      process.env.COLORTERM = "";
      const env = buildManagerPtyEnv(57703, "abc123");
      expect(env.NO_COLOR).toBeUndefined();
      expect(env.TERM).toBe("xterm-256color");
      expect(env.COLORTERM).toBe("truecolor");
    } finally {
      if (previousNoColor === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = previousNoColor;
      if (previousColorTerm === undefined) delete process.env.COLORTERM;
      else process.env.COLORTERM = previousColorTerm;
    }
  });

});

function expectedTmuxStartup(session: string, command: string): string {
  return `(tmux show-options -gv update-environment 2>/dev/null | grep -qw ITHYNO_SESSION_TOKEN || tmux set-option -ag update-environment ' ITHYNO_PORT ITHYNO_BASE ITHYNO_SESSION_TOKEN' 2>/dev/null || true); exec tmux new-session -A -s ${session} -e ITHYNO_PORT="$ITHYNO_PORT" -e ITHYNO_BASE="$ITHYNO_BASE" -e ITHYNO_SESSION_TOKEN="$ITHYNO_SESSION_TOKEN" -- ${command}`;
}

function expectedWinTmuxStartup(session: string, command: string): string {
  return `tmux new-session -A -s ${session} -e ITHYNO_PORT=$env:ITHYNO_PORT -e ITHYNO_BASE=$env:ITHYNO_BASE -e ITHYNO_SESSION_TOKEN=$env:ITHYNO_SESSION_TOKEN -- ${command}`;
}

/** Stub process.platform for the duration of a describe block. */
function usePlatform(platform: string): void {
  let saved: PropertyDescriptor | undefined;
  beforeEach(() => {
    saved = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  });
  afterEach(() => {
    if (saved) Object.defineProperty(process, 'platform', saved);
  });
}

describe("ptyStartup — tmux wrap (wrap-embedded-pty-in-tmux)", () => {
  usePlatform('linux');
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
      startup: expectedTmuxStartup("ithyno", "claude --continue"),
    });
  });

  it("passes the authoritative dashboard identity into the tmux session environment", async () => {
    _setTmuxCacheForTest(true);
    const reg = await loadWith(
      `tmux: true
agents:
  - name: primary
    role: manager
    command: codex
`,
    );
    const startup = ptyStartup(reg).startup;
    expect(startup).toContain('update-environment');
    expect(startup).toContain('ITHYNO_PORT ITHYNO_BASE ITHYNO_SESSION_TOKEN');
    expect(startup).toContain('-e ITHYNO_PORT="$ITHYNO_PORT"');
    expect(startup).toContain('-e ITHYNO_BASE="$ITHYNO_BASE"');
    expect(startup).toContain('-e ITHYNO_SESSION_TOKEN="$ITHYNO_SESSION_TOKEN"');
    expect(startup).not.toMatch(/[a-f0-9]{64}/i);
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
    expect(r.startup).toMatch(/tmux is enabled/);
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
      expectedTmuxStartup("proj-a", "claude --continue"),
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
      expectedTmuxStartup("ithyno", "claude --project 'my project'"),
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
      startup: expectedTmuxStartup("ithyno", "claude --continue"),
      initialInput: "/ithy-opsx:dispatch",
    });
  });
});

describe("ptyStartup — tmux toggle independent of agmsg (decouple-tmux-from-agmsg)", () => {
  usePlatform('linux');

  it("tmux: true + no agmsg + tmux available → wraps in tmux", async () => {
    _setTmuxCacheForTest(true);
    const reg = await loadWith(
      `tmux: true
agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
`,
    );
    expect(ptyStartup(reg)).toEqual({
      startup: expectedTmuxStartup("ithyno", "claude --continue"),
    });
  });

  it("tmux: false + agmsg present → still wraps (agmsg implication is unconditional)", async () => {
    _setTmuxCacheForTest(true);
    const reg = await loadWith(
      `tmux: false
agmsg:
  team: alpha
agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
`,
    );
    expect(ptyStartup(reg)).toEqual({
      startup: expectedTmuxStartup("ithyno", "claude --continue"),
    });
  });

  it("tmux: true + tmux missing → fallback banner (same as agmsg's fallback)", async () => {
    _setTmuxCacheForTest(false);
    const reg = await loadWith(
      `tmux: true
agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
`,
    );
    const r = ptyStartup(reg);
    expect(r.startup).toMatch(/^printf '/);
    expect(r.startup).toMatch(/tmux was not found on PATH/);
  });

  it("neither tmux nor agmsg set → direct spawn, no wrap attempted", async () => {
    _setTmuxCacheForTest(false); // tmux missing shouldn't matter — never checked
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
});

// ---- Windows PowerShell-native tmux wrap (fix-tmux-startup-windows) ----
describe("ptyStartup — Windows PowerShell-native tmux wrap", () => {
  usePlatform('win32');

  it("agmsg + tmux available → PowerShell-native tmux new-session with $env:VAR", async () => {
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
      startup: expectedWinTmuxStartup("ithyno", "claude --continue"),
    });
  });

  it("tmux: true → PowerShell-native startup passes $env:ITHYNO_PORT etc", async () => {
    _setTmuxCacheForTest(true);
    const reg = await loadWith(
      `tmux: true
agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
`,
    );
    const { startup } = ptyStartup(reg);
    expect(startup).toContain("$env:ITHYNO_PORT");
    expect(startup).toContain("$env:ITHYNO_BASE");
    expect(startup).toContain("$env:ITHYNO_SESSION_TOKEN");
    expect(startup).not.toContain("2>/dev/null");
    expect(startup).not.toContain("exec tmux");
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

// ---- guard round 2: attachPtyToSocket refuses to spawn PTY without agents.yaml ----
describe("attachPtyToSocket refuses PTY spawn when agents.yaml is absent", () => {
  it("returns { ok: false, reason: 'no-agents-yaml' } when agents.yaml is missing", async () => {
    // No agents.yaml in `dir`. Even a well-formed WebSocket stand-in
    // should be turned away before a PTY process is spawned.
    const fakeWs = {
      send: () => {},
      close: () => {},
      on: () => fakeWs,
    } as unknown as import("ws").WebSocket;
    const result = await attachPtyToSocket(fakeWs, { cwd: dir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-agents-yaml");
  });
});

// ---- terminateAllLivePtys (respawn-manager-pty-on-project-switch) --------
describe("terminateAllLivePtys", () => {
  it("is a no-op when no live PTYs exist", () => {
    // Nothing to assert beyond "does not throw" — the module-level `live`
    // array is private and starts empty in this test process (no
    // attachPtyToSocket has succeeded, since node-pty is unavailable in
    // the test env). This documents the empty-array contract.
    expect(() => terminateAllLivePtys()).not.toThrow();
    expect(activeTerminalCount()).toBe(0);
  });
});

describe("attachPtyToSocket lifecycle", () => {
  it("detaches without killing the PTY on normal socket close", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const term = makeFakePty();
    ptyModule._setPtyForTest({ available: true, module: { spawn: vi.fn(() => term) } as any });

    const ws = makeFakeWs();
    const result = await attachPtyToSocket(ws, { cwd: dir, projectRoot: dir, sessionId: "detached-shell" });
    expect(result.ok).toBe(true);

    ws.emitClose();
    expect(term.kill).not.toHaveBeenCalled();
    expect(activeTerminalCount()).toBe(1);
  });

  it("rejects reattach without a live PTY after restart and only creates fresh when intent=create", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const spawn = vi.fn(() => makeFakePty());
    ptyModule._setPtyForTest({ available: true, module: { spawn } as any });

    const reattach = makeFakeWs();
    const reattachResult = await attachPtyToSocket(reattach, {
      cwd: dir,
      projectRoot: dir,
      sessionId: "persisted-shell",
      intent: "reattach",
    });
    expect(reattachResult.ok).toBe(false);
    expect(spawn).not.toHaveBeenCalled();

    const create = makeFakeWs();
    const createResult = await attachPtyToSocket(create, {
      cwd: dir,
      projectRoot: dir,
      sessionId: "persisted-shell",
      intent: "create",
    });
    expect(createResult.ok).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("rejects reattach when the matching session is missing even if another PTY is still live", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const termA = makeFakePty();
    const termB = makeFakePty();
    const spawn = vi.fn((cmd?: string) => {
      return cmd === "bash" ? termB : termA;
    });
    ptyModule._setPtyForTest({ available: true, module: { spawn } as any });

    const live = makeFakeWs();
    const liveResult = await attachPtyToSocket(live, {
      cwd: dir,
      projectRoot: dir,
      sessionId: "other-live-session",
      intent: "create",
    });
    expect(liveResult.ok).toBe(true);

    const missing = makeFakeWs();
    const missingResult = await attachPtyToSocket(missing, {
      cwd: dir,
      projectRoot: dir,
      sessionId: "missing-session",
      intent: "reattach",
    });
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) expect(missingResult.reason).toBe("session-missing");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("converts a rejected concurrent create lock into a structured failure", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );

    const boom = new Error("pty launch failed");
    const spawn = vi.fn(() => {
      throw boom;
    });
    ptyModule._setPtyForTest({ available: true, module: { spawn } as any });

    const first = makeFakeWs();
    const second = makeFakeWs();
    const [firstResult, secondResult] = await Promise.all([
      attachPtyToSocket(first, { cwd: dir, projectRoot: dir, sessionId: "concurrent-failure" }),
      attachPtyToSocket(second, { cwd: dir, projectRoot: dir, sessionId: "concurrent-failure" }),
    ]);

    expect(firstResult.ok).toBe(false);
    expect(secondResult.ok).toBe(false);
    if (!firstResult.ok) expect(firstResult.reason).toBe("pty launch failed");
    if (!secondResult.ok) expect(secondResult.reason).toBe("pty launch failed");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("reattaches to the same PTY and forwards output to the replacement socket", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const term = makeFakePty();
    const spawn = vi.fn(() => term);
    ptyModule._setPtyForTest({ available: true, module: { spawn } as any });

    const first = makeFakeWs();
    const second = makeFakeWs();

    const firstResult = await attachPtyToSocket(first, { cwd: dir, projectRoot: dir, sessionId: "shell-1" });
    expect(firstResult.ok).toBe(true);

    const secondResult = await attachPtyToSocket(second, { cwd: dir, projectRoot: dir, sessionId: "shell-1" });
    expect(secondResult.ok).toBe(true);

    term.emitData("hello again");
    expect(second.send).toHaveBeenCalled();
    expect(first.send).not.toHaveBeenCalledWith("hello again");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("replays buffered ANSI output when a new xterm socket reattaches", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const term = makeFakePty();
    const spawn = vi.fn(() => term);
    ptyModule._setPtyForTest({ available: true, module: { spawn } as any });

    const first = makeFakeWs();
    const firstResult = await attachPtyToSocket(first, {
      cwd: dir,
      projectRoot: dir,
      sessionId: "ansi-replay-shell",
      intent: "create",
    });
    expect(firstResult.ok).toBe(true);

    const coloredFrame = "\u001b[2J\u001b[31mred status\u001b[0m";
    term.emitData(coloredFrame);
    first.emitClose();

    const second = makeFakeWs();
    const secondResult = await attachPtyToSocket(second, {
      cwd: dir,
      projectRoot: dir,
      sessionId: "ansi-replay-shell",
      intent: "reattach",
    });

    expect(secondResult.ok).toBe(true);
    expect(second.sent).toContain(coloredFrame);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("forwards input and resize after reattach", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const term = makeFakePty();
    ptyModule._setPtyForTest({ available: true, module: { spawn: vi.fn(() => term) } as any });

    const first = makeFakeWs();
    const second = makeFakeWs();
    const firstResult = await attachPtyToSocket(first, { cwd: dir, projectRoot: dir, sessionId: "input-shell" });
    expect(firstResult.ok).toBe(true);

    const secondResult = await attachPtyToSocket(second, { cwd: dir, projectRoot: dir, sessionId: "input-shell" });
    expect(secondResult.ok).toBe(true);

    second.emitMessage(JSON.stringify({ type: "input", data: "echo hi\n" }));
    second.emitMessage(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));

    expect(term.write).toHaveBeenCalledWith("echo hi\n");
    expect(term.resize).toHaveBeenCalledWith(120, 40);
  });

  it("rejects a same-session attach from another project root", async () => {
    const otherRoot = join(tmpdir(), `ithyno-pty-other-${Date.now()}`);
    mkdirSync(otherRoot, { recursive: true });
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    writeFileSync(
      join(otherRoot, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const term = makeFakePty();
    ptyModule._setPtyForTest({ available: true, module: { spawn: vi.fn(() => term) } as any });

    const ws = makeFakeWs();
    const ok = await attachPtyToSocket(ws, { cwd: dir, projectRoot: dir, sessionId: "project-shell" });
    expect(ok.ok).toBe(true);

    const mismatch = makeFakeWs();
    const next = await attachPtyToSocket(mismatch, {
      cwd: otherRoot,
      projectRoot: otherRoot,
      sessionId: "project-shell",
    });
    expect(next.ok).toBe(false);
    if (!next.ok) expect(next.reason).toContain("project mismatch");
    rmSync(otherRoot, { recursive: true, force: true });
  });

  it("kills and removes an idle PTY once the TTL expires", async () => {
    setPtyIdleTtlForTest(5);
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const term = makeFakePty();
    ptyModule._setPtyForTest({ available: true, module: { spawn: vi.fn(() => term) } as any });

    const ws = makeFakeWs();
    const result = await attachPtyToSocket(ws, { cwd: dir, projectRoot: dir, sessionId: "ttl-shell" });
    expect(result.ok).toBe(true);

    ws.emitClose();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(term.kill).toHaveBeenCalledTimes(1);
    expect(activeTerminalCount()).toBe(0);
  });

  it("creates only one PTY for concurrent same-key attaches", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const term = makeFakePty();
    const spawn = vi.fn(() => term);
    ptyModule._setPtyForTest({ available: true, module: { spawn } as any });

    const a = makeFakeWs();
    const b = makeFakeWs();
    const [first, second] = await Promise.all([
      attachPtyToSocket(a, { cwd: dir, projectRoot: dir, sessionId: "concurrent-shell" }),
      attachPtyToSocket(b, { cwd: dir, projectRoot: dir, sessionId: "concurrent-shell" }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(activeTerminalCount()).toBe(1);
  });

  it("handles explicit reload as a terminate-and-restart action and clears the tombstone", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
    );
    const term = makeFakePty();
    ptyModule._setPtyForTest({ available: true, module: { spawn: vi.fn(() => term) } as any });

    const ws = makeFakeWs();
    const attachResult = await attachPtyToSocket(ws, { cwd: dir, projectRoot: dir, sessionId: "reload-shell" });
    expect(attachResult.ok).toBe(true);

    const key = `${resolve(dir)}::reload-shell`;
    ws.emitMessage(JSON.stringify({ type: "restart", reason: "reload", sessionKey: key }));
    expect(term.kill).toHaveBeenCalledTimes(1);
    expect(ws.close).toHaveBeenCalledWith(1000, "reload");
  });
});

describe("server shutdown cleanup", () => {
  it("registers the production close hook without importing the entrypoint", async () => {
    const app = Fastify({ logger: false });
    const spy = vi.fn();

    registerProductionShutdown(app, spy);
    await app.ready();
    await app.close();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("calls terminateAllLivePtys when the Fastify server closes", async () => {
    const app = Fastify({ logger: false });
    const spy = vi.spyOn(ptyModule, "terminateAllLivePtys");
    registerProductionShutdown(app, () => {
      ptyModule.terminateAllLivePtys();
    });

    await app.ready();
    await app.close();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("pty session identity and reconnect semantics", () => {
  beforeEach(() => {
    ptyModule._resetPtyRuntimeForTest();
  });

  afterEach(() => {
    ptyModule._resetPtyRuntimeForTest();
  });

  it("keeps project/session identity stable for reconnects", () => {
    const idA = resolvePtySessionKey("/tmp/project-a", { sessionId: "shell-1" });
    const idB = resolvePtySessionKey("/tmp/project-a", { sessionId: "shell-1" });
    expect(idA).toEqual(idB);
    expect(idA.sessionKey).toContain("/tmp/project-a::shell-1");
  });

  it("parses the reconnect identity from the websocket URL", () => {
    const parsed = parsePtyConnectionIdentity(
      "ws://localhost:4321/pty?projectRoot=/tmp/project-a&sessionId=shell-2",
      "/tmp/project-a",
    );
    expect(parsed.projectRoot).toBe("/tmp/project-a");
    expect(parsed.sessionId).toBe("shell-2");
    expect(parsed.sessionKey).toBe(`${resolve("/tmp/project-a")}::shell-2`);
  });

  it("sends raw client sessionId in session-status messages, not the composite server key", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pty-session-id-test-"));
    try {
      writeFileSync(
        join(tempDir, "agents.yaml"),
        `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
      );
      const term = makeFakePty();
      ptyModule._setPtyForTest({ available: true, module: { spawn: vi.fn(() => term) } as any });

      const ws = makeFakeWs();
      const clientSessionId = "test-shell-123";
      const attachResult = await attachPtyToSocket(ws, {
        cwd: tempDir,
        projectRoot: tempDir,
        sessionId: clientSessionId,
      });
      expect(attachResult.ok).toBe(true);

      // Verify that session-status message contains the raw client sessionId,
      // not the composite server key (which includes the resolved project root)
      expect(ws.sent.length).toBeGreaterThan(0);
      const statusMessage = ws.sent.find((msg: string) => {
        try {
          const parsed = JSON.parse(msg);
          return parsed.type === "session-status";
        } catch {
          return false;
        }
      });
      expect(statusMessage).toBeDefined();
      const parsed = JSON.parse(statusMessage);
      expect(parsed.sessionId).toBe(clientSessionId);
      expect(parsed.sessionId).not.toContain("::");
      expect(parsed.sessionId).not.toContain(tempDir);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ---- terminal replay protocol (prevent query response corruption) --------
describe("terminal replay protocol", () => {
  beforeEach(() => {
    ptyModule._resetPtyRuntimeForTest();
  });

  afterEach(() => {
    ptyModule._resetPtyRuntimeForTest();
  });

  it("sends replay-start and replay-end boundary messages around buffered output", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pty-replay-test-"));
    try {
      writeFileSync(
        join(tempDir, "agents.yaml"),
        `agents:
  - name: manager
    role: manager
    command: claude
    args: []
`,
      );
      const term = makeFakePty();
      const spawn = vi.fn(() => term);
      ptyModule._setPtyForTest({ available: true, module: { spawn } as any });

      // First connection: write some output to the replay buffer
      const first = makeFakeWs();
      const attachFirst = await attachPtyToSocket(first, { cwd: tempDir, projectRoot: tempDir, sessionId: "test-1" });
      expect(attachFirst.ok).toBe(true);

      // Simulate terminal output (including ANSI with control sequences)
      term.emitData("Hello, ");
      term.emitData("\x1b[1;31m");
      term.emitData("world"); // Red text
      term.emitData("\x1b[0m"); // Reset
      term.emitData("\n");

      // Disconnect first socket
      first.close();

      // Second connection: should replay buffered output with boundary messages
      const second = makeFakeWs();
      const attachSecond = await attachPtyToSocket(second, { cwd: tempDir, projectRoot: tempDir, sessionId: "test-1" });
      expect(attachSecond.ok).toBe(true);

      // Verify replay protocol structure in sent messages:
      // 1. session-status "reattached"
      // 2. replay-start boundary
      // 3. buffered ANSI chunks (raw strings, not JSON)
      // 4. replay-end boundary
      // 5. possibly more messages

      expect(second.sent.length).toBeGreaterThan(0);

      const messages = second.sent.map((msg: string) => {
        try {
          return JSON.parse(msg);
        } catch {
          return { type: "raw", data: msg };
        }
      });

      // Find replay-start and replay-end
      const replayStartIdx = messages.findIndex((m: any) => m.type === "replay-start");
      const replayEndIdx = messages.findIndex((m: any) => m.type === "replay-end");

      expect(replayStartIdx).toBeGreaterThanOrEqual(0);
      expect(replayEndIdx).toBeGreaterThan(replayStartIdx);

      // Verify that replay chunks are between start and end
      const replayChunks = messages.slice(replayStartIdx + 1, replayEndIdx);
      expect(replayChunks.length).toBeGreaterThan(0);

      // First replay chunk should contain the initial output
      const firstChunk = replayChunks[0];
      expect(firstChunk.type).toBe("raw");
      expect(firstChunk.data).toContain("Hello");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ---- tmuxSessionName (scope-tmux-session-name-per-project) ---------------
describe("tmuxSessionName", () => {
  it("returns literal `ithyno` when projectRoot is undefined (test-friendly fallback)", () => {
    expect(tmuxSessionName()).toBe("ithyno");
    expect(tmuxSessionName(undefined)).toBe("ithyno");
  });

  it("returns literal `ithyno` when projectRoot is empty (defensive)", () => {
    expect(tmuxSessionName("")).toBe("ithyno");
  });

  it("returns a distinct ithyno-<hash> per project root", () => {
    const a = tmuxSessionName("/path/to/A");
    const b = tmuxSessionName("/path/to/B");
    expect(a).toMatch(/^ithyno-[0-9a-f]{12}$/);
    expect(b).toMatch(/^ithyno-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });

  it("is deterministic for the same input", () => {
    expect(tmuxSessionName("/path/to/A")).toBe(tmuxSessionName("/path/to/A"));
  });
});
