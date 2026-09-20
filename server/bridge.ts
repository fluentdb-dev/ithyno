import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, connect as netConnect, type Socket } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

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
    return `\\.\pipe\ithyno-${hash}`;
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
  const deadlineMs = Number(candidate.deadlineMs ?? 5000);
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs > 30000) {
    return { request: null as never, error: "deadlineMs must be within 1..30000" };
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

export function handleBridgeOperation(operation: BridgeOperationName, params: Record<string, unknown>, projectRoot: string): unknown {
  switch (operation) {
    case "status":
      return {
        ok: true,
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        runtime: { projectRoot, projectHash: stableProjectHash(projectRoot), pid: process.pid, ipcAddress: buildBridgeIpcAddress(projectRoot), processStartIdentity: `${process.pid}:${process.ppid}`, protocolVersion: BRIDGE_PROTOCOL_VERSION, generation: 1 },
      };
    case "changes":
      return { ok: true, items: [] };
    case "phase": {
      const changeId = typeof params.changeId === "string" ? params.changeId : "";
      if (!changeId) throw new Error("changeId is required for phase operations");
      return { ok: true, changeId, phase: String(params.phase ?? "proposed") };
    }
    case "activity": {
      const changeId = typeof params.changeId === "string" ? params.changeId : "";
      if (!changeId) throw new Error("changeId is required for activity operations");
      return { ok: true, changeId, activity: String(params.activity ?? "idle") };
    }
    case "dispatch": {
      return { ok: true, jobId: `job-${randomUUID()}` };
    }
    case "jobs":
      return { ok: true, jobs: [] };
    case "job.cancel": {
      return { ok: true, cancelled: true, jobId: String(params.jobId ?? "") };
    }
    case "needs-human.read": {
      return { ok: true, question: null, answer: null, answered: false };
    }
    case "needs-human.answer": {
      const changeId = typeof params.changeId === "string" ? params.changeId : "";
      if (!changeId) throw new Error("changeId is required for needs-human answer operations");
      return { ok: true, changeId, answered: true, answer: String(params.answer ?? "") };
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

  const descriptor: BridgeRuntimeDescriptor = {
    projectRoot,
    projectHash,
    ipcAddress: overrides.ipcAddress ?? buildBridgeIpcAddress(projectRoot),
    pid: overrides.pid ?? process.pid,
    processStartIdentity: overrides.processStartIdentity ?? `${process.pid}:${process.ppid}:${Date.now()}:${randomUUID()}`,
    protocolVersion: overrides.protocolVersion ?? "1",
    generation: overrides.generation ?? 1,
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

export async function bridgeStatus(projectPath?: string, cwd = process.cwd()): Promise<BridgeCommandResult> {
  const projectRoot = resolveBridgeProject(projectPath, cwd);
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
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > BRIDGE_MAX_MESSAGE_BYTES) {
        socket.off("data", onData);
        socket.destroy();
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(buffer) as unknown;
        socket.off("data", onData);
        const valid = validateBridgeRequest(parsed);
        if (valid.error) {
          resolve(null);
          return;
        }
        resolve(valid.request);
      } catch {
        if (buffer.includes("\n") || buffer.includes("{")) {
          socket.off("data", onData);
          resolve(null);
        }
      }
    };
    socket.on("data", onData);
    socket.on("error", () => resolve(null));
  });
}

export async function callBridgeOperation(
  projectPath: string,
  operation: BridgeOperationName,
  params: Record<string, unknown> = {},
  cwd = process.cwd(),
): Promise<BridgeResponse> {
  const projectRoot = canonicalProjectRoot(projectPath, cwd);
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
        deadlineMs: 5000,
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
    deadlineMs: 5000,
  };

  try {
    const payload = JSON.stringify(request);
    const response = await new Promise<BridgeResponse | null>((resolve) => {
      const socket = netConnect(runtime.ipcAddress, () => {
        socket.write(payload);
      });
      const onError = () => resolve(buildBridgeErrorEnvelope(request, "unavailable", "bridge IPC endpoint is not reachable"));
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(buildBridgeErrorEnvelope(request, "timeout", "bridge operation timed out"));
      }, request.deadlineMs);
      socket.on("error", onError);
      socket.on("data", (chunk) => {
        clearTimeout(timer);
        socket.destroy();
        try {
          const parsed = JSON.parse(String(chunk)) as BridgeResponse;
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
          resolve(buildBridgeErrorEnvelope(request, "validation", "bridge response was not valid JSON"));
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

export async function startBridgeServer(projectPath: string, cwd = process.cwd()): Promise<{ server: ReturnType<typeof createServer>; descriptor: BridgeRuntimeDescriptor }> {
  const projectRoot = canonicalProjectRoot(projectPath, cwd);
  const descriptor = await registerBridgeRuntime(projectRoot, cwd, {
    ipcAddress: buildBridgeIpcAddress(projectRoot),
    pid: process.pid,
    processStartIdentity: `${process.pid}:${process.ppid}:${Date.now()}`,
    generation: 1,
  });

  const server = createServer(async (socket) => {
    const request = await readBridgeMessage(socket);
    if (!request) {
      socket.write(JSON.stringify(buildBridgeErrorEnvelope({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: randomUUID(),
        operation: "status",
        projectRoot,
        projectHash: descriptor.projectHash,
        params: {},
        deadlineMs: 5000,
      }, "validation", "request was malformed or exceeded the bridge protocol limits")));
      socket.end();
      return;
    }
    try {
      const result = handleBridgeOperation(request.operation, request.params, request.projectRoot);
      socket.write(JSON.stringify(buildBridgeEnvelope(request, result)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "bridge operation failed";
      socket.write(JSON.stringify(buildBridgeErrorEnvelope(request, "validation", message)));
    }
    socket.end();
  });

  if (process.platform !== "win32") {
    const socketPath = descriptor.ipcAddress;
    await rm(socketPath, { force: true });
    await mkdir(join(socketPath, ".."), { recursive: true, mode: 0o700 });
    await new Promise<void>((resolve, reject) => {
      server.listen(socketPath, () => {
        chmod(socketPath, 0o600).catch(() => undefined);
        resolve();
      });
      server.on("error", reject);
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      server.listen(descriptor.ipcAddress, () => resolve());
      server.on("error", reject);
    });
  }

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
