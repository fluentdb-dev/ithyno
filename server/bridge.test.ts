import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalProjectRoot,
  stableProjectHash,
  registerBridgeRuntime,
  lookupBridgeRuntime,
  currentProcessStartIdentity,
  bridgeStatus,
  bridgeRuntimeDirectory,
  bridgeRuntimeFile,
  startBridgeServer,
  stopBridgeServer,
  callBridgeOperation,
  sanitizeBridgeValue,
  unregisterBridgeRuntime,
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
        ipcAddress: join(bridgeRuntimeDirectory(), "unit.sock"),
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
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("prunes stale descriptors on dead or mismatched lifecycle identities", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-stale-"));
    const file = bridgeRuntimeFile(projectRoot, projectRoot);
    try {
      const descriptor = {
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: join(bridgeRuntimeDirectory(), "stale.sock"),
        pid: process.pid,
        processStartIdentity: "dead-identity",
        protocolVersion: "1",
        generation: 1,
      };
      writeFileSync(file, JSON.stringify(descriptor));
      expect(await lookupBridgeRuntime(projectRoot, projectRoot)).toBeNull();
      expect(existsSync(file)).toBe(false);

      const second = await registerBridgeRuntime(projectRoot, projectRoot, {
        ipcAddress: join(bridgeRuntimeDirectory(), "fresh.sock"),
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
      await unregisterBridgeRuntime(projectRoot, process.cwd());
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
          params: {},
          deadlineMs: 1000,
        }),
        JSON.stringify({
          protocolVersion: "1",
          requestId: "dup-1",
          operation: "status",
          projectRoot,
          projectHash: stableProjectHash(projectRoot),
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
        params: {},
        deadlineMs: 1,
      }));
      expect(timedOut).toContain("timeout");
    } finally {
      await stopBridgeServer(server);
      await unregisterBridgeRuntime(projectRoot, process.cwd());
      rmSync(projectRoot, { recursive: true, force: true });
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
