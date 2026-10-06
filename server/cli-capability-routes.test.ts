// SPDX-License-Identifier: GPL-3.0-or-later
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerCliCapabilityRoutes } from "./cli-capability-routes.js";
import { SESSION_TOKEN } from "./util/auth.js";

function makeFakeCodexExecutable(mode: "valid" | "probe-failure") {
  const dir = mkdtempSync(join(tmpdir(), "ithyno-cli-capability-"));
  const scriptPath = join(dir, "codex");
  const script = [
    "#!/usr/bin/env node",
    "const write = (packet) => process.stdout.write(JSON.stringify(packet) + '\\n');",
    "const args = process.argv.slice(2);",
    "if (args.includes('--version')) { process.stdout.write('codex 0.160.1\\n'); process.exit(0); }",
    "if (args.includes('--help')) { process.stdout.write('usage: codex [options]\\n--model\\n'); process.exit(0); }",
    "if (args[0] !== 'app-server') { process.exit(0); }",
    "const mode = " + JSON.stringify(mode) + ";",
    "let buffer = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => {",
    "  buffer += chunk;",
    "  const lines = buffer.split(/\\r?\\n/);",
    "  buffer = lines.pop() || '';",
    "  for (const line of lines) {",
    "    if (!line.trim()) continue;",
    "    const request = JSON.parse(line);",
    "    if (request.method === 'initialize') {",
    "      if (!request.params || !request.params.clientInfo) {",
    "        write({ jsonrpc: '2.0', id: request.id ?? 1, error: { code: -32602, message: 'missing initialize params' } });",
    "        process.exit(1);",
    "      }",
    "      write({ jsonrpc: '2.0', id: request.id, result: { ok: true } });",
    "      continue;",
    "    }",
    "    if (request.method === 'model/list') {",
    "      if (mode === 'probe-failure' || !request.params) {",
    "        write({ jsonrpc: '2.0', id: request.id ?? 2, error: { code: -32602, message: 'missing model/list params' } });",
    "        process.exit(1);",
    "      }",
    "      write({ jsonrpc: '2.0', id: request.id ?? 2, result: { data: [{ id: 'gpt-5.1', displayName: 'GPT-5.1' }, { model: 'claude-3.7-sonnet' }] } });",
    "      process.exit(0);",
    "    }",
    "  }",
    "});",
  ].join("\n");
  writeFileSync(scriptPath, script, "utf8");
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

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

  it("returns a failed probe result when the selected CLI cannot complete the handshake", async () => {
    const fakeCodex = makeFakeCodexExecutable("probe-failure");
    const app = Fastify({ logger: false });
    app.register(registerCliCapabilityRoutes);
    await app.ready();
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/cli/capabilities?command=${encodeURIComponent(fakeCodex)}`,
        headers: { "X-Session-Token": SESSION_TOKEN },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: false, supported: false, availableModels: [] });
    } finally {
      await app.close();
      rmSync(fakeCodex, { recursive: true, force: true });
    }
  });

  it("uses the successful Codex app-server handshake and returns discovered models", async () => {
    const fakeCodex = makeFakeCodexExecutable("valid");
    const app = Fastify({ logger: false });
    app.register(registerCliCapabilityRoutes);
    await app.ready();
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/cli/capabilities?command=${encodeURIComponent(fakeCodex)}`,
        headers: { "X-Session-Token": SESSION_TOKEN },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, supported: true, availableModels: ["gpt-5.1", "claude-3.7-sonnet"] });
      expect(response.json().modelMetadata).toContainEqual(expect.objectContaining({ id: "gpt-5.1", displayName: "GPT-5.1" }));
    } finally {
      await app.close();
      rmSync(fakeCodex, { recursive: true, force: true });
    }
  });
});
