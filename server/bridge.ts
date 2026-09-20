import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, connect as netConnect, type Socket } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveOpenspecDir, scanWorkspace } from "./parser/workspace.js";
import { appendAnswer, parseNeedsHuman } from "./needs-human.js";
import { extractSidecarFields, readSidecar, writeSidecar } from "./sidecar.js";
import { parseManagerActivityBody, setManagerActivity } from "./manager-activity.js";
import { PHASES, isPhase, isReservedPhase } from "./phases.js";
import { AgentRegistry } from "./agents/registry.js";
import { AgentRunner, type RunnerExecutionMode } from "./agents/runner.js";
import { validateRunPayload } from "./agents/run-validation.js";

export type BridgeProtocolVersion = "1";

export type BridgeRuntimeDescriptor = {
  projectRoot: string;
  projectHash: string;
  ipcAddress: string;
  pid: number;
  processStartIdentity: string;
  protocolVersion: BridgeProtocolVersion;
  generation: number;
};

export type BridgeCommandResult = {
  ok: boolean;
  projectRoot: string;
  projectHash: string;
  runtime?: BridgeRuntimeDescriptor;
  error?: string;
  code?: "unavailable" | "permission" | "validation" | "timeout" | "stale" | "unsupported";
};

export type BridgeOperationName =
  | "status"
  | "changes"
  | "phase"
  | "activity"
  | "dispatch"
  | "jobs"
  | "job.cancel"
  | "needs-human.read"
  | "needs-human.answer";

export type BridgeOperationPolicy = "read-only" | "workflow-write";

export const BRIDGE_OPERATION_CATALOG: Readonly<Record<BridgeOperationName, BridgeOperationPolicy>> = Object.freeze({
  status: "read-only",
  changes: "read-only",
  phase: "workflow-write",
  activity: "workflow-write",
  dispatch: "workflow-write",
  jobs: "read-only",
  "job.cancel": "workflow-write",
  "needs-human.read": "read-only",
  "needs-human.answer": "workflow-write",
});

export type BridgeAuditEvent = {
  version: "1";
  operation: BridgeOperationName;
  policy: BridgeOperationPolicy;
  projectHash: string;
  changeId?: string;
  jobId?: string;
  outcome: "success";
  at: string;
};

export type BridgeRequest = {
  protocolVersion: BridgeProtocolVersion;
  requestId: string;
  operation: BridgeOperationName;
  projectRoot: string;
  projectHash: string;
  params: Record<string, unknown>;
  deadlineMs: number;
};

export type BridgeResponse = {
  protocolVersion: BridgeProtocolVersion;
  requestId: string;
  ok: boolean;
  projectRoot: string;
  projectHash: string;
  code?: BridgeCommandResult["code"];
  error?: string;
  result?: unknown;
};

export const BRIDGE_PROTOCOL_VERSION: BridgeProtocolVersion = "1";
export const BRIDGE_MAX_MESSAGE_BYTES = 256 * 1024;
export const BRIDGE_DEFAULT_DEADLINE_MS = 5_000;
export const BRIDGE_MAX_DEADLINE_MS = 30 * 60_000;

export function canonicalProjectRoot(projectPath?: string, cwd = process.cwd()): string {
  const raw = projectPath && projectPath.trim() ? projectPath : cwd;
  const absolute = resolve(raw);
  try {
    return realpathSync(absolute, { encoding: "utf8" });
  } catch {
    return absolute;
  }
}

export function canonicalProjectIdentity(projectPath?: string, cwd = process.cwd()): string {
  const root = canonicalProjectRoot(projectPath, cwd);
  return process.platform === "win32" ? root.replace(/[/\\]+$/u, "").toLowerCase() : root;
}

export function stableProjectHash(projectPath?: string, cwd = process.cwd()): string {
  return createHash("sha256").update(canonicalProjectIdentity(projectPath, cwd)).digest("hex");
}

export function bridgeRuntimeDirectory(): string {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(base, "ithyno", "runtime");
  }
  const runtimeBase = process.env.XDG_RUNTIME_DIR ?? join(homedir(), ".ithyno", "runtime");
  return resolve(runtimeBase);
}

export function bridgeRuntimeFile(projectPath?: string, cwd = process.cwd()): string {
  return join(bridgeRuntimeDirectory(), `${stableProjectHash(projectPath, cwd)}.json`);
}

export function buildBridgeIpcAddress(projectPath?: string, cwd = process.cwd()): string {
  const hash = stableProjectHash(projectPath, cwd);
  if (process.platform === "win32") {
    // LOCAL scopes packaged Windows clients to the caller's login session.
    // Node's readableAll/writableAll defaults stay disabled when listening,
    // so libuv uses the creator-owner DACL rather than widening the pipe.
    return `\\.\pipe\LOCAL\ithyno-${hash}`;
  }
  const dir = bridgeRuntimeDirectory();
  return join(dir, `bridge-${hash}.sock`);
}

export function resolveBridgeProject(projectPath?: string, cwd = process.cwd()): string {
  return canonicalProjectRoot(projectPath, cwd);
}

export function isBridgeRuntimeAlive(descriptor: Pick<BridgeRuntimeDescriptor, "pid">): boolean {
  try {
    process.kill(descriptor.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeBridgeValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => sanitizeBridgeValue(entry)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (
        lowered.includes("token") ||
        lowered.includes("secret") ||
        lowered.includes("password") ||
        lowered.includes("authorization") ||
        lowered.includes("cookie") ||
        lowered.includes("dotenv") ||
        lowered === "key"
      ) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeBridgeValue(entry);
    }
    return out as T;
  }
  return value;
}

export function listBridgeOperations(): string[] {
  return [
    "status",
    "changes",
    "phase",
    "activity",
    "dispatch",
    "jobs",
    "job.cancel",
    "needs-human.read",
    "needs-human.answer",
  ];
}

export function validateBridgeRequest(request: unknown): { request: BridgeRequest; error?: string } {
  if (!request || typeof request !== "object") {
    return { request: null as never, error: "request must be an object" };
  }
  const candidate = request as Record<string, unknown>;
  if (candidate.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
    return { request: null as never, error: "unsupported protocol version" };
  }
  if (typeof candidate.requestId !== "string" || !candidate.requestId.trim()) {
    return { request: null as never, error: "requestId is required" };
  }
  if (typeof candidate.operation !== "string" || !listBridgeOperations().includes(candidate.operation)) {
    return { request: null as never, error: `unsupported operation: ${String(candidate.operation ?? "unknown")}` };
  }
  if (typeof candidate.projectRoot !== "string" || !candidate.projectRoot.trim()) {
    return { request: null as never, error: "projectRoot is required" };
  }
  if (typeof candidate.projectHash !== "string" || !candidate.projectHash.trim()) {
    return { request: null as never, error: "projectHash is required" };
  }
  if (candidate.params === undefined || candidate.params === null || typeof candidate.params !== "object") {
    return { request: null as never, error: "params must be an object" };
  }
  const deadlineMs = Number(candidate.deadlineMs ?? BRIDGE_DEFAULT_DEADLINE_MS);
  if (!Number.isInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > BRIDGE_MAX_DEADLINE_MS) {
    return { request: null as never, error: `deadlineMs must be within 1..${BRIDGE_MAX_DEADLINE_MS}` };
  }
  return {
    request: {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: candidate.requestId,
      operation: candidate.operation as BridgeOperationName,
      projectRoot: candidate.projectRoot,
      projectHash: candidate.projectHash,
      params: candidate.params as Record<string, unknown>,
      deadlineMs,
    },
  };
}

export type BridgeOperationContext = {
  registry?: AgentRegistry;
  runner?: AgentRunner;
  audit?: (event: BridgeAuditEvent) => void | Promise<void>;
};

async function emitBridgeAudit(
  context: BridgeOperationContext,
  operation: BridgeOperationName,
  projectRoot: string,
  params: Record<string, unknown>,
  result: unknown,
): Promise<void> {
  if (BRIDGE_OPERATION_CATALOG[operation] !== "workflow-write") return;
  const resultRecord = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const event: BridgeAuditEvent = {
    version: "1",
    operation,
    policy: "workflow-write",
    projectHash: stableProjectHash(projectRoot),
    ...(typeof params.changeId === "string" ? { changeId: params.changeId } : {}),
    ...(typeof resultRecord.jobId === "string"
      ? { jobId: resultRecord.jobId }
      : typeof params.jobId === "string"
        ? { jobId: params.jobId }
        : {}),
    outcome: "success",
    at: new Date().toISOString(),
  };
  if (context.audit) {
    await context.audit(event);
  } else {
    console.info(`[bridge-audit] ${JSON.stringify(event)}`);
  }
}

export async function handleBridgeOperation(
  operation: BridgeOperationName,
  params: Record<string, unknown>,
  projectRoot: string,
  context: BridgeOperationContext = {},
): Promise<unknown> {
  const projectRootCanonical = canonicalProjectRoot(projectRoot);
  const projectHash = stableProjectHash(projectRootCanonical);
  const currentOpenspecDir = resolveOpenspecDir(projectRootCanonical);
  const policy = BRIDGE_OPERATION_CATALOG[operation];
  if (!policy) throw new Error(`operation '${String(operation)}' is not present in the bridge policy catalog`);

  switch (operation) {
    case "status":
      return {
        ok: true,
        projectRoot: projectRootCanonical,
        projectHash,
        runtime: {
          projectRoot: projectRootCanonical,
          projectHash,
          pid: process.pid,
          ipcAddress: buildBridgeIpcAddress(projectRootCanonical),
          processStartIdentity: `${process.pid}:${process.ppid}`,
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          generation: 1,
        },
      };
    case "changes": {
      if (!currentOpenspecDir) return { ok: true, items: [] };
      const workspace = await scanWorkspace(currentOpenspecDir, projectRootCanonical);
      return {
        ok: true,
        items: workspace.changes.map((change) => ({
          id: change.id,
          phase: change.phase ?? null,
          progress: change.progress,
          proposal: change.proposal?.intent ?? change.proposal?.scope ?? null,
        })),
      };
    }
    case "phase": {
      const changeId = typeof params.changeId === "string" ? params.changeId : "";
      const requested = typeof params.phase === "string" ? params.phase : "";
      if (!changeId) throw new Error("changeId is required for phase operations");
      if (!requested) throw new Error("phase is required for phase operations");
      if (isReservedPhase(requested)) {
        throw new Error(`phase '${requested}' is reserved for Phase 4 and is not supported over the bridge`);
      }
      if (!isPhase(requested)) {
        throw new Error(`unknown phase '${String(requested)}'; expected one of ${PHASES.join(", ")}`);
      }
      const raw = await readSidecar(projectRootCanonical, changeId);
      const current = extractSidecarFields(raw, changeId);
      if (current.phase === requested) {
        const result = { ok: true, changeId, phase: requested };
        await emitBridgeAudit(context, operation, projectRootCanonical, params, result);
        return result;
      }
      await writeSidecar(projectRootCanonical, changeId, { phase: requested }, undefined);
      const result = { ok: true, changeId, phase: requested };
      await emitBridgeAudit(context, operation, projectRootCanonical, params, result);
      return result;
    }
    case "activity": {
      const changeId = typeof params.changeId === "string" ? params.changeId : "";
      const activity = typeof params.activity === "string" ? params.activity : "idle";
      if (!changeId) throw new Error("changeId is required for activity operations");
      const parsed = parseManagerActivityBody({
        changeId,
        activity,
        ...(typeof params.role === "string" ? { role: params.role } : {}),
        ...(typeof params.detail === "string" ? { detail: params.detail } : {}),
      });
      if (!parsed.ok) throw new Error(parsed.error);
      const record = setManagerActivity(parsed.value);
      const result = { ok: true, changeId, activity: record, phase: null };
      await emitBridgeAudit(context, operation, projectRootCanonical, params, result);
      return result;
    }
    case "dispatch": {
      const changeId = typeof params.changeId === "string" ? params.changeId : "";
      const runBody = {
        changeId,
        agentName: typeof params.agentName === "string" ? params.agentName : undefined,
        role: typeof params.role === "string" ? params.role : undefined,
        executionMode: (typeof params.executionMode === "string" && (params.executionMode === "worktree" || params.executionMode === "main-tree")
          ? params.executionMode
          : undefined) as RunnerExecutionMode | undefined,
        prompt: typeof params.prompt === "string" ? params.prompt : undefined,
        wait: typeof params.wait === "boolean" ? params.wait : undefined,
        timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
      };
      const validation = validateRunPayload(runBody);
      if (!validation.ok) throw new Error(validation.error);
      const { data } = validation;
      const registry = context.registry ?? new AgentRegistry(projectRootCanonical);
      await registry.load();
      const cfg = registry.publicConfig();
      if (!cfg.ok || cfg.agents.length === 0) {
        throw new Error("no agents are configured for this project");
      }
      const agentName =
        data.agentName ??
        cfg.agents.find((agent) => agent.roles.includes(data.role ?? "code"))?.name ??
        cfg.agents[0].name;
      const runner = context.runner ?? new AgentRunner(projectRootCanonical, registry, () => undefined);
      const result = await runner.run(
        data.changeId,
        agentName,
        data.role ?? "code",
        data.executionMode ?? "worktree",
        data.prompt ?? undefined,
      );
      if (!result.ok) throw new Error(result.reason);
      const response = {
        ok: true,
        jobId: result.job.id,
        changeId: data.changeId,
        role: result.job.role ?? (data.role ?? "code"),
        status: result.job.status,
      };
      if (data.wait) {
        const waitResult = await runner.waitForCompletion(result.job.id, {
          timeoutMs: data.timeoutMs,
        });
        const completed = { ...response, status: waitResult.status, exitCode: waitResult.exitCode ?? null };
        await emitBridgeAudit(context, operation, projectRootCanonical, params, completed);
        return completed;
      }
      await emitBridgeAudit(context, operation, projectRootCanonical, params, response);
      return response;
    }
    case "jobs": {
      const registry = context.registry ?? new AgentRegistry(projectRootCanonical);
      await registry.load();
      const runner = context.runner ?? new AgentRunner(projectRootCanonical, registry, () => undefined);
      return { ok: true, jobs: runner.listJobs() };
    }
    case "job.cancel": {
      const jobId = typeof params.jobId === "string" ? params.jobId : "";
      if (!jobId) throw new Error("jobId is required for job cancellation");
      const registry = context.registry ?? new AgentRegistry(projectRootCanonical);
      await registry.load();
      const runner = context.runner ?? new AgentRunner(projectRootCanonical, registry, () => undefined);
      const result = runner.cancel(jobId);
      if (!result.ok) throw new Error(result.reason ?? "job cancellation failed");
      const response = { ok: true, cancelled: true, jobId };
      await emitBridgeAudit(context, operation, projectRootCanonical, params, response);
      return response;
    }
    case "needs-human.read": {
      const changeId = typeof params.changeId === "string" ? params.changeId : "";
      if (!changeId) throw new Error("changeId is required for needs-human read operations");
      const doc = await parseNeedsHuman(projectRootCanonical, changeId);
      if (!doc) {
        return { ok: true, changeId, question: null, answer: null, answered: false };
      }
      return { ok: true, changeId, question: doc.question, answer: doc.answer, answered: doc.answered };
    }
    case "needs-human.answer": {
      const changeId = typeof params.changeId === "string" ? params.changeId : "";
      const answer = typeof params.answer === "string" ? params.answer.trim() : "";
      if (!changeId) throw new Error("changeId is required for needs-human answer operations");
      if (!answer) throw new Error("answer is required for needs-human answer operations");
      const currentRaw = await readSidecar(projectRootCanonical, changeId);
      const current = extractSidecarFields(currentRaw, changeId);
      await appendAnswer(projectRootCanonical, changeId, answer);
      const restored = current.priorPhase ?? "proposed";
      await writeSidecar(projectRootCanonical, changeId, { phase: restored, priorPhase: undefined, escalatedAt: undefined }, undefined);
      const response = { ok: true, changeId, answered: true, phase: restored };
      await emitBridgeAudit(context, operation, projectRootCanonical, params, response);
      return response;
    }
    default:
      throw new Error(`unsupported operation: ${String(operation)}`);
  }
}

export async function readBridgeRuntime(projectPath?: string, cwd = process.cwd()): Promise<BridgeRuntimeDescriptor | null> {
  const file = bridgeRuntimeFile(projectPath, cwd);
  if (!existsSync(file)) return null;
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<BridgeRuntimeDescriptor>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.projectRoot !== "string" || typeof parsed.projectHash !== "string") return null;
    if (typeof parsed.ipcAddress !== "string" || typeof parsed.pid !== "number") return null;
    if (typeof parsed.processStartIdentity !== "string" || typeof parsed.protocolVersion !== "string") return null;
    const descriptor: BridgeRuntimeDescriptor = {
      projectRoot: parsed.projectRoot,
      projectHash: parsed.projectHash,
      ipcAddress: parsed.ipcAddress,
      pid: parsed.pid,
      processStartIdentity: parsed.processStartIdentity,
      protocolVersion: parsed.protocolVersion === "1" ? "1" : "1",
      generation: typeof parsed.generation === "number" ? parsed.generation : 1,
    };
    if (!isBridgeRuntimeAlive(descriptor)) {
      await pruneBridgeRuntime(descriptor.projectRoot);
      return null;
    }
    return descriptor;
  } catch {
    return null;
  }
}

export async function registerBridgeRuntime(projectPath?: string, cwd = process.cwd(), overrides: Partial<BridgeRuntimeDescriptor> = {}): Promise<BridgeRuntimeDescriptor> {
  const projectRoot = canonicalProjectRoot(projectPath, cwd);
  const projectHash = stableProjectHash(projectRoot);
  const runtimeDir = bridgeRuntimeDirectory();
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    await chmod(runtimeDir, 0o700).catch(() => undefined);
  }

  const existing = await readBridgeRuntime(projectRoot, cwd);
  const descriptor: BridgeRuntimeDescriptor = {
    projectRoot,
    projectHash,
    ipcAddress: overrides.ipcAddress ?? buildBridgeIpcAddress(projectRoot),
    pid: overrides.pid ?? process.pid,
    processStartIdentity: overrides.processStartIdentity ?? `${process.pid}:${process.ppid}:${Date.now()}:${randomUUID()}`,
    protocolVersion: overrides.protocolVersion ?? "1",
    generation: overrides.generation ?? (existing ? existing.generation + 1 : 1),
  };

  const file = bridgeRuntimeFile(projectRoot);
  await writeFile(file, JSON.stringify(descriptor, null, 2), { mode: 0o600, encoding: "utf8" });
  return descriptor;
}

export async function unregisterBridgeRuntime(projectPath?: string, cwd = process.cwd()): Promise<void> {
  const file = bridgeRuntimeFile(projectPath, cwd);
  await rm(file, { force: true });
}

export async function listBridgeRuntimeFiles(): Promise<string[]> {
  const dir = bridgeRuntimeDirectory();
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

export async function pruneBridgeRuntime(projectPath?: string, cwd = process.cwd()): Promise<boolean> {
  const target = bridgeRuntimeFile(projectPath, cwd);
  try {
    await rm(target, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function pruneStaleBridgeRuntimes(): Promise<number> {
  let pruned = 0;
  for (const file of await listBridgeRuntimeFiles()) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as Partial<BridgeRuntimeDescriptor>;
      if (!parsed || typeof parsed.pid !== "number") {
        await rm(file, { force: true });
        pruned += 1;
        continue;
      }
      if (!isBridgeRuntimeAlive(parsed as Pick<BridgeRuntimeDescriptor, "pid">)) {
        await rm(file, { force: true });
        pruned += 1;
      }
    } catch {
      await rm(file, { force: true });
      pruned += 1;
    }
  }
  return pruned;
}

export async function lookupBridgeRuntime(projectPath?: string, cwd = process.cwd()): Promise<BridgeRuntimeDescriptor | null> {
  const exact = canonicalProjectRoot(projectPath, cwd);
  return readBridgeRuntime(exact);
}

export function bridgeUnsupportedReason(): string | undefined {
  if (process.platform === "win32") {
    return "Windows bridge writes are disabled until the current-user SID ACL and remote-client rejection behavior are implemented and verified on Windows";
  }
  return undefined;
}

export function windowsPipeSecurityDescription(): string {
  return "LOCAL login-session namespace; exclusive listener; readableAll=false; writableAll=false; duplex requests require creator-owner read/write access";
}

export async function bridgeStatus(projectPath?: string, cwd = process.cwd()): Promise<BridgeCommandResult> {
  const projectRoot = resolveBridgeProject(projectPath, cwd);
  const unsupported = bridgeUnsupportedReason();
  if (unsupported) {
    return {
      ok: false,
      projectRoot,
      projectHash: stableProjectHash(projectRoot),
      error: unsupported,
      code: "unsupported",
    };
  }

  const runtime = await lookupBridgeRuntime(projectRoot);
  if (!runtime) {
    return {
      ok: false,
      projectRoot,
      projectHash: stableProjectHash(projectRoot),
      error: "no live bridge runtime was registered for this project; no fixed-port or localhost fallback is used",
      code: "unavailable",
    };
  }

  return {
    ok: true,
    projectRoot,
    projectHash: runtime.projectHash,
    runtime,
  };
}

export function sanitizeBridgeError(code: BridgeCommandResult["code"], message: string): BridgeCommandResult {
  return {
    ok: false,
    projectRoot: canonicalProjectRoot(),
    projectHash: stableProjectHash(),
    error: message,
    code,
  };
}

export async function ensureNoBridgePortFallback(): Promise<void> {
  await pruneStaleBridgeRuntimes();
}

export function projectHashForTests(projectPath?: string, cwd = process.cwd()): string {
  return stableProjectHash(projectPath, cwd);
}

export function buildBridgeEnvelope<T>(request: BridgeRequest, result: T): BridgeResponse {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: true,
    projectRoot: request.projectRoot,
    projectHash: request.projectHash,
    result: sanitizeBridgeValue(result),
  };
}

export function buildBridgeErrorEnvelope(request: BridgeRequest, code: BridgeCommandResult["code"], message: string): BridgeResponse {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: false,
    projectRoot: request.projectRoot,
    projectHash: request.projectHash,
    code,
    error: message,
  };
}

async function readBridgeMessage(socket: Socket): Promise<BridgeRequest | null> {
  return new Promise((resolve) => {
    let buffer = "";
    const flush = () => {
      const candidate = buffer.trim();
      if (!candidate) return;
      if (candidate.length > BRIDGE_MAX_MESSAGE_BYTES) {
        socket.off("data", onData);
        socket.off("error", onError);
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(candidate) as unknown;
        const valid = validateBridgeRequest(parsed);
        if (valid.error) {
          socket.off("data", onData);
          socket.off("error", onError);
          resolve(null);
          return;
        }
        socket.off("data", onData);
        socket.off("error", onError);
        resolve(valid.request);
      } catch {
        socket.off("data", onData);
        socket.off("error", onError);
        resolve(null);
      }
    };
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > BRIDGE_MAX_MESSAGE_BYTES) {
        socket.off("data", onData);
        socket.off("error", onError);
        resolve(null);
        return;
      }
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex >= 0) {
        const frame = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (frame) {
          const parsed = JSON.parse(frame) as unknown;
          const valid = validateBridgeRequest(parsed);
          if (valid.error) {
            socket.off("data", onData);
            socket.off("error", onError);
            resolve(null);
            return;
          }
          socket.off("data", onData);
          socket.off("error", onError);
          resolve(valid.request);
          return;
        }
      }
      if (buffer.trim().startsWith("{") && buffer.trim().endsWith("}")) {
        flush();
      }
    };
    const onError = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      resolve(null);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

export async function callBridgeOperation(
  projectPath: string,
  operation: BridgeOperationName,
  params: Record<string, unknown> = {},
  cwd = process.cwd(),
): Promise<BridgeResponse> {
  const projectRoot = canonicalProjectRoot(projectPath, cwd);
  const requestedWaitMs = operation === "dispatch" && params.wait === true && typeof params.timeoutMs === "number"
    ? params.timeoutMs + 30_000
    : BRIDGE_DEFAULT_DEADLINE_MS;
  const deadlineMs = Math.max(1, Math.min(BRIDGE_MAX_DEADLINE_MS, Math.trunc(requestedWaitMs)));
  const unsupported = bridgeUnsupportedReason();
  if (unsupported) {
    return buildBridgeErrorEnvelope(
      {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: randomUUID(),
        operation,
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        params,
        deadlineMs,
      },
      "unsupported",
      unsupported,
    );
  }

  const runtime = await lookupBridgeRuntime(projectRoot, cwd);
  if (!runtime) {
    return buildBridgeErrorEnvelope(
      {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: randomUUID(),
        operation,
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        params,
        deadlineMs,
      },
      "unavailable",
      "no live bridge runtime was registered for this project; no fixed-port or localhost fallback is used",
    );
  }

  const request: BridgeRequest = {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId: randomUUID(),
    operation,
    projectRoot,
    projectHash: runtime.projectHash,
    params: sanitizeBridgeValue(params),
    deadlineMs,
  };

  try {
    const payload = `${JSON.stringify(request)}\n`;
    const response = await new Promise<BridgeResponse | null>((resolve) => {
      const socket = netConnect(runtime.ipcAddress, () => {
        socket.write(payload);
      });
      const onError = () => resolve(buildBridgeErrorEnvelope(request, "unavailable", "bridge IPC endpoint is not reachable"));
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(buildBridgeErrorEnvelope(request, "timeout", "bridge operation timed out"));
      }, request.deadlineMs);
      let buffer = "";
      const flush = () => {
        const text = buffer.trim();
        if (!text) return;
        try {
          const parsed = JSON.parse(text) as BridgeResponse;
          clearTimeout(timer);
          socket.destroy();
          resolve({
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            requestId: parsed.requestId ?? request.requestId,
            ok: Boolean(parsed.ok),
            projectRoot: parsed.projectRoot ?? request.projectRoot,
            projectHash: parsed.projectHash ?? request.projectHash,
            code: parsed.code,
            error: parsed.error,
            result: sanitizeBridgeValue(parsed.result),
          });
        } catch {
          clearTimeout(timer);
          socket.destroy();
          resolve(buildBridgeErrorEnvelope(request, "validation", "bridge response was not valid JSON"));
        }
      };
      socket.on("error", onError);
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        if (buffer.length > BRIDGE_MAX_MESSAGE_BYTES) {
          clearTimeout(timer);
          socket.destroy();
          resolve(buildBridgeErrorEnvelope(request, "validation", "bridge response exceeded the maximum payload size"));
          return;
        }
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex >= 0) {
          const frame = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (frame) {
            try {
              const parsed = JSON.parse(frame) as BridgeResponse;
              clearTimeout(timer);
              socket.destroy();
              resolve({
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                requestId: parsed.requestId ?? request.requestId,
                ok: Boolean(parsed.ok),
                projectRoot: parsed.projectRoot ?? request.projectRoot,
                projectHash: parsed.projectHash ?? request.projectHash,
                code: parsed.code,
                error: parsed.error,
                result: sanitizeBridgeValue(parsed.result),
              });
            } catch {
              clearTimeout(timer);
              socket.destroy();
              resolve(buildBridgeErrorEnvelope(request, "validation", "bridge response was not valid JSON"));
            }
            return;
          }
        }
        if (buffer.trim().startsWith("{") && buffer.trim().endsWith("}")) {
          flush();
        }
      });
      socket.on("close", () => {
        clearTimeout(timer);
      });
      socket.on("end", () => {
        clearTimeout(timer);
      });
    });
    return response ?? buildBridgeErrorEnvelope(request, "unsupported", "bridge IPC request failed");
  } catch {
    return buildBridgeErrorEnvelope(request, "unsupported", "bridge IPC client failed");
  }
}

export async function startBridgeServer(
  projectPath: string,
  cwd = process.cwd(),
  context: BridgeOperationContext = {},
): Promise<{ server: ReturnType<typeof createServer>; descriptor: BridgeRuntimeDescriptor }> {
  if (process.platform === "win32") {
    const projectRoot = canonicalProjectRoot(projectPath, cwd);
    const noopServer = createServer();
    return {
      server: noopServer,
      descriptor: {
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        processStartIdentity: `${process.pid}:${process.ppid}:${Date.now()}`,
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        generation: 1,
      },
    };
  }
  const projectRoot = canonicalProjectRoot(projectPath, cwd);
  const descriptor = await registerBridgeRuntime(projectRoot, cwd, {
    ipcAddress: buildBridgeIpcAddress(projectRoot),
    pid: process.pid,
    processStartIdentity: `${process.pid}:${process.ppid}:${Date.now()}`,
  });

  const seenRequestIds = new Set<string>();
  const server = createServer(async (socket) => {
    const request = await readBridgeMessage(socket);
    if (!request) {
      socket.write(`${JSON.stringify(buildBridgeErrorEnvelope({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: randomUUID(),
        operation: "status",
        projectRoot,
        projectHash: descriptor.projectHash,
        params: {},
        deadlineMs: 5000,
      }, "validation", "request was malformed or exceeded the bridge protocol limits"))}\n`);
      socket.end();
      return;
    }
    if (request.projectHash !== descriptor.projectHash || request.projectRoot !== descriptor.projectRoot) {
      socket.write(`${JSON.stringify(buildBridgeErrorEnvelope(request, "validation", "project identity did not match the server-owned runtime descriptor"))}\n`);
      socket.end();
      return;
    }
    if (seenRequestIds.has(request.requestId)) {
      socket.write(`${JSON.stringify(buildBridgeErrorEnvelope(request, "validation", "duplicate request ID rejected"))}\n`);
      socket.end();
      return;
    }
    seenRequestIds.add(request.requestId);
    setTimeout(() => seenRequestIds.delete(request.requestId), 60_000).unref?.();
    let deadlineTimer: NodeJS.Timeout | undefined;
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        deadlineTimer = setTimeout(() => reject(new Error("BRIDGE_REQUEST_DEADLINE_EXPIRED")), request.deadlineMs);
        deadlineTimer.unref?.();
      });
      const result = await Promise.race([
        handleBridgeOperation(request.operation, request.params, request.projectRoot, context),
        deadline,
      ]);
      socket.write(`${JSON.stringify(buildBridgeEnvelope(request, result))}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "bridge operation failed";
      const timedOut = message === "BRIDGE_REQUEST_DEADLINE_EXPIRED";
      socket.write(`${JSON.stringify(buildBridgeErrorEnvelope(
        request,
        timedOut ? "timeout" : "validation",
        timedOut ? "bridge operation exceeded its declared deadline" : message,
      ))}\n`);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
    socket.end();
  });

  const socketPath = descriptor.ipcAddress;
  await rm(socketPath, { force: true });
  await mkdir(join(socketPath, ".."), { recursive: true, mode: 0o700 });
  await new Promise<void>((resolve, reject) => {
    server.listen({
      path: socketPath,
      exclusive: true,
    }, () => {
      chmod(socketPath, 0o600).catch(() => undefined);
      resolve();
    });
    server.on("error", reject);
  });

  return { server, descriptor };
}

export async function stopBridgeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  }).catch(() => undefined);
}

export async function ensureBridgeRuntimeDirectory(): Promise<string> {
  const dir = bridgeRuntimeDirectory();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    await chmod(dir, 0o700).catch(() => undefined);
  }
  return dir;
}

export function projectHashForBridge(projectPath?: string, cwd = process.cwd()): string {
  return stableProjectHash(projectPath, cwd);
}

export function isBridgeRuntimeDescriptor(value: unknown): value is BridgeRuntimeDescriptor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.projectRoot === "string" &&
    typeof candidate.projectHash === "string" &&
    typeof candidate.ipcAddress === "string" &&
    typeof candidate.pid === "number" &&
    typeof candidate.processStartIdentity === "string" &&
    candidate.protocolVersion === "1" &&
    typeof candidate.generation === "number"
  );
}

export function isBridgeProtocolResponse(value: unknown): value is BridgeResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.protocolVersion === "1" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.projectRoot === "string" &&
    typeof candidate.projectHash === "string" &&
    typeof candidate.ok === "boolean"
  );
}

export function canonicalProjectMatch(projectPath: string, descriptor: BridgeRuntimeDescriptor | null, cwd = process.cwd()): boolean {
  if (!descriptor) return false;
  return canonicalProjectRoot(projectPath, cwd) === descriptor.projectRoot;
}
