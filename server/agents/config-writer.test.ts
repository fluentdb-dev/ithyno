// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  applyAgentConfigPayload,
  coercePayload,
  writeAgmsg,
  writeTmux,
  type AgentConfigPayload,
} from "./config-writer.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-cfgwrite-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seed(yaml: string): Promise<void> {
  await writeFile(join(dir, "agents.yaml"), yaml, "utf8");
}

async function readBack(): Promise<Record<string, unknown>> {
  const raw = await readFile(join(dir, "agents.yaml"), "utf8");
  return parseYaml(raw) as Record<string, unknown>;
}

const legacyClaude: AgentConfigPayload = {
  action: "upsert",
  name: "claude",
  roles: ["code"],
  mode: "single-prompt",
  command: "claude",
  args: ["--dangerously-skip-permissions"],
  prompts: { code: "/opsx:apply ${change_id}" },

};

describe("applyAgentConfigPayload — upsert", () => {
  it("appends to an empty file", async () => {
    await seed("agents: []\n");
    const res = await applyAgentConfigPayload(dir, legacyClaude);
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.agents).toEqual([
      expect.objectContaining({ name: "claude", roles: ["code"], command: "claude" }),
    ]);
  });

  it("creates the file when missing", async () => {
    // No seed call — file does not exist.
    const res = await applyAgentConfigPayload(dir, legacyClaude);
    expect(res).toEqual({ ok: true });
    expect(existsSync(join(dir, "agents.yaml"))).toBe(true);
    const doc = await readBack();
    expect(Array.isArray(doc.agents)).toBe(true);
    expect((doc.agents as unknown[])[0]).toMatchObject({ name: "claude" });
  });

  it("overwrites an existing agent in place, preserving order", async () => {
    await seed(
      [
        "agents:",
        "  - name: alpha",
        "    role: code",
        "    command: alpha-cmd",
        "    args: []",
        "  - name: claude",
        "    role: code",
        "    command: old-claude",
        "    args: []",
        "  - name: beta",
        "    role: code",
        "    command: beta-cmd",
        "    args: []",
        "",
      ].join("\n"),
    );
    const res = await applyAgentConfigPayload(dir, {
      ...legacyClaude,
      roles: ["review"],
    });
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    const agents = doc.agents as Array<Record<string, unknown>>;
    expect(agents.map((a) => a.name)).toEqual(["alpha", "claude", "beta"]);
    expect(agents[1]).toMatchObject({ name: "claude", roles: ["review"], command: "claude" });
  });

  it("preserves unrelated top-level keys (runtimes, worktreePool, unknown)", async () => {
    await seed(
      [
        "runtimes:",
        "  claude:",
        "    command: claude",
        "    baseArgs: [--dangerously-skip-permissions, -p]",
        "    promptStyle: cli-arg",
        "worktreePool:",
        "  max: 3",
        "customTopKey: keep-me",
        "agents: []",
        "",
      ].join("\n"),
    );
    const res = await applyAgentConfigPayload(dir, legacyClaude);
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.runtimes).toMatchObject({ claude: { command: "claude" } });
    expect(doc.worktreePool).toMatchObject({ max: 3 });
    expect(doc.customTopKey).toBe("keep-me");
  });

  it("preserves the top-level agmsg block through upsert (add-agmsg-config-block)", async () => {
    await seed(
      [
        "agmsg:",
        "  team: alpha",
        "  storage: .worktrees/.agmsg.sqlite",
        "agents: []",
        "",
      ].join("\n"),
    );
    const res = await applyAgentConfigPayload(dir, legacyClaude);
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.agmsg).toEqual({
      team: "alpha",
      storage: ".worktrees/.agmsg.sqlite",
    });
    expect((doc.agents as unknown[]).length).toBe(1);
  });

  // "supports the runtime-backed shape" — removed by
  // revert-runtime-abstraction (R3). Runtime block + agent runtime
  // reference are no longer supported.

  it("rejects a payload the loader validator refuses", async () => {
    await seed("agents: []\n");
    // The coerce step lets this through (both concurrency+dedicated are
    // present) but the loader's exhaustiveness check should reject a
    // mangled shape — bypass coerce to test the guard.
    // Post reshape-agents-yaml-mode-roles: command + runtime are not
    // mutually exclusive anymore (runtime is optional shared-defaults).
    // Instead exercise an unknown-runtime rejection which the loader
    // still catches. (The bogus type-cast bypasses TS.)
    const bogus = {
      action: "upsert" as const,
      name: "bad",
      roles: ["code"],
      mode: "single-prompt" as const,
      runtime: "does-not-exist",

    };
    // Note: applyAgentConfigPayload's validateAgents wraps normalizeAgent
    // which does NOT validate the runtime reference (that happens at
    // resolve() time). So this actually will pass validation. Use a
    // different structural error to test the loader guard instead:
    // an empty roles array.
    const reallyBogus = {
      ...bogus,
      roles: [] as string[],
    };
    const res = await applyAgentConfigPayload(dir, reallyBogus as AgentConfigPayload);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    // File untouched.
    const doc = await readBack();
    expect(doc.agents).toEqual([]);
  });
});

describe("applyAgentConfigPayload — delete", () => {
  it("removes the entry", async () => {
    await seed(
      [
        "agents:",
        "  - name: claude",
        "    role: code",
        "    command: claude",
        "    args: []",
        "  - name: reviewer",
        "    role: review",
        "    command: claude",
        "    args: []",
        "",
      ].join("\n"),
    );
    const res = await applyAgentConfigPayload(dir, {
      action: "delete",
      name: "reviewer",
    });
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    const agents = doc.agents as Array<Record<string, unknown>>;
    expect(agents.map((a) => a.name)).toEqual(["claude"]);
  });

  it("returns 404 on missing name and leaves the file byte-identical", async () => {
    const seedYaml = [
      "agents:",
      "  - name: claude",
      "    role: code",
      "    command: claude",
      "    args: []",
      "",
    ].join("\n");
    await seed(seedYaml);
    const res = await applyAgentConfigPayload(dir, {
      action: "delete",
      name: "nonexistent",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.error).toMatch(/nonexistent/);
    }
    const raw = await readFile(join(dir, "agents.yaml"), "utf8");
    expect(raw).toBe(seedYaml);
  });
});

describe("applyAgentConfigPayload — manager guardrails (refine-agents-config-modal)", () => {
  it("rejects delete on a manager entry with 400", async () => {
    const seedYaml = [
      "agents:",
      "  - name: primary",
      "    role: manager",
      "    command: claude",
      "    args: [--continue]",
      "",
    ].join("\n");
    await seed(seedYaml);
    const res = await applyAgentConfigPayload(dir, {
      action: "delete",
      name: "primary",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toMatch(/cannot be deleted/i);
    }
    // File untouched.
    const raw = await readFile(join(dir, "agents.yaml"), "utf8");
    expect(raw).toBe(seedYaml);
  });

  it("rejects upsert that would create a second manager with 400", async () => {
    const seedYaml = [
      "agents:",
      "  - name: primary",
      "    role: manager",
      "    command: claude",
      "    args: [--continue]",
      "",
    ].join("\n");
    await seed(seedYaml);
    const res = await applyAgentConfigPayload(dir, {
      action: "upsert",
      name: "secondary",
      roles: ["manager"],
      mode: "live-shell",
      command: "aider",
      args: [],

    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toMatch(/only one agent may include 'manager'/i);
    }
    const raw = await readFile(join(dir, "agents.yaml"), "utf8");
    expect(raw).toBe(seedYaml);
  });

  it("accepts upsert on the existing manager (same name)", async () => {
    await seed(
      [
        "agents:",
        "  - name: primary",
        "    role: manager",
        "    command: claude",
        "    args: [--continue]",
        "",
      ].join("\n"),
    );
    const res = await applyAgentConfigPayload(dir, {
      action: "upsert",
      name: "primary",
      roles: ["manager"],
      mode: "live-shell",
      command: "aider",
      args: [],

    });
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    const agents = doc.agents as Array<Record<string, unknown>>;
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ name: "primary", command: "aider" });
  });

  it("round-trips prompts field on upsert", async () => {
    await seed("agents: []\n");
    const res = await applyAgentConfigPayload(dir, {
      action: "upsert",
      name: "primary",
      roles: ["manager"],
      mode: "live-shell",
      command: "claude",
      args: ["--continue"],
      prompts: { manager: "/opsx:manage" },

    });
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    const agents = doc.agents as Array<Record<string, unknown>>;
    expect(agents[0]).toMatchObject({
      name: "primary",
      roles: ["manager"],
      mode: "live-shell",
      command: "claude",
      prompts: { manager: "/opsx:manage" },
    });
  });
});

describe("atomic write", () => {
  it("does not leave a .tmp sibling after success", async () => {
    await seed("agents: []\n");
    await applyAgentConfigPayload(dir, legacyClaude);
    expect(existsSync(join(dir, "agents.yaml.tmp"))).toBe(false);
  });
});

describe("coercePayload", () => {
  it("rejects a non-object body", () => {
    expect(coercePayload(null)).toEqual({ error: expect.any(String) });
    expect(coercePayload("hello")).toEqual({ error: expect.any(String) });
  });

  it("rejects an unknown action", () => {
    expect(coercePayload({ action: "explode" })).toEqual({ error: expect.any(String) });
  });

  it("rejects UPPERCASE name", () => {
    const res = coercePayload({
      action: "upsert",
      name: "BadName",
      roles: ["code"],
      mode: "single-prompt",
      command: "cmd",
      args: [],

    });
    expect(res).toEqual({ error: expect.stringMatching(/kebab-case/i) });
  });

  // "rejects concurrency < 1" — removed by revert-agents-yaml-schema-fields (R8).

  it("rejects missing mode", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      roles: ["code"],
      command: "cmd",

    });
    expect(res).toEqual({ error: expect.stringMatching(/mode/i) });
  });

  it("rejects a payload with neither command nor runtime", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      roles: ["code"],
      mode: "single-prompt",

    });
    expect(res).toEqual({ error: expect.stringMatching(/command/i) });
  });

  it("rejects manager role without live-shell mode", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      roles: ["manager"],
      mode: "single-prompt",
      command: "claude",
      args: ["--continue"],

    });
    expect(res).toEqual({ error: expect.stringMatching(/live-shell/i) });
  });

  it("accepts scalar 'role' as sugar for 'roles: [role]' (grace period)", () => {
    const res = coercePayload({
      action: "upsert",
      name: "claude",
      role: "code",
      mode: "single-prompt",
      command: "claude",
      args: ["-p", "/opsx:apply"],

    });
    expect("error" in res).toBe(false);
    if (!("error" in res) && res.action === "upsert") {
      expect(res.roles).toEqual(["code"]);
    }
  });

  it("accepts a valid new-schema payload", () => {
    const res = coercePayload({
      action: "upsert",
      name: "claude",
      roles: ["code", "review", "verify"],
      mode: "single-prompt",
      command: "claude",
      prompts: { code: "/opsx:apply ${change_id}" },

    });
    expect("error" in res).toBe(false);
    if (!("error" in res) && res.action === "upsert") {
      expect(res.roles).toEqual(["code", "review", "verify"]);
      expect(res.mode).toBe("single-prompt");
      expect(res.prompts).toEqual({ code: "/opsx:apply ${change_id}" });
    }
  });

  it("accepts a valid delete payload", () => {
    const res = coercePayload({ action: "delete", name: "reviewer" });
    expect(res).toEqual({ action: "delete", name: "reviewer" });
  });
});

describe("writeAgmsg (add-agmsg-config-write)", () => {
  it("upserts an agmsg block with just team", async () => {
    await seed(
      ["agents:", "  - name: existing", "    mode: single-prompt", "    roles: [code]", "    command: cmd", "    args: []", ""].join("\n"),
    );
    const res = await writeAgmsg(dir, { team: "openspec-ui" });
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.agmsg).toEqual({ team: "openspec-ui" });
    expect(Array.isArray(doc.agents)).toBe(true);
    expect((doc.agents as unknown[]).length).toBe(1);
  });

  it("upserts an agmsg block with team + storage", async () => {
    await seed("agents: []\n");
    const res = await writeAgmsg(dir, {
      team: "openspec-ui",
      storage: ".worktrees/.agmsg.sqlite",
    });
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.agmsg).toEqual({
      team: "openspec-ui",
      storage: ".worktrees/.agmsg.sqlite",
    });
  });

  it("removes an existing agmsg block when block is null", async () => {
    await seed(
      ["agmsg:", "  team: openspec-ui", "  storage: .worktrees/.agmsg.sqlite", "agents: []", ""].join("\n"),
    );
    const res = await writeAgmsg(dir, null);
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.agmsg).toBeUndefined();
    expect(doc.agents).toEqual([]);
  });

  it("is a no-op when null is written on an absent block", async () => {
    await seed("agents: []\n");
    const res = await writeAgmsg(dir, null);
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.agmsg).toBeUndefined();
  });

  it("rejects an empty team", async () => {
    await seed("agents: []\n");
    const res = await writeAgmsg(dir, { team: "" });
    expect(res).toEqual({
      ok: false,
      status: 400,
      error: "agmsg.team is required when the agmsg block is present",
    });
    // File must not be modified on validation failure.
    const doc = await readBack();
    expect(doc.agmsg).toBeUndefined();
  });

  it("preserves unrelated top-level keys through an upsert", async () => {
    await seed(
      ["parallelExecution: true", "customTopKey: keep-me", "agents:", "  - name: a", "    mode: single-prompt", "    roles: [code]", "    command: c", "    args: []", ""].join("\n"),
    );
    await writeAgmsg(dir, { team: "openspec-ui" });
    const doc = await readBack();
    expect(doc.parallelExecution).toBe(true);
    expect(doc.customTopKey).toBe("keep-me");
    expect(doc.agmsg).toEqual({ team: "openspec-ui" });
  });

  it("preserves unrelated top-level keys through a remove", async () => {
    await seed(
      ["agmsg:", "  team: openspec-ui", "parallelExecution: true", "customTopKey: keep-me", "agents: []", ""].join("\n"),
    );
    await writeAgmsg(dir, null);
    const doc = await readBack();
    expect(doc.agmsg).toBeUndefined();
    expect(doc.parallelExecution).toBe(true);
    expect(doc.customTopKey).toBe("keep-me");
  });

  it("drops empty-string storage on upsert", async () => {
    await seed("agents: []\n");
    // Client may send "" for storage when the input is blank; the writer
    // treats that as "not set".
    await writeAgmsg(dir, { team: "openspec-ui", storage: "" });
    const doc = await readBack();
    expect(doc.agmsg).toEqual({ team: "openspec-ui" });
  });
});

describe("writeTmux", () => {
  it("creates agents.yaml with tmux: true when missing", async () => {
    const res = await writeTmux(dir, true);
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.tmux).toBe(true);
  });

  it("updates existing agents.yaml to set tmux: false", async () => {
    await seed("tmux: true\nagents: []\n");
    const res = await writeTmux(dir, false);
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    expect(doc.tmux).toBe(false);
  });
});

