import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalProjectRoot,
  stableProjectHash,
  registerBridgeRuntime,
  lookupBridgeRuntime,
  pruneStaleBridgeRuntimes,
  bridgeStatus,
  bridgeRuntimeDirectory,
  bridgeRuntimeFile,
} from "./bridge.js";

describe("bridge project identity", () => {
  it("canonicalizes symlinked roots and hashes them stably", () => {
    const base = mkdtempSync(join(tmpdir(), "ithyno-bridge-"));
    const target = join(base, "real-project");
    const link = join(base, "linked-project");
    require("node:fs").mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "openspec"), "");
    try {
      // use symlink only when supported
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
        processStartIdentity: "test-start",
        generation: 1,
      });
      const file = bridgeRuntimeFile(projectRoot, projectRoot);
      expect(existsSync(file)).toBe(true);
      const json = require("node:fs").readFileSync(file, "utf8");
      expect(json).not.toContain("sessionToken");
      expect(json).not.toContain("password");
      expect((await lookupBridgeRuntime(projectRoot, projectRoot))?.projectHash).toBe(descriptor.projectHash);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("prunes stale descriptors on dead pids", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-stale-"));
    const file = bridgeRuntimeFile(projectRoot, projectRoot);
    try {
      const descriptor = {
        projectRoot,
        projectHash: stableProjectHash(projectRoot),
        ipcAddress: join(bridgeRuntimeDirectory(), "stale.sock"),
        pid: Number.MAX_SAFE_INTEGER,
        processStartIdentity: "dead",
        protocolVersion: "1",
        generation: 1,
      };
      writeFileSync(file, JSON.stringify(descriptor));
      const pruned = await pruneStaleBridgeRuntimes();
      expect(pruned).toBeGreaterThanOrEqual(1);
      expect(existsSync(file)).toBe(false);
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
});
