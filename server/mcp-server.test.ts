import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBridgeServer, stopBridgeServer, unregisterBridgeRuntime } from "./bridge.js";
import { TOOL_DEFS, handleBridgeTool } from "./mcp-server.js";

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
      await unregisterBridgeRuntime(projectRoot, process.cwd());
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
