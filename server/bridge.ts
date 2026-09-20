import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createServer, connect as netConnect } from "node:net";
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
  generation: number;
  processStartIdentity: string;
  params: Record<string, unknown>;
  deadlineMs: number;
};

export type BridgeResponse = {
  protocolVersion: BridgeProtocolVersion;
  requestId: string;
  ok: boolean;
  projectRoot: string;
  projectHash: string;
  generation: number;
  processStartIdentity: string;
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

export function parseLinuxProcessStartIdentity(raw: string, pid = process.pid): string | null {
  const closeParen = raw.lastIndexOf(")");
  if (closeParen < 0) return null;
  const tail = raw.slice(closeParen + 1).trim();
  const fields = tail.split(/\s+/u);
  const startTicks = fields[19];
  return startTicks ? `${pid}:${startTicks}` : null;
}

export function currentProcessStartIdentity(pid = process.pid): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform === "linux") {
    try {
      const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
      return parseLinuxProcessStartIdentity(raw, pid);
    } catch {
      return null;
    }
  }
  if (process.platform === "darwin") {
    try {
      const out = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).stdout ?? "";
      const value = out.trim().replace(/\s+/g, " ");
      return value ? `${pid}:${value}` : null;
    } catch {
      return null;
    }
  }
  return `${pid}:${process.ppid}:${Date.now()}`;
}

export function isBridgeRuntimeAlive(descriptor: Pick<BridgeRuntimeDescriptor, "pid">): boolean {
  try {
    process.kill(descriptor.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isBridgeRuntimeCurrent(descriptor: Partial<BridgeRuntimeDescriptor>): boolean {
  if (!descriptor || typeof descriptor.pid !== "number" || !Number.isFinite(descriptor.pid)) return false;
  if (!isBridgeRuntimeAlive(descriptor as Pick<BridgeRuntimeDescriptor, "pid">)) return false;
  if (typeof descriptor.processStartIdentity !== "string" || !descriptor.processStartIdentity.trim()) return false;
  if (typeof descriptor.generation !== "number" || !Number.isInteger(descriptor.generation) || descriptor.generation < 1) return false;
  const liveIdentity = currentProcessStartIdentity(descriptor.pid);
  if (!liveIdentity) return false;
  return descriptor.processStartIdentity === liveIdentity;
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
        lowered.includes("key")
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
  if (typeof candidate.generation !== "number" || !Number.isInteger(candidate.generation) || candidate.generation < 1) {
    return { request: null as never, error: "generation is required" };
  }
  if (typeof candidate.processStartIdentity !== "string" || !candidate.processStartIdentity.trim()) {
    return { request: null as never, error: "processStartIdentity is required" };
  }
  if (candidate.params === undefined || candidate.params === null || typeof candidate.params !== "object") {
    return { request: null as never, error: "params must be an object" };
  }
  const deadlineMs = Number(candidate.deadlineMs ?? BRIDGE_DEFAULT_DEADLINE_MS);
  if (!Number.isInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > BRIDGE_MAX_DEADLINE_MS) {
    return { request: null as never, error: `deadlineMs must be within 1..${BRIDGE_MAX_DEADLINE_MS}` };
  }
  const projectRoot = canonicalProjectRoot(candidate.projectRoot);
  const projectHash = stableProjectHash(projectRoot);
  return {
    request: {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: candidate.requestId,
      operation: candidate.operation as BridgeOperationName,
      projectRoot,
      projectHash,
      generation: candidate.generation,
      processStartIdentity: candidate.processStartIdentity,
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

export type BridgeRuntimeValidationCode = "ok" | "permission" | "validation" | "timeout" | "stale" | "unavailable";

export type BridgeResponseMismatchKind =
  | "protocolVersion"
  | "requestId"
  | "projectRoot"
  | "projectHash"
  | "generation"
  | "processStartIdentity";

export type BridgeRuntimeValidationResult =
  | { ok: true; code: "ok"; runtime: BridgeRuntimeDescriptor; error?: undefined; canPrune: false; provenStale: false }
  | { ok: false; code: Exclude<BridgeRuntimeValidationCode, "ok">; runtime: BridgeRuntimeDescriptor; error: string; canPrune: boolean; provenStale: boolean };

export function validateBridgeRuntimeDescriptor(descriptor: Partial<BridgeRuntimeDescriptor>): { ok: true; canPrune: false; provenStale: false } | { ok: false; code: "validation" | "permission" | "stale"; error: string; canPrune: boolean; provenStale: boolean } {
  if (!descriptor || typeof descriptor !== "object") {
    return { ok: false, code: "validation", error: "runtime descriptor is missing", canPrune: false, provenStale: false };
  }
  if (!isBridgeRuntimeDescriptor(descriptor)) {
    return { ok: false, code: "validation", error: "runtime descriptor is malformed", canPrune: false, provenStale: false };
  }
  const canonicalRoot = canonicalProjectRoot(descriptor.projectRoot);
  if (descriptor.projectRoot !== canonicalRoot) {
    return { ok: false, code: "validation", error: "runtime descriptor projectRoot is not canonicalized", canPrune: false, provenStale: false };
  }
  if (descriptor.projectHash !== stableProjectHash(descriptor.projectRoot)) {
    return { ok: false, code: "validation", error: "runtime descriptor projectHash does not match the canonical project root", canPrune: false, provenStale: false };
  }
  if (descriptor.ipcAddress !== buildBridgeIpcAddress(descriptor.projectRoot)) {
    return { ok: false, code: "validation", error: "runtime descriptor IPC address does not match the canonical project root", canPrune: false, provenStale: false };
  }
  if (!isBridgeRuntimeAlive(descriptor)) {
    return { ok: false, code: "stale", error: "runtime descriptor points to a dead process", canPrune: true, provenStale: true };
  }
  const liveIdentity = currentProcessStartIdentity(descriptor.pid);
  if (!liveIdentity) {
    return { ok: false, code: "permission", error: "runtime process identity could not be proven; permission or sandboxing blocked the start-identity check", canPrune: false, provenStale: false };
  }
  if (descriptor.processStartIdentity !== liveIdentity) {
    return { ok: false, code: "stale", error: "runtime descriptor process identity differs from the live process", canPrune: true, provenStale: true };
  }
  return { ok: true, canPrune: false, provenStale: false };
}

export async function readBridgeRuntime(projectPath?: string, cwd = process.cwd()): Promise<BridgeRuntimeDescriptor | null> {
  const requestedProjectRoot = canonicalProjectRoot(projectPath, cwd);
  const expectedProjectHash = stableProjectHash(requestedProjectRoot);
  const expectedIpcAddress = buildBridgeIpcAddress(requestedProjectRoot);
  const file = bridgeRuntimeFile(requestedProjectRoot, cwd);
  if (!existsSync(file)) return null;
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<BridgeRuntimeDescriptor>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.protocolVersion !== BRIDGE_PROTOCOL_VERSION) return null;
    if (typeof parsed.projectRoot !== "string" || parsed.projectRoot !== requestedProjectRoot) return null;
    if (typeof parsed.projectHash !== "string" || parsed.projectHash !== expectedProjectHash) return null;
    if (typeof parsed.ipcAddress !== "string" || parsed.ipcAddress !== expectedIpcAddress) return null;
    if (typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid) || parsed.pid <= 0) return null;
    if (typeof parsed.processStartIdentity !== "string" || !parsed.processStartIdentity.trim()) return null;
    if (typeof parsed.generation !== "number" || !Number.isInteger(parsed.generation) || parsed.generation < 1) return null;
    const descriptor: BridgeRuntimeDescriptor = {
      projectRoot: parsed.projectRoot,
      projectHash: parsed.projectHash,
      ipcAddress: parsed.ipcAddress,
      pid: parsed.pid,
      processStartIdentity: parsed.processStartIdentity,
      protocolVersion: parsed.protocolVersion,
      generation: parsed.generation,
    };
    const validation = validateBridgeRuntimeDescriptor(descriptor);
    if (!validation.ok) {
      if (validation.provenStale && validation.canPrune) {
        await pruneBridgeRuntime(requestedProjectRoot, cwd);
      }
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
  const liveProcessIdentity = currentProcessStartIdentity(process.pid) ?? `${process.pid}:${process.ppid}:${Date.now()}:${randomUUID()}`;
  const descriptor: BridgeRuntimeDescriptor = {
    projectRoot,
    projectHash,
    ipcAddress: overrides.ipcAddress ?? buildBridgeIpcAddress(projectRoot),
    pid: overrides.pid ?? process.pid,
    processStartIdentity: overrides.processStartIdentity ?? liveProcessIdentity,
    protocolVersion: overrides.protocolVersion ?? "1",
    generation: overrides.generation ?? (existing ? existing.generation + 1 : 1),
  };

  if (existing && existing.pid === descriptor.pid && existing.processStartIdentity === descriptor.processStartIdentity) {
    descriptor.generation = existing.generation + 1;
  }

  const file = bridgeRuntimeFile(projectRoot);
  const tmp = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(descriptor, null, 2), { mode: 0o600, encoding: "utf8" });
  await chmod(tmp, 0o600).catch(() => undefined);
  await rename(tmp, file);
  await chmod(file, 0o600).catch(() => undefined);
  return descriptor;
}

export async function unregisterBridgeRuntime(
  projectPath: string | undefined,
  cwd: string,
  generation: number,
  processStartIdentity: string,
): Promise<boolean> {
  const file = bridgeRuntimeFile(projectPath, cwd);
  if (!Number.isInteger(generation) || generation < 1 || typeof processStartIdentity !== "string" || !processStartIdentity.trim()) {
    return false;
  }
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<BridgeRuntimeDescriptor>;
    if (!parsed || typeof parsed !== "object") {
      return false;
    }
    if (typeof parsed.generation !== "number" || parsed.generation !== generation) {
      return false;
    }
    if (typeof parsed.processStartIdentity !== "string" || parsed.processStartIdentity !== processStartIdentity) {
      return false;
    }
    if (typeof parsed.pid !== "number" || parsed.pid !== process.pid) {
      return false;
    }
    const liveIdentity = currentProcessStartIdentity(process.pid);
    if (!liveIdentity || parsed.processStartIdentity !== liveIdentity) {
      return false;
    }
    await rm(file, { force: true });
    return true;
  } catch {
    return false;
  }
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
      if (!parsed || typeof parsed !== "object") continue;
      if (typeof parsed.pid !== "number" || typeof parsed.processStartIdentity !== "string") continue;
      if (typeof parsed.generation !== "number" || !Number.isInteger(parsed.generation) || parsed.generation < 1) continue;
      const validation = validateBridgeRuntimeDescriptor(parsed as Partial<BridgeRuntimeDescriptor>);
      if (!validation.ok && validation.provenStale && validation.canPrune) {
        await rm(file, { force: true });
        pruned += 1;
      }
    } catch {
      // A malformed or unreadable descriptor is not proof of stale ownership; fail closed.
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

export async function probeBridgeRuntimeOwnership(runtime: BridgeRuntimeDescriptor): Promise<BridgeRuntimeValidationResult> {
  const request: BridgeRequest = {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId: randomUUID(),
    operation: "status",
    projectRoot: runtime.projectRoot,
    projectHash: runtime.projectHash,
    generation: runtime.generation,
    processStartIdentity: runtime.processStartIdentity,
    params: {},
    deadlineMs: BRIDGE_DEFAULT_DEADLINE_MS,
  };
  const payload = `${JSON.stringify(request)}\n`;
  return await new Promise((resolve) => {
    const socket = netConnect(runtime.ipcAddress);
    let settled = false;
    let buffer = "";
    const finish = (result: BridgeRuntimeValidationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const handleResponse = (text: string): void => {
      if (!text.trim()) return;
      try {
        const parsed = JSON.parse(text.trim()) as Partial<BridgeResponse>;
        const validated = validateBridgeResponse(request, parsed);
        if (validated.error) {
          const canPrune = validated.mismatch === "generation" || validated.mismatch === "processStartIdentity";
          finish({
            ok: false,
            code: canPrune ? "stale" : "validation",
            runtime,
            error: validated.error,
            canPrune,
            provenStale: canPrune,
          });
          return;
        }
        if (!validated.response.ok) {
          const code = validated.response.code === "permission" ? "permission"
            : validated.response.code === "timeout" ? "timeout"
            : validated.response.code === "stale" ? "stale"
            : "validation";
          finish({
            ok: false,
            code,
            runtime,
            error: validated.response.error ?? "ownership probe rejected the live descriptor",
            canPrune: false,
            provenStale: false,
          });
          return;
        }
        finish({ ok: true, code: "ok", runtime, canPrune: false, provenStale: false });
      } catch {
        finish({
          ok: false,
          code: "validation",
          runtime,
          error: "ownership probe received a malformed or fragmented response",
          canPrune: false,
          provenStale: false,
        });
      }
    };
    const timeoutResult: BridgeRuntimeValidationResult = {
      ok: false,
      code: "timeout",
      runtime,
      error: "ownership probe timed out before a complete response frame was received",
      canPrune: false,
      provenStale: false,
    };
    const timer = setTimeout(() => finish(timeoutResult), 1500);
    socket.setTimeout(1500);
    socket.on("timeout", () => finish(timeoutResult));
    socket.on("error", (error) => {
      const code = (error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "").toUpperCase() : "").trim();
      if (code === "EACCES" || code === "EPERM") {
        finish({
          ok: false,
          code: "permission",
          runtime,
          error: "bridge runtime ownership could not be proven because the socket was not readable by the current user",
          canPrune: false,
          provenStale: false,
        });
        return;
      }
      if (code === "ENOENT" || code === "ENOTFOUND" || code === "ECONNREFUSED") {
        finish({
          ok: false,
          code: "stale",
          runtime,
          error: "runtime socket is missing or stale; ownership could not be proven and no destructive pruning was performed",
          canPrune: false,
          provenStale: false,
        });
        return;
      }
      finish({
        ok: false,
        code: "validation",
        runtime,
        error: error instanceof Error ? error.message : "bridge IPC endpoint could not be reached",
        canPrune: false,
        provenStale: false,
      });
    });
    socket.on("connect", () => {
      socket.write(payload);
    });
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      if (buffer.length > BRIDGE_MAX_MESSAGE_BYTES) {
        finish({
          ok: false,
          code: "validation",
          runtime,
          error: "ownership probe exceeded the bridge protocol size limit while buffering a newline-delimited response",
          canPrune: false,
          provenStale: false,
        });
        return;
      }
      while (buffer.includes("\n")) {
        const newlineIndex = buffer.indexOf("\n");
        const frame = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!frame) continue;
        handleResponse(frame);
        return;
      }
    });
    socket.on("close", () => {
      if (!settled) {
        const tail = buffer.trim();
        if (tail) {
          handleResponse(tail);
          return;
        }
        finish({
          ok: false,
          code: "validation",
          runtime,
          error: "ownership probe ended before a complete newline-delimited response was received",
          canPrune: false,
          provenStale: false,
        });
      }
    });
  });
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
    const runtimeFile = bridgeRuntimeFile(projectRoot, cwd);
    const fileExists = existsSync(runtimeFile);
    if (fileExists) {
      try {
        await readFile(runtimeFile, "utf8");
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code ?? "").toUpperCase() : "";
        if (code === "EACCES" || code === "EPERM") {
          return {
            ok: false,
            projectRoot,
            projectHash: stableProjectHash(projectRoot),
            error: "bridge runtime descriptor exists but could not be read by the current user; permission is required before liveness can be proven",
            code: "permission",
          };
        }
      }
    }
    return {
      ok: false,
      projectRoot,
      projectHash: stableProjectHash(projectRoot),
      error: "no live bridge runtime was registered for this project; no fixed-port or localhost fallback is used",
      code: "unavailable",
    };
  }

  const socketChecked = await probeBridgeRuntimeOwnership(runtime);
  if (!socketChecked.ok) {
    if (socketChecked.provenStale && socketChecked.canPrune) {
      await pruneBridgeRuntime(projectRoot, cwd);
    }
    return {
      ok: false,
      projectRoot,
      projectHash: runtime.projectHash,
      error: socketChecked.error || "live bridge runtime ownership could not be proven over the project socket; no fixed-port or localhost fallback is used",
      code: socketChecked.code === "permission" ? "permission" : socketChecked.code === "timeout" ? "timeout" : socketChecked.code === "stale" ? "stale" : "validation",
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
    generation: request.generation,
    processStartIdentity: request.processStartIdentity,
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
    generation: request.generation,
    processStartIdentity: request.processStartIdentity,
    code,
    error: message,
  };
}

export function validateBridgeResponse(
  request: BridgeRequest,
  response: unknown,
): { response: BridgeResponse; error?: string; mismatch?: BridgeResponseMismatchKind } {
  if (!response || typeof response !== "object") {
    return { response: null as never, error: "bridge response was not an object", mismatch: "protocolVersion" };
  }
  const parsed = response as Partial<BridgeResponse>;
  if (parsed.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
    return { response: null as never, error: "bridge response protocol version did not match", mismatch: "protocolVersion" };
  }
  if (parsed.requestId !== request.requestId) {
    return { response: null as never, error: "bridge response request ID did not match", mismatch: "requestId" };
  }
  if (parsed.projectRoot !== request.projectRoot) {
    return { response: null as never, error: "bridge response project root did not match", mismatch: "projectRoot" };
  }
  if (parsed.projectHash !== request.projectHash) {
    return { response: null as never, error: "bridge response project hash did not match", mismatch: "projectHash" };
  }
  if (parsed.generation !== request.generation) {
    return { response: null as never, error: "bridge response generation did not match the live descriptor", mismatch: "generation" };
  }
  if (parsed.processStartIdentity !== request.processStartIdentity) {
    return { response: null as never, error: "bridge response process identity did not match the live descriptor", mismatch: "processStartIdentity" };
  }
  return {
    response: {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: parsed.requestId ?? request.requestId,
      ok: Boolean(parsed.ok),
      projectRoot: parsed.projectRoot ?? request.projectRoot,
      projectHash: parsed.projectHash ?? request.projectHash,
      generation: parsed.generation ?? request.generation,
      processStartIdentity: parsed.processStartIdentity ?? request.processStartIdentity,
      code: parsed.code,
      error: parsed.error,
      result: sanitizeBridgeValue(parsed.result),
    },
  };
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
        generation: 1,
        processStartIdentity: `${process.pid}:${process.ppid}:${Date.now()}`,
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
        generation: 1,
        processStartIdentity: `${process.pid}:${process.ppid}:${Date.now()}`,
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
    generation: runtime.generation,
    processStartIdentity: runtime.processStartIdentity,
    params: sanitizeBridgeValue(params),
    deadlineMs,
  };

  try {
    const payload = `${JSON.stringify(request)}\n`;
    let lastResponse: BridgeResponse | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
            const validated = validateBridgeResponse(request, parsed);
            if (validated.error) {
              clearTimeout(timer);
              socket.destroy();
              resolve(buildBridgeErrorEnvelope(request, "validation", validated.error));
              return;
            }
            clearTimeout(timer);
            socket.destroy();
            resolve(validated.response);
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
                const validated = validateBridgeResponse(request, parsed);
                if (validated.error) {
                  clearTimeout(timer);
                  socket.destroy();
                  resolve(buildBridgeErrorEnvelope(request, "validation", validated.error));
                  return;
                }
                clearTimeout(timer);
                socket.destroy();
                resolve(validated.response);
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
      lastResponse = response ?? null;
      if (response && response.ok !== false) break;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    return lastResponse ?? buildBridgeErrorEnvelope(request, "unsupported", "bridge IPC request failed");
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
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? `${process.pid}:${process.ppid}:${Date.now()}`,
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        generation: 1,
      },
    };
  }
  const projectRoot = canonicalProjectRoot(projectPath, cwd);
  const processStartIdentity = currentProcessStartIdentity(process.pid) ?? `${process.pid}:${process.ppid}:${Date.now()}`;
  const socketPath = buildBridgeIpcAddress(projectRoot);

  const seenRequestIds = new Set<string>();
  let descriptor: BridgeRuntimeDescriptor = {
    projectRoot,
    projectHash: stableProjectHash(projectRoot),
    ipcAddress: socketPath,
    pid: process.pid,
    processStartIdentity,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    generation: 1,
  };
  const trackedSockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    trackedSockets.add(socket);
    socket.on("close", () => trackedSockets.delete(socket));
    socket.on("error", () => {
      if (!socket.destroyed) socket.destroy();
    });
    let buffer = "";
    const respondWithError = (request: BridgeRequest | null, message: string, code: BridgeCommandResult["code"] = "validation") => {
      if (socket.destroyed || socket.writableEnded) return;
      const envelope = request
        ? buildBridgeErrorEnvelope(request, code, message)
        : buildBridgeErrorEnvelope({
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            requestId: randomUUID(),
            operation: "status",
            projectRoot,
            projectHash: stableProjectHash(projectRoot),
            generation: descriptor.generation,
            processStartIdentity,
            params: {},
            deadlineMs: 5000,
          }, code, message);
      socket.write(`${JSON.stringify(envelope)}\n`);
      socket.end();
    };
    const handleFrame = async (request: BridgeRequest): Promise<void> => {
      if (socket.destroyed || socket.writableEnded) return;
      if (request.projectHash !== descriptor.projectHash || request.projectRoot !== descriptor.projectRoot) {
        respondWithError(request, "project identity did not match the server-owned runtime descriptor");
        return;
      }
      if (request.generation !== descriptor.generation || request.processStartIdentity !== descriptor.processStartIdentity) {
        respondWithError(request, "request ownership did not match the live descriptor generation or process identity");
        return;
      }
      if (seenRequestIds.has(request.requestId)) {
        respondWithError(request, "duplicate request ID rejected");
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
        if (socket.destroyed || socket.writableEnded) return;
        socket.write(`${JSON.stringify(buildBridgeEnvelope(request, result))}\n`);
      } catch (error) {
        if (socket.destroyed || socket.writableEnded) return;
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
    };
    socket.on("data", async (chunk) => {
      buffer += String(chunk);
      if (buffer.length > BRIDGE_MAX_MESSAGE_BYTES) {
        respondWithError(null, "request was malformed or exceeded the bridge protocol limits");
        return;
      }
      while (buffer.includes("\n")) {
        const newlineIndex = buffer.indexOf("\n");
        const frame = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!frame) continue;
        if (frame.length > BRIDGE_MAX_MESSAGE_BYTES) {
          respondWithError(null, "request was malformed or exceeded the bridge protocol limits");
          return;
        }
        try {
          const parsed = JSON.parse(frame) as unknown;
          const valid = validateBridgeRequest(parsed);
          if (valid.error || !valid.request) {
            respondWithError(null, "request was malformed or exceeded the bridge protocol limits");
            return;
          }
          await handleFrame(valid.request);
          if (socket.destroyed) return;
        } catch {
          respondWithError(null, "request was malformed or exceeded the bridge protocol limits");
          return;
        }
      }
    });
  });

  await rm(socketPath, { force: true });
  await mkdir(join(socketPath, ".."), { recursive: true, mode: 0o700 });
  const publishedDescriptor = await new Promise<BridgeRuntimeDescriptor>((resolve, reject) => {
    server.listen({
      path: socketPath,
      exclusive: true,
    }, async () => {
      try {
        await chmod(socketPath, 0o600).catch(() => undefined);
        const runtime = await registerBridgeRuntime(projectRoot, cwd, {
          ipcAddress: socketPath,
          pid: process.pid,
          processStartIdentity,
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
        });
        descriptor = runtime;
        resolve(runtime);
      } catch (error) {
        reject(error);
      }
    });
    server.on("error", reject);
  });

  Object.defineProperty(server, "__bridgeRuntimeDescriptor", {
    value: publishedDescriptor,
    configurable: true,
  });
  Object.defineProperty(server, "__bridgeRuntimeSockets", {
    value: trackedSockets,
    configurable: true,
  });
  return { server, descriptor };
}

export async function stopBridgeServer(server: ReturnType<typeof createServer>): Promise<void> {
  const descriptor = (server as ReturnType<typeof createServer> & { __bridgeRuntimeDescriptor?: BridgeRuntimeDescriptor }).__bridgeRuntimeDescriptor;
  const sockets = (server as ReturnType<typeof createServer> & { __bridgeRuntimeSockets?: Set<import("node:net").Socket> }).__bridgeRuntimeSockets;
  if (descriptor) {
    await unregisterBridgeRuntime(descriptor.projectRoot, process.cwd(), descriptor.generation, descriptor.processStartIdentity);
  }
  if (sockets) {
    for (const socket of sockets) socket.destroy();
  }
  await new Promise<void>((resolve, reject) => {
    server.close((closeErr) => (closeErr ? reject(closeErr) : resolve()));
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
