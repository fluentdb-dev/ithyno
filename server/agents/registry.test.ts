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
    // Post reshape: default role is `code` (canonical). Pre-reshape
    // default was `coder` — the normalizer maps `coder → code`.
    expect(cfg.agents[0].role).toBe("code");
    expect(cfg.agents[0].roles).toEqual(["code"]);
    expect(cfg.agents[0].mode).toBe("single-prompt");
  });

  it("fully specified agent round-trips through the loader", async () => {
    const reg = await loadWith(
      `agents:
  - name: reviewer-web
    command: claude
    args: []
    roles: [review]
    mode: single-prompt
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    const a = cfg.agents[0];
    expect(a.roles).toEqual(["review"]);
    expect(a.mode).toBe("single-prompt");
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

  // concurrency / specialties validation tests removed by
  // revert-agents-yaml-schema-fields (R8). Both fields now trigger
  // "unknown key" errors from the general validator.

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

  // dedicated / worktreePool tests removed by revert-worktree-pool (R5).

  it("role-annotated agent still resolves spawn args identically", async () => {
    const reg = await loadWith(
      `agents:
  - name: reviewer-web
    command: claude
    args: ["/opsx:apply", "\${change_id}"]
    role: review
`,
    );
    const def = reg.find("reviewer-web");
    expect(def).not.toBeNull();
    const r = reg.resolve(def!, {
      change_id: "add-foo",
      worktree_path: "/w/add-foo",
      branch: "agent/add-foo",
    });
    // Post reshape: command-only agents own their args entirely — no
    // auto-append. The user is expected to include the prompt in args.
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

  it("rejects two manager entries at load (refine-agents-config-modal)", async () => {
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
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) {
      expect(cfg.error).toMatch(/only one agent may include 'manager'/i);
      expect(cfg.error).toContain("agents[1]");
    }
  });

  it.skip("rejects a runtime-backed manager at load (obsolete: reshape-agents-yaml-mode-roles allows runtime-referenced managers)", async () => {
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
