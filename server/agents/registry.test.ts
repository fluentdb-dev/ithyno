// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "./registry.js";

/**
 * Tests for the role / specialties / concurrency metadata fields added by
 * `add-agent-role-field`. The fields are Phase-1 metadata only — validated
 * and defaulted at load, not consumed by the runner.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-registry-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function loadWith(agentsYaml: string): Promise<AgentRegistry> {
  writeFileSync(join(dir, "agents.yaml"), agentsYaml);
  const reg = new AgentRegistry(dir);
  await reg.load();
  return reg;
}

describe("AgentRegistry role / specialties / concurrency", () => {
  it("legacy file (no new fields) loads with defaults applied", async () => {
    const reg = await loadWith(
      `agents:
  - name: claude
    command: claude
    args: ["/opsx:apply", "\${change_id}"]
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents).toHaveLength(1);
    expect(cfg.agents[0].role).toBe("coder");
    expect(cfg.agents[0].specialties).toEqual([]);
    expect(cfg.agents[0].concurrency).toBe(1);
  });

  it("fully specified agent round-trips through the loader", async () => {
    const reg = await loadWith(
      `agents:
  - name: reviewer-web
    command: claude
    args: []
    role: reviewer
    specialties: [area/web, feature/ui]
    concurrency: 2
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    const a = cfg.agents[0];
    expect(a.role).toBe("reviewer");
    expect(a.specialties).toEqual(["area/web", "feature/ui"]);
    expect(a.concurrency).toBe(2);
  });

  it("partially specified agent (only role) gets defaults for the rest", async () => {
    const reg = await loadWith(
      `agents:
  - name: proposer
    command: claude
    args: []
    role: proposer
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    const a = cfg.agents[0];
    expect(a.role).toBe("proposer");
    expect(a.specialties).toEqual([]);
    expect(a.concurrency).toBe(1);
  });

  it("arbitrary role strings are accepted (open set)", async () => {
    const reg = await loadWith(
      `agents:
  - name: archivist-agent
    command: claude
    args: []
    role: archivist
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].role).toBe("archivist");
  });

  it("rejects non-integer concurrency", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    command: claude
    args: []
    concurrency: 1.5
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/agents\[0\]\.concurrency/);
    expect(cfg.error).toMatch(/integer/);
  });

  it("rejects zero concurrency", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    command: claude
    args: []
    concurrency: 0
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/agents\[0\]\.concurrency/);
  });

  it("rejects negative concurrency", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    command: claude
    args: []
    concurrency: -1
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/agents\[0\]\.concurrency/);
  });

  it("rejects non-string specialty element", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    command: claude
    args: []
    specialties: [area/web, 42]
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/agents\[0\]\.specialties/);
  });

  it("rejects empty-string role", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    command: claude
    args: []
    role: ""
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/agents\[0\]\.role/);
  });

  it("rejects non-array specialties", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    command: claude
    args: []
    specialties: area/web
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/agents\[0\]\.specialties/);
  });

  it("dedicated defaults to true when omitted", async () => {
    const reg = await loadWith(
      `agents:
  - name: legacy
    command: claude
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].dedicated).toBe(true);
  });

  it("dedicated: false is accepted", async () => {
    const reg = await loadWith(
      `agents:
  - name: pool-agent
    command: claude
    args: []
    dedicated: false
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].dedicated).toBe(false);
  });

  it("rejects non-boolean dedicated", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    command: claude
    args: []
    dedicated: "yes"
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/agents\[0\]\.dedicated/);
  });

  it("worktreePool defaults are applied when block omitted", async () => {
    const reg = await loadWith(
      `agents:
  - name: any
    command: claude
    args: []
`,
    );
    const pool = reg.worktreePoolConfig();
    expect(pool.max).toBe(5);
    expect(pool.namePrefix).toBe("pool");
    expect(pool.cleanupBetweenJobs).toBe("git-clean");
  });

  it("worktreePool custom values round-trip", async () => {
    const reg = await loadWith(
      `worktreePool:
  max: 3
  namePrefix: agent-pool
  cleanupBetweenJobs: git-clean
agents:
  - name: any
    command: claude
    args: []
`,
    );
    const pool = reg.worktreePoolConfig();
    expect(pool.max).toBe(3);
    expect(pool.namePrefix).toBe("agent-pool");
  });

  it("worktreePool rejects max: 0", async () => {
    const reg = await loadWith(
      `worktreePool:
  max: 0
agents:
  - name: any
    command: claude
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/worktreePool\.max/);
  });

  it("worktreePool rejects cleanupBetweenJobs: recreate as not yet supported", async () => {
    const reg = await loadWith(
      `worktreePool:
  cleanupBetweenJobs: recreate
agents:
  - name: any
    command: claude
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/worktreePool\.cleanupBetweenJobs/);
    expect(cfg.error).toMatch(/not yet supported/);
  });

  it("worktreePool rejects unknown keys (idleReleaseAfter, typos)", async () => {
    const reg = await loadWith(
      `worktreePool:
  idleReleaseAfter: 300
agents:
  - name: any
    command: claude
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/worktreePool\.idleReleaseAfter/);
    expect(cfg.error).toMatch(/unknown key/);
  });

  it("role-annotated agent still resolves spawn args identically", async () => {
    const reg = await loadWith(
      `agents:
  - name: reviewer-web
    command: claude
    args: ["/opsx:apply", "\${change_id}"]
    role: reviewer
    specialties: [area/server]
`,
    );
    const def = reg.find("reviewer-web");
    expect(def).not.toBeNull();
    const r = reg.resolve(def!, {
      change_id: "add-foo",
      worktree_path: "/w/add-foo",
      branch: "agent/add-foo",
    });
    expect(r.args).toEqual(["/opsx:apply", "add-foo"]);
  });
});

describe("AgentRegistry manager selection (add-manager-agent-config)", () => {
  it("returns null when no manager-role entry exists", async () => {
    const reg = await loadWith(
      `agents:
  - name: claude
    command: claude
    args: []
`,
    );
    expect(reg.managerAgent()).toBeNull();
  });

  it("returns the first manager-role entry when one is declared", async () => {
    const reg = await loadWith(
      `agents:
  - name: primary
    role: manager
    command: claude
    args: [--continue]
    initialInput: /opsx:manage
  - name: coder
    role: code
    command: claude
    args: [-p]
`,
    );
    const m = reg.managerAgent();
    expect(m).not.toBeNull();
    expect(m!.name).toBe("primary");
    expect(m!.command).toBe("claude");
    expect(m!.args).toEqual(["--continue"]);
    expect(m!.initialInput).toBe("/opsx:manage");
  });

  it("returns the first (by file order) when multiple manager entries exist", async () => {
    const reg = await loadWith(
      `agents:
  - name: first-mgr
    role: manager
    command: claude
    args: [--continue]
  - name: second-mgr
    role: manager
    command: aider
    args: []
`,
    );
    const m = reg.managerAgent();
    expect(m!.name).toBe("first-mgr");
  });

  it("rejects a runtime-backed manager at load", async () => {
    const reg = await loadWith(
      `runtimes:
  claude:
    command: claude
    baseArgs: []
    promptStyle: cli-arg
    supports:
      interactive: true
      artifactOutput: true
      diff: git
agents:
  - name: bad-mgr
    role: manager
    runtime: claude
    prompt: /opsx:manage
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toMatch(/manager/);
  });
});
