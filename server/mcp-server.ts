import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { bridgeStatus, callBridgeOperation, canonicalProjectRoot, stableProjectHash } from "./bridge.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const TOOL_DEFS = [
  {
    name: "ithyno_activity",
    description: "Publish or clear Manager activity for one change.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        changeId: { type: "string" },
        role: { type: "string", enum: ["propose", "code", "review", "verify"] },
        activity: { type: "string", enum: ["dispatching", "waiting", "judging", "cleanup", "transitioning", "idle"] },
        detail: { type: "string" },
      },
      required: ["project", "changeId", "activity"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
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
        agentName: { type: "string" },
        executionMode: { type: "string", enum: ["worktree", "main-tree"] },
        prompt: { type: "string" },
        wait: { type: "boolean" },
        timeoutMs: { type: "integer", minimum: 1 },
      },
      required: ["project", "changeId", "role"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "ithyno_cancel_job",
    description: "Cancel a running AgentRunner job.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" }, jobId: { type: "string" } },
      required: ["project", "jobId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "ithyno_needs_human",
    description: "Read the current needs-human question and answer state.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" }, changeId: { type: "string" } },
      required: ["project", "changeId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "ithyno_answer_needs_human",
    description: "Submit an answer to a needs-human question.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" }, changeId: { type: "string" }, answer: { type: "string" } },
      required: ["project", "changeId", "answer"],
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

export async function handleBridgeTool(name: string, args: Record<string, unknown> | undefined) {
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
    case "ithyno_activity": {
      if (typeof args?.changeId !== "string" || typeof args?.activity !== "string") {
        return { ok: false, ...payload, runtime: status.runtime ?? null, error: "changeId and activity are required" };
      }
      const role = typeof args?.role === "string" ? args.role : undefined;
      if (args?.activity !== "idle" && !role) {
        return { ok: false, ...payload, runtime: status.runtime ?? null, error: "role is required for non-idle activity" };
      }
      if (role && !["propose", "code", "review", "verify"].includes(role)) {
        return { ok: false, ...payload, runtime: status.runtime ?? null, error: "role must be one of: propose, code, review, verify" };
      }
      const response = await callBridgeOperation(payload.projectRoot, "activity", {
        changeId: args.changeId,
        ...(role ? { role } : {}),
        activity: args.activity,
        detail: typeof args.detail === "string" ? args.detail : "",
      }, process.cwd());
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
      const response = await callBridgeOperation(payload.projectRoot, "dispatch", {
        changeId: args.changeId,
        role: args.role,
        ...(typeof args.agentName === "string" ? { agentName: args.agentName } : {}),
        ...(typeof args.executionMode === "string" ? { executionMode: args.executionMode } : {}),
        ...(typeof args.prompt === "string" ? { prompt: args.prompt } : {}),
        ...(typeof args.wait === "boolean" ? { wait: args.wait } : {}),
        ...(typeof args.timeoutMs === "number" ? { timeoutMs: args.timeoutMs } : {}),
      }, process.cwd());
      return { ok: response.ok, ...payload, runtime: status.runtime ?? null, result: response.result ?? null, error: response.error ?? null };
    }
    case "ithyno_cancel_job": {
      if (typeof args?.jobId !== "string") {
        return { ok: false, ...payload, runtime: status.runtime ?? null, error: "jobId is required" };
      }
      const response = await callBridgeOperation(payload.projectRoot, "job.cancel", { jobId: args.jobId }, process.cwd());
      return { ok: response.ok, ...payload, runtime: status.runtime ?? null, result: response.result ?? null, error: response.error ?? null };
    }
    case "ithyno_needs_human": {
      if (typeof args?.changeId !== "string") {
        return { ok: false, ...payload, runtime: status.runtime ?? null, error: "changeId is required" };
      }
      const response = await callBridgeOperation(payload.projectRoot, "needs-human.read", { changeId: args.changeId }, process.cwd());
      return { ok: response.ok, ...payload, runtime: status.runtime ?? null, result: response.result ?? null, error: response.error ?? null };
    }
    case "ithyno_answer_needs_human": {
      if (typeof args?.changeId !== "string" || typeof args?.answer !== "string") {
        return { ok: false, ...payload, runtime: status.runtime ?? null, error: "changeId and answer are required" };
      }
      const response = await callBridgeOperation(payload.projectRoot, "needs-human.answer", { changeId: args.changeId, answer: args.answer }, process.cwd());
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
    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      structuredContent: response,
      isError: !response.ok,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const thisFile = resolve(fileURLToPath(import.meta.url));
if (invokedPath && invokedPath === thisFile) {
  serveMcpBridge().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ithyno-mcp] ${message}`);
    process.exitCode = 1;
  });
}
