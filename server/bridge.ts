import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  return { ok: false, projectRoot: canonicalProjectRoot(), projectHash: stableProjectHash(), error: message, code };
}

export async function ensureNoBridgePortFallback(): Promise<void> {
  // The bridge never guesses or scans localhost ports. Use the canonical project
  // runtime registry instead; keep this as a readable contract point for tests.
  await pruneStaleBridgeRuntimes();
}

export function projectHashForTests(projectPath?: string, cwd = process.cwd()): string {
  return stableProjectHash(projectPath, cwd);
}
