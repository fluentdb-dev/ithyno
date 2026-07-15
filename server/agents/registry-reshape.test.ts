// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry, resolvePromptForRole } from "./registry.js";

/**
 * Tests specifically covering the reshape-agents-yaml-mode-roles change:
 *
 *   - Load-time normalization of pre-existing shapes (scalar `role`,
 *     `initialInput`, bare `runtime + prompt`).
 *   - Multi-role dispatch selector: `agent.roles.includes(request.role)`.
 *   - Per-role prompt resolution: agent → runtime → built-in default.
 *   - Manager singleton and Manager mode-gate constraints.
 *   - Fatal cases: multi-role + legacy `initialInput`, second manager.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-reshape-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function loadWith(yamlSource: string): Promise<AgentRegistry> {
  writeFileSync(join(dir, "agents.yaml"), yamlSource);
  const reg = new AgentRegistry(dir);
  await reg.load();
  return reg;
}

describe("normalization: scalar role → roles[0]", () => {
  it("`role: code` normalizes to roles: [code]", async () => {
    const reg = await loadWith(
      `agents:
  - name: worker
    command: claude
    args: []
    role: code
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].roles).toEqual(["code"]);
    expect(cfg.agents[0].role).toBe("code"); // deprecated alias also set
    // Warning surfaced for the deprecated shape
    expect(cfg.warnings.some((w) => /deprecated shape/.test(w))).toBe(true);
  });

  it("`role: coder` normalizes to roles: [code] (coder → code alias)", async () => {
    const reg = await loadWith(
      `agents:
  - name: old
    command: claude
    args: []
    role: coder
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].roles).toEqual(["code"]);
    expect(cfg.warnings.some((w) => /coder→code alias/.test(w))).toBe(true);
  });
});

describe("normalization: initialInput → prompts[role]", () => {
  it("folds initialInput on single-role agent", async () => {
    const reg = await loadWith(
      `agents:
  - name: worker
    command: claude
    args: []
    role: code
    initialInput: /custom-flow \${change_id}
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].prompts).toEqual({ code: "/custom-flow ${change_id}" });
  });

  it("folds bare runtime `prompt` into prompts[role]", async () => {
    const reg = await loadWith(
      `runtimes:
  claude:
    command: claude
    baseArgs: []
    promptStyle: cli-arg
    supports: { interactive: true, artifactOutput: true, diff: git }
agents:
  - name: worker
    role: review
    runtime: claude
    prompt: /opsx:review \${change_id}
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].prompts).toEqual({ review: "/opsx:review ${change_id}" });
  });
});

describe("normalization: mode synthesis", () => {
  it("scalar `role: manager` synthesizes mode: live-shell", async () => {
    const reg = await loadWith(
      `agents:
  - name: mgr
    role: manager
    command: claude
    args: [--continue]
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].mode).toBe("live-shell");
    expect(cfg.agents[0].roles).toEqual(["manager"]);
  });

  it("non-manager role synthesizes mode: single-prompt", async () => {
    const reg = await loadWith(
      `agents:
  - name: worker
    role: verify
    command: claude
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.agents[0].mode).toBe("single-prompt");
  });
});

describe("fatal cases", () => {
  it("manager without live-shell mode is rejected", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    mode: single-prompt
    roles: [manager]
    command: claude
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toMatch(/manager.*live-shell/);
  });

  it("two managers rejected (singleton)", async () => {
    const reg = await loadWith(
      `agents:
  - name: first
    mode: live-shell
    roles: [manager]
    command: claude
    args: []
  - name: second
    mode: live-shell
    roles: [manager]
    command: aider
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toMatch(/only one agent may include 'manager'/);
  });

  it("multi-role + legacy initialInput is rejected as ambiguous", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    roles: [code, review]
    mode: single-prompt
    command: claude
    args: []
    initialInput: /some-prompt
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toMatch(/multi-role/);
  });

  it("cannot declare both scalar role and roles[]", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    role: code
    roles: [review]
    command: claude
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toMatch(/cannot declare both/);
  });
});

// NOTE: `describe("multi-role dispatch selection", ...)` removed by
// revert-dispatch-endpoint — selectAgent + dispatch endpoint no longer exist.
// Role → agent resolution now lives in skill-side judgment; see
// docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md.

describe("resolvePromptForRole — 3-tier resolution", () => {
  it("agent.prompts wins over runtime.prompts and built-in", async () => {
    const reg = await loadWith(
      `runtimes:
  claude:
    command: claude
    baseArgs: []
    promptStyle: cli-arg
    prompts:
      code: /runtime-level
    supports: { interactive: true, artifactOutput: true, diff: git }
agents:
  - name: worker
    mode: single-prompt
    roles: [code]
    runtime: claude
    prompts:
      code: /agent-level
`,
    );
    const def = reg.find("worker")!;
    const resolved = resolvePromptForRole(def, reg.runtimes(), "code");
    expect(resolved).toBe("/agent-level");
  });

  it("runtime.prompts wins over built-in when agent has no override", async () => {
    const reg = await loadWith(
      `runtimes:
  claude:
    command: claude
    baseArgs: []
    promptStyle: cli-arg
    prompts:
      review: /runtime-review
    supports: { interactive: true, artifactOutput: true, diff: git }
agents:
  - name: worker
    mode: single-prompt
    roles: [review]
    runtime: claude
`,
    );
    const def = reg.find("worker")!;
    const resolved = resolvePromptForRole(def, reg.runtimes(), "review");
    expect(resolved).toBe("/runtime-review");
  });

  it("built-in default kicks in when neither agent nor runtime declares", async () => {
    const reg = await loadWith(
      `agents:
  - name: worker
    mode: single-prompt
    roles: [verify]
    command: claude
    args: []
`,
    );
    const def = reg.find("worker")!;
    const resolved = resolvePromptForRole(def, reg.runtimes(), "verify");
    expect(resolved).toBe("/opsx:verify ${change_id}");
  });

  it("undefined for a role with no built-in default and no override", async () => {
    const reg = await loadWith(
      `agents:
  - name: worker
    mode: single-prompt
    roles: [other]
    command: claude
    args: []
`,
    );
    const def = reg.find("worker")!;
    const resolved = resolvePromptForRole(def, reg.runtimes(), "other");
    expect(resolved).toBeUndefined();
  });
});
