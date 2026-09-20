import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { connect as netConnect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalProjectRoot,
  stableProjectHash,
  registerBridgeRuntime,
  lookupBridgeRuntime,
  currentProcessStartIdentity,
  parseLinuxProcessStartIdentity,
  bridgeStatus,
  bridgeRuntimeFile,
  buildBridgeIpcAddress,
  startBridgeServer,
  stopBridgeServer,
  callBridgeOperation,
  sanitizeBridgeValue,
  unregisterBridgeRuntime,
  probeBridgeRuntimeOwnership,
} from "./bridge.js";

async function rawBridgeRequest(address: string, payload: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const socket = netConnect(address);
    let buffer = "";
    socket.on("connect", () => socket.write(`${payload}
`));
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      if (buffer.includes("\n")) {
        socket.destroy();
        resolve(buffer.trim());
      }
    });
    socket.on("error", reject);
    socket.on("close", () => {
      if (buffer.trim()) resolve(buffer.trim());
      else resolve("");
    });
  });
}

async function rawBridgeSequence(address: string, payloads: string[]): Promise<string[]> {
  return await new Promise((resolve, reject) => {
    const socket = netConnect(address);
    const responses: string[] = [];
    let buffer = "";
    const flush = () => {
      const pieces = buffer.split(/\r?\n/u).filter(Boolean);
      for (const piece of pieces) responses.push(piece.trim());
      buffer = "";
    };
    socket.on("connect", () => {
      for (const payload of payloads) socket.write(`${payload}
`);
    });
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      flush();
      if (responses.length >= payloads.length) {
        socket.destroy();
        resolve(responses);
      }
    });
    socket.on("error", reject);
    socket.on("close", () => {
      flush();
      if (responses.length > 0) resolve(responses);
      else resolve([]);
    });
    setTimeout(() => {
      socket.destroy();
      resolve(responses);
    }, 2000);
  });
}

async function rawBridgeNoNewlineRequest(address: string, payload: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const socket = netConnect(address);
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(buffer.trim());
    }, 1000);
    socket.on("connect", () => socket.write(payload));
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      clearTimeout(timer);
      socket.destroy();
      resolve(buffer.trim());
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(buffer.trim());
    });
  });
}

async function unregisterOwnedBridgeRuntime(projectRoot: string, cwd = process.cwd()): Promise<void> {
  const runtime = await lookupBridgeRuntime(projectRoot, cwd);
  if (!runtime) return;
  await unregisterBridgeRuntime(projectRoot, cwd, runtime.generation, runtime.processStartIdentity);
}

describe("bridge project identity", () => {
  it("canonicalizes symlinked roots and hashes them stably", () => {
    const base = mkdtempSync(join(tmpdir(), "ithyno-bridge-"));
    const target = join(base, "real-project");
    const link = join(base, "linked-project");
    require("node:fs").mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "openspec"), "");
    try {
      try {
        require("node:fs").symlinkSync(target, link, "dir");
      } catch {
        // ignore unsupported FS in test environment
      }
      const canonical = canonicalProjectRoot(link);
      expect(canonical).toBe(require("node:fs").realpathSync(target));
      expect(stableProjectHash(link)).toBe(stableProjectHash(target));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("keeps a missing path canonical but still stable for a given root", () => {
    const root = join(tmpdir(), "need-not-exist-bridge");
    expect(canonicalProjectRoot(root)).toBe(root);
    expect(stableProjectHash(root)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("bridge runtime registry", () => {
  it("registers and looks up a runtime descriptor without storing secrets", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-runtime-"));
    try {
      const descriptor = await registerBridgeRuntime(projectRoot, projectRoot, {
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "test-start",
        generation: 1,
      });
      const file = bridgeRuntimeFile(projectRoot, projectRoot);
      expect(existsSync(file)).toBe(true);
      const json = readFileSync(file, "utf8");
      expect(json).not.toContain("sessionToken");
      expect(json).not.toContain("password");
      expect((await lookupBridgeRuntime(projectRoot, projectRoot))?.projectHash).toBe(descriptor.projectHash);
    } finally {
      await unregisterOwnedBridgeRuntime(projectRoot, projectRoot);
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects malformed protocol and generation metadata without coercion", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-bad-runtime-"));
    const file = bridgeRuntimeFile(projectRoot, projectRoot);
    try {
      writeFileSync(file, JSON.stringify({
        projectRoot: canonicalProjectRoot(projectRoot, projectRoot),
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start-proto",
        protocolVersion: "99",
        generation: 0,
      }));
      expect(await lookupBridgeRuntime(projectRoot, projectRoot)).toBeNull();
      expect(existsSync(file)).toBe(true);

      writeFileSync(file, JSON.stringify({
        projectRoot: canonicalProjectRoot(projectRoot, projectRoot),
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start-gen",
        protocolVersion: "1",
        generation: 0,
      }));
      expect(await lookupBridgeRuntime(projectRoot, projectRoot)).toBeNull();
      expect(existsSync(file)).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects cross-project runtime descriptors before any liveness or handshake use", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-cross-project-"));
    const otherRoot = mkdtempSync(join(tmpdir(), "ithyno-other-project-"));
    const file = bridgeRuntimeFile(projectRoot, projectRoot);
    try {
      writeFileSync(file, JSON.stringify({
        projectRoot: canonicalProjectRoot(otherRoot, otherRoot),
        projectHash: stableProjectHash(otherRoot),
        ipcAddress: buildBridgeIpcAddress(otherRoot),
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start-cross",
        protocolVersion: "1",
        generation: 1,
      }));
      expect(await lookupBridgeRuntime(projectRoot, projectRoot)).toBeNull();
      expect(existsSync(file)).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("prunes stale descriptors on dead or mismatched lifecycle identities", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-stale-"));
    const file = bridgeRuntimeFile(projectRoot, projectRoot);
    try {
      const descriptor = {
        projectRoot: canonicalProjectRoot(projectRoot, projectRoot),
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        processStartIdentity: "dead-identity",
        protocolVersion: "1",
        generation: 1,
      };
      writeFileSync(file, JSON.stringify(descriptor));
      expect(await lookupBridgeRuntime(projectRoot, projectRoot)).toBeNull();
      expect(existsSync(file)).toBe(false);

      const second = await registerBridgeRuntime(projectRoot, projectRoot, {
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        generation: 1,
      });
      expect(second.generation).toBe(1);
      expect((await lookupBridgeRuntime(projectRoot, projectRoot))?.generation).toBe(1);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("reports unavailable when no runtime descriptor exists", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-missing-"));
    try {
      const result = await bridgeStatus(projectRoot, projectRoot);
      expect(result.ok).toBe(false);
      expect(result.code).toBe("unavailable");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("maps permission-denied socket probes to permission without pruning the descriptor", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-permission-"));
    const runtimeDir = mkdtempSync(join(tmpdir(), "ithyno-runtime-perm-"));
    const previousRuntimeDir = process.env.XDG_RUNTIME_DIR;
    process.env.XDG_RUNTIME_DIR = runtimeDir;
    const runtime = {
      projectRoot: canonicalProjectRoot(projectRoot, projectRoot),
      projectHash: stableProjectHash(projectRoot),
      ipcAddress: join(runtimeDir, `bridge-${stableProjectHash(projectRoot)}.sock`),
      pid: process.pid,
      processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start-perm",
      protocolVersion: "1",
      generation: 1,
    } as const;
    const file = bridgeRuntimeFile(projectRoot, projectRoot);
    try {
      writeFileSync(file, JSON.stringify(runtime));
      chmodSync(file, 0o000);
      const status = await bridgeStatus(projectRoot, projectRoot);
      expect(status.ok).toBe(false);
      expect(status.code).toBe("permission");
      expect(existsSync(file)).toBe(true);
    } finally {
      if (previousRuntimeDir === undefined) delete process.env.XDG_RUNTIME_DIR;
      else process.env.XDG_RUNTIME_DIR = previousRuntimeDir;
      try {
        chmodSync(file, 0o600);
      } catch {
        // ignore cleanup when the runtime descriptor has already been made unreadable
      }
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("treats fragmented ownership responses as validation and leaves the descriptor intact", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-fragmented-"));
    const runtimeDir = mkdtempSync(join(tmpdir(), "ithyno-runtime-frag-"));
    const previousRuntimeDir = process.env.XDG_RUNTIME_DIR;
    process.env.XDG_RUNTIME_DIR = runtimeDir;
    const socketPath = join(runtimeDir, "fragmented.sock");
    const openSockets = new Set<import("node:net").Socket>();
    const server = createServer((socket) => {
      openSockets.add(socket);
      socket.on("close", () => openSockets.delete(socket));
      socket.on("error", () => undefined);
      socket.write('{"protocolVersion":"1","requestId":"');
      socket.end();
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, () => resolve());
      });
      const runtime = {
        projectRoot: canonicalProjectRoot(projectRoot, projectRoot),
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: socketPath,
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start-frag",
        protocolVersion: "1" as const,
        generation: 1,
      };
      const file = bridgeRuntimeFile(projectRoot, projectRoot);
      writeFileSync(file, JSON.stringify(runtime));
      const probe = await probeBridgeRuntimeOwnership(runtime);
      expect(probe.ok).toBe(false);
      expect(probe.code).toBe("validation");
      expect(existsSync(file)).toBe(true);
    } finally {
      for (const socket of openSockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((closeErr) => (closeErr ? reject(closeErr) : resolve()));
      });
      if (previousRuntimeDir === undefined) delete process.env.XDG_RUNTIME_DIR;
      else process.env.XDG_RUNTIME_DIR = previousRuntimeDir;
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("times out without pruning a live runtime descriptor", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-timeout-"));
    const runtimeDir = mkdtempSync(join(tmpdir(), "ithyno-runtime-timeout-"));
    const previousRuntimeDir = process.env.XDG_RUNTIME_DIR;
    process.env.XDG_RUNTIME_DIR = runtimeDir;
    const socketPath = join(runtimeDir, `bridge-${stableProjectHash(projectRoot)}.sock`);
    const openSockets = new Set<import("node:net").Socket>();
    const server = createServer((socket) => {
      openSockets.add(socket);
      socket.on("close", () => openSockets.delete(socket));
      socket.on("error", () => undefined);
      // intentionally never respond so the client times out without deleting the descriptor
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, () => resolve());
      });
      const runtime = {
        projectRoot: canonicalProjectRoot(projectRoot, projectRoot),
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: socketPath,
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start-timeout",
        protocolVersion: "1" as const,
        generation: 1,
      };
      const file = bridgeRuntimeFile(projectRoot, projectRoot);
      writeFileSync(file, JSON.stringify(runtime));
      const probe = await probeBridgeRuntimeOwnership(runtime);
      expect(probe.ok).toBe(false);
      expect(probe.code).toBe("timeout");
      const status = await bridgeStatus(projectRoot, projectRoot);
      expect(status.ok).toBe(false);
      expect(status.code).toBe("timeout");
      expect(existsSync(file)).toBe(true);
    } finally {
      for (const socket of openSockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((closeErr) => (closeErr ? reject(closeErr) : resolve()));
      });
      if (previousRuntimeDir === undefined) delete process.env.XDG_RUNTIME_DIR;
      else process.env.XDG_RUNTIME_DIR = previousRuntimeDir;
      rmSync(runtimeDir, { recursive: true, force: true });
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not delete malformed or unreadable descriptors during unregister", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-bad-descriptor-"));
    const file = bridgeRuntimeFile(projectRoot, projectRoot);
    try {
      writeFileSync(file, "{not-json");
      await expect(unregisterBridgeRuntime(projectRoot, projectRoot, 1, "manual-start")).resolves.toBe(false);
      expect(existsSync(file)).toBe(true);

      writeFileSync(file, JSON.stringify({
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        processStartIdentity: "manual-start",
        protocolVersion: "1",
        generation: 1,
      }));
      chmodSync(file, 0o000);
      await expect(unregisterBridgeRuntime(projectRoot, projectRoot, 1, "manual-start")).resolves.toBe(false);
      expect(existsSync(file)).toBe(true);
    } finally {
      chmodSync(file, 0o600);
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("reports an explicit unsupported state when the platform has no secure IPC", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-unsupported-"));
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      const result = await bridgeStatus(projectRoot, projectRoot);
      expect(result.ok).toBe(false);
      expect(result.code).toBe("unsupported");
      expect(result.error).toContain("Windows bridge writes are disabled");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("runs a real bridge IPC round-trip and redacts secrets before they leave the process", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-ipc-"));
    const { server } = await startBridgeServer(projectRoot, process.cwd());
    try {
      const status = await callBridgeOperation(projectRoot, "status", {}, process.cwd());
      expect(status.ok).toBe(true);
      expect(status.result).toEqual(expect.objectContaining({ projectRoot: canonicalProjectRoot(projectRoot, process.cwd()) }));

      const redacted = sanitizeBridgeValue({ sessionToken: "abc", authorization: "******", nested: { apiKey: "secret" } });
      expect(redacted).toEqual({ sessionToken: "[redacted]", authorization: "[redacted]", nested: { apiKey: "[redacted]" } });

      const activity = await callBridgeOperation(projectRoot, "activity", {
        changeId: "bridge-ipc-test",
        role: "code",
        activity: "waiting",
        detail: "secret=abc",
      }, process.cwd());
      expect(activity.ok).toBe(true);
      expect(activity.result).toEqual(expect.objectContaining({
        changeId: "bridge-ipc-test",
        activity: expect.objectContaining({ role: "code", activity: "waiting" }),
      }));
    } finally {
      await stopBridgeServer(server);
      await unregisterOwnedBridgeRuntime(projectRoot, process.cwd());
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("enumerates the Unix bridge IPC protocol edge cases", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-ipc-regress-"));
    const { server, descriptor } = await startBridgeServer(projectRoot, process.cwd());
    try {
      const malformed = await rawBridgeRequest(descriptor.ipcAddress, '{"bad":');
      expect(malformed).toContain("request was malformed or exceeded");

      const unsupportedVersion = await rawBridgeRequest(descriptor.ipcAddress, JSON.stringify({
        protocolVersion: "99",
        requestId: "unsupported-version",
        operation: "status",
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        generation: descriptor.generation,
        processStartIdentity: descriptor.processStartIdentity,
        params: {},
        deadlineMs: 1000,
      }));
      expect(unsupportedVersion).toContain("malformed");

      const unknownOperation = await rawBridgeRequest(descriptor.ipcAddress, JSON.stringify({
        protocolVersion: "1",
        requestId: "unknown-op",
        operation: "nope",
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        generation: descriptor.generation,
        processStartIdentity: descriptor.processStartIdentity,
        params: {},
        deadlineMs: 1000,
      }));
      expect(unknownOperation).toContain("malformed");

      const oversized = "x".repeat(300 * 1024);
      const tooLarge = await rawBridgeRequest(descriptor.ipcAddress, JSON.stringify({
        protocolVersion: "1",
        requestId: "oversized",
        operation: "status",
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        generation: descriptor.generation,
        processStartIdentity: descriptor.processStartIdentity,
        params: { payload: oversized },
        deadlineMs: 1000,
      }));
      expect(tooLarge).toContain("malformed");

      const duplicatePairs = await rawBridgeSequence(descriptor.ipcAddress, [
        JSON.stringify({
          protocolVersion: "1",
          requestId: "dup-1",
          operation: "status",
          projectRoot,
          projectHash: stableProjectHash(projectRoot),
          generation: descriptor.generation,
          processStartIdentity: descriptor.processStartIdentity,
          params: {},
          deadlineMs: 1000,
        }),
        JSON.stringify({
          protocolVersion: "1",
          requestId: "dup-1",
          operation: "status",
          projectRoot,
          projectHash: stableProjectHash(projectRoot),
          generation: descriptor.generation,
          processStartIdentity: descriptor.processStartIdentity,
          params: {},
          deadlineMs: 1000,
        }),
      ]);
      expect(duplicatePairs.some((entry) => entry.includes("duplicate request ID rejected"))).toBe(true);

      const timedOut = await rawBridgeRequest(descriptor.ipcAddress, JSON.stringify({
        protocolVersion: "1",
        requestId: "timeout-1",
        operation: "status",
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        generation: descriptor.generation,
        processStartIdentity: descriptor.processStartIdentity,
        params: {},
        deadlineMs: 1,
      }));
      expect(timedOut).toContain("timeout");
    } finally {
      await stopBridgeServer(server);
      await unregisterOwnedBridgeRuntime(projectRoot, process.cwd());
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("requires the current descriptor generation and process identity to match an owning server", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-owned-"));
    const { server, descriptor } = await startBridgeServer(projectRoot, process.cwd());
    try {
      const staleGeneration = await rawBridgeRequest(descriptor.ipcAddress, JSON.stringify({
        protocolVersion: "1",
        requestId: "stale-generation",
        operation: "status",
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        generation: descriptor.generation + 1,
        processStartIdentity: descriptor.processStartIdentity,
        params: {},
        deadlineMs: 1000,
      }));
      expect(staleGeneration).toContain("generation or process identity");

      const staleProcess = await rawBridgeRequest(descriptor.ipcAddress, JSON.stringify({
        protocolVersion: "1",
        requestId: "stale-process",
        operation: "status",
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        generation: descriptor.generation,
        processStartIdentity: `${descriptor.processStartIdentity}-stale`,
        params: {},
        deadlineMs: 1000,
      }));
      expect(staleProcess).toContain("generation or process identity");
    } finally {
      await stopBridgeServer(server);
      await unregisterBridgeRuntime(projectRoot, process.cwd(), descriptor.generation, descriptor.processStartIdentity);
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("removes only the matching generation instead of deleting a replacement descriptor", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-generation-"));
    try {
      const initial = await registerBridgeRuntime(projectRoot, projectRoot, {
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start-1",
        generation: 1,
      });
      const replacement = await registerBridgeRuntime(projectRoot, projectRoot, {
        ipcAddress: buildBridgeIpcAddress(projectRoot),
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start-2",
        generation: 2,
      });

      await unregisterBridgeRuntime(projectRoot, projectRoot, initial.generation, initial.processStartIdentity);
      expect((await lookupBridgeRuntime(projectRoot, projectRoot))?.generation).toBe(replacement.generation);

      await unregisterBridgeRuntime(projectRoot, projectRoot, replacement.generation, replacement.processStartIdentity);
      expect(await lookupBridgeRuntime(projectRoot, projectRoot)).toBeNull();
    } finally {
      await unregisterOwnedBridgeRuntime(projectRoot, projectRoot);
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects oversized request frames before a newline arrives", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-oversized-"));
    const { server, descriptor } = await startBridgeServer(projectRoot, process.cwd());
    try {
      const payload = JSON.stringify({
        protocolVersion: "1",
        requestId: "oversized-no-newline",
        operation: "status",
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        generation: descriptor.generation,
        processStartIdentity: descriptor.processStartIdentity,
        params: { huge: "x".repeat(400 * 1024) },
        deadlineMs: 1000,
      });
      const response = await rawBridgeNoNewlineRequest(descriptor.ipcAddress, payload);
      expect(response).toContain("malformed or exceeded");
    } finally {
      await stopBridgeServer(server);
      await unregisterBridgeRuntime(projectRoot, process.cwd(), descriptor.generation, descriptor.processStartIdentity);
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("parses Linux /proc/<pid>/stat starttime when the executable name contains spaces", () => {
    const raw = "1234 (my process name) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 4321";
    expect(parseLinuxProcessStartIdentity(raw, 1234)).toBe("1234:4321");
  });

  it("fails closed when a runtime socket is stale or missing", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-cli-stale-"));
    const runtimeDir = join(tmpdir(), `ithyno-stale-runtime-${Date.now()}`);
    mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
    const previousRuntimeDir = process.env.XDG_RUNTIME_DIR;
    process.env.XDG_RUNTIME_DIR = runtimeDir;
    try {
      const descriptor = {
        projectRoot: canonicalProjectRoot(projectRoot, projectRoot),
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: join(runtimeDir, `bridge-${stableProjectHash(projectRoot)}.sock`),
        pid: process.pid,
        processStartIdentity: currentProcessStartIdentity(process.pid) ?? "manual-start",
        protocolVersion: "1",
        generation: 1,
      };
      writeFileSync(bridgeRuntimeFile(projectRoot, projectRoot), JSON.stringify(descriptor));
      const env = {
        ...process.env,
        XDG_RUNTIME_DIR: runtimeDir,
        ITHYNO_PORT: "4321",
        ITHYNO_BASE: "http://localhost:4321",
        ITHYNO_SESSION_TOKEN: "token-should-not-leak",
      };
      const child = spawnSync(process.execPath, ["bin/ithyno.js", "status", "--json", "--project", projectRoot], {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
      });
      const output = `${child.stdout ?? ""}
${child.stderr ?? ""}`;
      expect(child.status).toBe(14);
      expect(output).not.toContain("ITHYNO_PORT");
      expect(output).not.toContain("ITHYNO_BASE");
      expect(output).not.toContain("ITHYNO_SESSION_TOKEN");
      expect(output).not.toContain("localhost:4321");
      expect(output).toContain("ownership could not be proven");
    } finally {
      if (previousRuntimeDir === undefined) delete process.env.XDG_RUNTIME_DIR;
      else process.env.XDG_RUNTIME_DIR = previousRuntimeDir;
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  it("strips ITHYNO_* env from subprocesses and avoids a fixed port fallback", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-cli-"));
    const env = {
      ...process.env,
      ITHYNO_PORT: "4321",
      ITHYNO_BASE: "http://localhost:4321",
      ITHYNO_SESSION_TOKEN: "token-should-not-leak",
      XDG_RUNTIME_DIR: join(tmpdir(), `ithyno-xdg-${Date.now()}`),
    };
    const child = spawnSync(process.execPath, ["bin/ithyno.js", "status", "--json", "--project", projectRoot], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
    const output = `${child.stdout ?? ""}
${child.stderr ?? ""}`;
    expect(child.status).toBe(10);
    expect(output).not.toContain("ITHYNO_PORT");
    expect(output).not.toContain("ITHYNO_BASE");
    expect(output).not.toContain("ITHYNO_SESSION_TOKEN");
    expect(output).not.toContain("localhost:4321");
    expect(output).toContain("no fixed-port or localhost fallback is used");
    rmSync(projectRoot, { recursive: true, force: true });
  });
});
