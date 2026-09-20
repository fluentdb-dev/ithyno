import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { bridgeStatus, callBridgeOperation, canonicalProjectRoot, stableProjectHash } from "./bridge.js";

const TOOL_DEFS = [
  {
    name: "ithyno_status",
    description: "Return the bridged status for the exact project without fixed-port guesses.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Absolute or relative path for the project root." },
      },
      required: [],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "ithyno_changes",
    description: "List changes for the project via the shared local bridge.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Absolute or relative path for the project root." },
      },
      required: ["project"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "ithyno_phase",
    description: "Update a change phase through the shared local bridge.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Absolute or relative path for the project root." },
        changeId: { type: "string" },
        phase: { type: "string" },
        message: { type: "string" },
      },
      required: ["project", "changeId", "phase"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "ithyno_jobs",
    description: "Inspect all jobs for the project through the bridge.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Absolute or relative path for the project root." },
      },
      required: ["project"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "ithyno_dispatch",
    description: "Dispatch a job through the bridge with a validated project and operation policy.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Absolute or relative path for the project root." },
        changeId: { type: "string" },
        role: { type: "string" },
      },
      required: ["project", "changeId", "role"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

function projectPayload(project: string | undefined) {
  const root = canonicalProjectRoot(project ?? process.cwd());
  return {
    projectRoot: root,
    projectHash: stableProjectHash(root),
  };
}

async function handleBridgeTool(name: string, args: Record<string, unknown> | undefined) {
  const payload = projectPayload(typeof args?.project === "string" ? args.project : undefined);
  const status = await bridgeStatus(payload.projectRoot);
  if (!status.ok) {
    return {
      ok: false,
      ...payload,
      code: status.code ?? "unavailable",
      error: status.error ?? "no live bridge runtime was registered for this project",
    };
  }

  switch (name) {
    case "ithyno_status": {
      return { ok: true, ...payload, runtime: status.runtime ?? null, bridge: status };
    }
    case "ithyno_changes": {
      const result = await callBridgeOperation(payload.projectRoot, "changes", {}, process.cwd());
      return { ok: result.ok, ...payload, runtime: status.runtime ?? null, result: result.result ?? null, error: result.error ?? null };
    }
    case "ithyno_phase": {
      if (typeof args?.changeId !== "string" || typeof args?.phase !== "string") {
        return { ok: false, ...payload, runtime: status.runtime ?? null, error: "changeId and phase are required" };
      }
      const response = await callBridgeOperation(payload.projectRoot, "phase", { changeId: args.changeId, phase: args.phase, message: args.message ?? "" }, process.cwd());
      return { ok: response.ok, ...payload, runtime: status.runtime ?? null, result: response.result ?? null, error: response.error ?? null };
    }
    case "ithyno_jobs": {
      const response = await callBridgeOperation(payload.projectRoot, "jobs", {}, process.cwd());
      return { ok: response.ok, ...payload, runtime: status.runtime ?? null, result: response.result ?? null, error: response.error ?? null };
    }
    case "ithyno_dispatch": {
      if (typeof args?.changeId !== "string" || typeof args?.role !== "string") {
        return { ok: false, ...payload, runtime: status.runtime ?? null, error: "changeId and role are required" };
      }
      const response = await callBridgeOperation(payload.projectRoot, "dispatch", { changeId: args.changeId, role: args.role }, process.cwd());
      return { ok: response.ok, ...payload, runtime: status.runtime ?? null, result: response.result ?? null, error: response.error ?? null };
    }
    default:
      return { ok: false, ...payload, error: `unsupported tool: ${String(name)}` };
  }
}

export async function serveMcpBridge(): Promise<void> {
  const server = new Server(
    {
      name: "ithyno-bridge",
      version: "0.9.0-alpha.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));
  server.setRequestHandler(InitializeRequestSchema, async () => ({
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "ithyno-bridge", version: "0.9.0-alpha.0" },
    instructions: "Resolve the exact project root for each request and call the shared ithyno bridge. Never guess a localhost port, scan ports, or print or retrieve dashboard tokens.",
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const response = await handleBridgeTool(String(name), (args ?? {}) as Record<string, unknown>);
    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
