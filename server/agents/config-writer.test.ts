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
  role: "code",
  command: "claude",
  args: ["--dangerously-skip-permissions", "-p", "/opsx:apply ${change_id}"],
  specialties: [],
  concurrency: 1,
  dedicated: true,
};

const runtimeReviewer: AgentConfigPayload = {
  action: "upsert",
  name: "reviewer",
  role: "review",
  runtime: "claude",
  prompt: "/opsx:review ${change_id}",
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
      expect.objectContaining({ name: "claude", role: "code", command: "claude" }),
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
      role: "review",
    });
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    const agents = doc.agents as Array<Record<string, unknown>>;
    expect(agents.map((a) => a.name)).toEqual(["alpha", "claude", "beta"]);
    expect(agents[1]).toMatchObject({ name: "claude", role: "review", command: "claude" });
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
      prompt: "/opsx:review ${change_id}",
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
    const bogus = {
      action: "upsert" as const,
      name: "bad",
      role: "code",
      command: "cmd",
      runtime: "claude", // simultaneously legacy AND runtime-backed
      specialties: [],
      concurrency: 1,
      dedicated: true,
    };
    const res = await applyAgentConfigPayload(dir, bogus as AgentConfigPayload);
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
      role: "manager",
      command: "aider",
      args: [],
      specialties: [],
      concurrency: 1,
      dedicated: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toMatch(/only one role: manager/i);
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
      role: "manager",
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

  it("round-trips initialInput field on upsert", async () => {
    await seed("agents: []\n");
    const res = await applyAgentConfigPayload(dir, {
      action: "upsert",
      name: "primary",
      role: "manager",
      command: "claude",
      args: ["--continue"],
      initialInput: "/opsx:manage",
      specialties: [],
      concurrency: 1,
      dedicated: true,
    });
    expect(res).toEqual({ ok: true });
    const doc = await readBack();
    const agents = doc.agents as Array<Record<string, unknown>>;
    expect(agents[0]).toMatchObject({
      name: "primary",
      role: "manager",
      command: "claude",
      initialInput: "/opsx:manage",
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
      role: "code",
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
      role: "code",
      command: "cmd",
      args: [],
      specialties: [],
      concurrency: 0,
      dedicated: true,
    });
    expect(res).toEqual({ error: expect.stringMatching(/concurrency/i) });
  });

  it("rejects mixed legacy + runtime shape", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      role: "code",
      command: "cmd",
      runtime: "claude",
      specialties: [],
      concurrency: 1,
      dedicated: true,
    });
    expect(res).toEqual({ error: expect.stringMatching(/mix/i) });
  });

  it("rejects a payload with neither shape declared", () => {
    const res = coercePayload({
      action: "upsert",
      name: "foo",
      role: "code",
      specialties: [],
      concurrency: 1,
      dedicated: true,
    });
    expect(res).toEqual({ error: expect.stringMatching(/either/i) });
  });

  it("accepts a valid legacy payload", () => {
    const res = coercePayload({
      action: "upsert",
      name: "claude",
      role: "code",
      command: "claude",
      args: ["-p", "/opsx:apply"],
      specialties: [],
      concurrency: 1,
      dedicated: true,
    });
    expect("error" in res).toBe(false);
    if (!("error" in res) && res.action === "upsert") {
      expect(res.command).toBe("claude");
    }
  });

  it("accepts a valid delete payload", () => {
    const res = coercePayload({ action: "delete", name: "reviewer" });
    expect(res).toEqual({ action: "delete", name: "reviewer" });
  });
});
