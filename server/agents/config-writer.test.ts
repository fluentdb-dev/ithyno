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
  specialties: [],
  concurrency: 1,
  dedicated: true,
};

const runtimeReviewer: AgentConfigPayload = {
  action: "upsert",
  name: "reviewer",
  roles: ["review"],
  mode: "single-prompt",
  runtime: "claude",
  prompts: { review: "/opsx:review ${change_id}" },
  specialties: ["area/web"],
  concurrency: 2,
  dedicated: false,
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

  it("supports the runtime-backed shape", async () => {
    await seed(
      [
        "runtimes:",
        "  claude:",
        "    command: claude",
        "    baseArgs: [--dangerously-skip-permissions, -p]",
        "    promptStyle: cli-arg",
        "agents: []",
        "",
      ].join("\n"),
    );
    const res = await applyAgentConfigPayload(dir, runtimeReviewer);
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    const agents = doc.agents as Array<Record<string, unknown>>;
    expect(agents[0]).toMatchObject({
      name: "reviewer",
      runtime: "claude",
      prompts: { review: "/opsx:review ${change_id}" },
      dedicated: false,
    });
    // Legacy fields must not leak into a runtime-backed entry.
    expect(agents[0].command).toBeUndefined();
    expect(agents[0].args).toBeUndefined();
  });

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
      specialties: [],
      concurrency: 1,
      dedicated: true,
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
      specialties: [],
      concurrency: 1,
      dedicated: true,
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
      specialties: [],
      concurrency: 1,
      dedicated: true,
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
      specialties: [],
      concurrency: 1,
      dedicated: true,
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
      specialties: [],
      concurrency: 1,
      dedicated: true,
    });
    expect(res).toEqual({ error: expect.stringMatching(/kebab-case/i) });
  });

  it("rejects concurrency < 1", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      roles: ["code"],
      mode: "single-prompt",
      command: "cmd",
      args: [],
      specialties: [],
      concurrency: 0,
      dedicated: true,
    });
    expect(res).toEqual({ error: expect.stringMatching(/concurrency/i) });
  });

  it("rejects missing mode", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      roles: ["code"],
      command: "cmd",
      specialties: [],
      concurrency: 1,
      dedicated: true,
    });
    expect(res).toEqual({ error: expect.stringMatching(/mode/i) });
  });

  it("rejects a payload with neither command nor runtime", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      roles: ["code"],
      mode: "single-prompt",
      specialties: [],
      concurrency: 1,
      dedicated: true,
    });
    expect(res).toEqual({ error: expect.stringMatching(/either/i) });
  });

  it("rejects manager role without live-shell mode", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      roles: ["manager"],
      mode: "single-prompt",
      command: "claude",
      args: ["--continue"],
      specialties: [],
      concurrency: 1,
      dedicated: true,
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
      specialties: [],
      concurrency: 1,
      dedicated: true,
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
      runtime: "claude",
      prompts: { code: "/opsx:apply ${change_id}" },
      specialties: [],
      concurrency: 1,
      dedicated: true,
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
