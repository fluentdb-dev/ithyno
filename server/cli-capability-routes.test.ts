// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn, spawnSync } from "node:child_process";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: vi.fn(),
    spawnSync: vi.fn(),
  };
});

import { registerCliCapabilityRoutes } from "./cli-capability-routes.js";
import { SESSION_TOKEN } from "./util/auth.js";

describe("cli capability routes", () => {
  it("requires auth", async () => {
    const app = Fastify({ logger: false });
    app.register(registerCliCapabilityRoutes);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/cli/capabilities?command=codex" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "auth required" });
    await app.close();
  });

  it("rejects an unknown command", async () => {
    const app = Fastify({ logger: false });
    app.register(registerCliCapabilityRoutes);
    await app.ready();
    const response = await app.inject({
      method: "GET",
      url: "/api/cli/capabilities?command=not-a-real-cli",
      headers: { "X-Session-Token": SESSION_TOKEN },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ supported: false, adapter: null, reason: "unsupported-command" });
    await app.close();
  });

  it("reads the bundled catalog deterministically without spawning a process", async () => {
    const app = Fastify({ logger: false });
    app.register(registerCliCapabilityRoutes);
    await app.ready();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/cli/capabilities?command=codex",
        headers: { "X-Session-Token": SESSION_TOKEN },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        supported: true,
        adapter: "codex",
        modelDiscovery: "native",
      });
      expect(response.json().fields.map((field: { flag: string }) => field.flag)).toEqual(
        expect.arrayContaining(["--model", "--sandbox", "--dangerously-bypass-approvals-and-sandbox"]),
      );
      expect(response.json().availableModels.length).toBeGreaterThan(0);
      expect(spawn).not.toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("serves GitHub's documented Copilot CLI model IDs from the bundled catalog", async () => {
    const app = Fastify({ logger: false });
    app.register(registerCliCapabilityRoutes);
    await app.ready();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/cli/capabilities?command=copilot",
        headers: { "X-Session-Token": SESSION_TOKEN },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().availableModels).toEqual(expect.arrayContaining([
        "auto",
        "claude-sonnet-5.5",
        "gpt-6.1-sol",
        "gpt-5.3-codex",
        "gemini-3.8-flash",
      ]));
      expect(spawn).not.toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("serves Anthropic's documented Claude Code model aliases from the bundled catalog", async () => {
    const app = Fastify({ logger: false });
    app.register(registerCliCapabilityRoutes);
    await app.ready();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/cli/capabilities?command=claude",
        headers: { "X-Session-Token": SESSION_TOKEN },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().availableModels).toEqual(expect.arrayContaining([
        "best",
        "fable",
        "sonnet",
        "opus",
        "haiku",
        "opusplan",
      ]));
      expect(spawn).not.toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
