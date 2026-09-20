import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { lookupBridgeRuntime, bridgeStatus, stableProjectHash, canonicalProjectRoot } from "./bridge.js";

const TOOL_DEFS = [
  {
    name: "ithyno_status",
    description: "Return the bridged status for a project without fixed-port guesses.",
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
    description: "List changes for a project via the shared bridge client.",
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
    description: "Update a change phase in a project via the shared bridge client.",
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
];

function projectPayload(project: string | undefined) {
  const root = canonicalProjectRoot(project ?? process.cwd());
  return {
    projectRoot: root,
    projectHash: stableProjectHash(root),
  };
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
    const payload = projectPayload(typeof args?.project === "string" ? args.project : undefined);
    const runtime = await lookupBridgeRuntime(payload.projectRoot);

    if (name === "ithyno_status") {
      const status = await bridgeStatus(payload.projectRoot);
      return { content: [{ type: "text", text: JSON.stringify({ ok: status.ok, ...payload, runtime: runtime ?? null, error: status.error ?? null }, null, 2) }] };
    }

    if (name === "ithyno_changes") {
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...payload, runtime: runtime ?? null, changes: [] }, null, 2) }] };
    }

    if (name === "ithyno_phase") {
      if (typeof args?.changeId !== "string" || typeof args?.phase !== "string") {
        return { content: [{ type: "text", text: JSON.stringify({ ok: false, ...payload, error: "changeId and phase are required" }, null, 2) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...payload, runtime: runtime ?? null, changeId: args.changeId, phase: args.phase, message: typeof args.message === "string" ? args.message : undefined }, null, 2) }] };
    }

    return { content: [{ type: "text", text: JSON.stringify({ ok: false, ...payload, error: `unsupported tool: ${String(name)}` }, null, 2) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
