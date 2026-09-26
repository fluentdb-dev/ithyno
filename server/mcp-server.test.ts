import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bridgeRuntimeDirectory, lookupBridgeRuntime, startBridgeServer, stopBridgeServer, unregisterBridgeRuntime } from "./bridge.js";
import { TOOL_DEFS, handleBridgeTool } from "./mcp-server.js";

async function sendMcpJsonRpcBatch(child: ReturnType<typeof spawn>, requests: Array<{ id: number; method: string; params?: Record<string, unknown> }>) {
  const stdout = child.stdout;
  const stderr = child.stderr;
  const stdin = child.stdin;
  if (!stdout || !stderr || !stdin) {
    throw new Error("MCP stdio child has no stdout/stderr/stdin streams");
  }
  return await new Promise<Record<number, Record<string, unknown>>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a complete MCP stdio batch")), 5000);
    const buffered = new Map<number, Record<string, unknown>>();
    const onData = (chunk: Buffer | string) => {
      const text = String(chunk);
      const lines = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          const id = message.id;
          if (typeof id === "number") {
            buffered.set(id, message);
          }
          if (buffered.size >= requests.length) {
            clearTimeout(timer);
            stdout.off("data", onData);
            stderr.off("data", onError);
            resolve(Object.fromEntries(Array.from(buffered.entries())) as Record<number, Record<string, unknown>>);
          }
        } catch {
          // continue scanning for valid JSON-RPC frames from the server
        }
      }
    };
    const onError = (chunk: Buffer | string) => {
      const text = String(chunk);
      if (text.trim()) {
        clearTimeout(timer);
        stdout.off("data", onData);
        stderr.off("data", onError);
        reject(new Error(text.trim()));
      }
    };
    stdout.on("data", onData);
    stderr.on("data", onError);
    stdin.write(
      requests
        .map(({ id, method, params = {} }) => JSON.stringify({ jsonrpc: "2.0", id, method, params }))
        .join("\n") + "\n",
    );
  });
}

describe("MCP bridge adapter", () => {
  it("declares the bounded role enum and exposes the activity tool in the MCP catalog", () => {
    expect(TOOL_DEFS.some((tool) => tool.name === "ithyno_activity")).toBe(true);
    const tool = TOOL_DEFS.find((item) => item.name === "ithyno_activity");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.properties.role).toEqual({
      type: "string",
      enum: ["propose", "code", "review", "verify"],
    });
    expect(tool?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it("accepts valid role forwarding and rejects invalid non-idle activity payloads", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-mcp-"));
    const { server } = await startBridgeServer(projectRoot, process.cwd());
    try {
      const valid = (await handleBridgeTool("ithyno_activity", {
        project: projectRoot,
        changeId: "mcp-role",
        role: "review",
        activity: "waiting",
        detail: "in review",
      })) as any;
      if (!valid.ok) {
        throw new Error(valid.error ?? "valid bridge activity unexpectedly failed");
      }
      expect(valid.result).toEqual(expect.objectContaining({
        changeId: "mcp-role",
        activity: expect.objectContaining({ role: "review", activity: "waiting" }),
      }));

      const missingRole = (await handleBridgeTool("ithyno_activity", {
        project: projectRoot,
        changeId: "mcp-role",
        activity: "judging",
      })) as any;
      expect(missingRole.ok).toBe(false);
      if (missingRole.ok) {
        throw new Error("missing role should fail");
      }
      expect(missingRole.error).toContain("role is required");

      const invalidRole = (await handleBridgeTool("ithyno_activity", {
        project: projectRoot,
        changeId: "mcp-role",
        role: "archive",
        activity: "waiting",
      })) as any;
      expect(invalidRole.ok).toBe(false);
      if (invalidRole.ok) {
        throw new Error("invalid role should fail");
      }
      expect(invalidRole.error).toContain("role must be one of");
    } finally {
      await stopBridgeServer(server);
      const runtime = await lookupBridgeRuntime(projectRoot, process.cwd());
      if (runtime) {
        await unregisterBridgeRuntime(projectRoot, process.cwd(), runtime.generation, runtime.processStartIdentity);
      }
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("supports stdio initialize, list tools, and tool calls without a fixed port fallback", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-mcp-stdio-"));
    const { server } = await startBridgeServer(projectRoot, process.cwd());
    const child = spawn(process.execPath, ["bin/ithyno.js", "mcp", "serve", "--project", projectRoot], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        XDG_RUNTIME_DIR: bridgeRuntimeDirectory(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const responses = await sendMcpJsonRpcBatch(child, [
        {
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
        { id: 2, method: "tools/list", params: {} },
        {
          id: 3,
          method: "tools/call",
          params: {
            name: "ithyno_status",
            arguments: {},
          },
        },
      ]);
      const init = responses[1];
      const list = responses[2];
      const call = responses[3];
      expect(init.result).toEqual(expect.objectContaining({
        serverInfo: expect.objectContaining({ name: "ithyno-bridge" }),
      }));
      expect(list.result).toEqual(expect.objectContaining({
        tools: expect.arrayContaining([expect.objectContaining({ name: "ithyno_status" })]),
      }));
      expect(call.result).toEqual(expect.objectContaining({
        structuredContent: expect.objectContaining({ ok: true, projectRoot: realpathSync(projectRoot) }),
      }));
      expect(JSON.stringify(call.result)).not.toContain("localhost:4321");
    } finally {
      child.kill("SIGTERM");
      await stopBridgeServer(server);
      const runtime = await lookupBridgeRuntime(projectRoot, process.cwd());
      if (runtime) {
        await unregisterBridgeRuntime(projectRoot, process.cwd(), runtime.generation, runtime.processStartIdentity);
      }
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
