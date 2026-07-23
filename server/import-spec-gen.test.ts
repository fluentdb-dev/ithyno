// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Tests for preflight and inject-to-Manager logic.
// The SSE / subprocess-spawn tests from the archived predecessor
// (import-project-spec-generation) have been removed; the subprocess
// transport no longer exists. See refactor-import-to-task-tool-subagent.
import { preflight, injectImportCommand } from "./import-spec-gen.js";

const ALWAYS_AUTHORIZED = (_path: string) => true;

describe("import-spec-gen preflight", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "import-spec-gen-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns ok: true for a valid project root", async () => {
    await writeFile(join(tmpDir, "README.md"), "# Test Project\n");
    await writeFile(join(tmpDir, "index.ts"), "export default {};\n");

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.jobId).toBeTruthy();
    expect(result.result.targetPath).toBe(tmpDir);
    expect(typeof result.result.estimatedContextBytes).toBe("number");
    expect(result.result.scanCounts.code).toBeGreaterThanOrEqual(1);
    expect(result.result.scanCounts.docs).toBeGreaterThanOrEqual(1);
  });

  it("rejects 409 when openspec/ exists and force is false", async () => {
    await mkdir(join(tmpDir, "openspec"), { recursive: true });

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.reason).toMatch(/openspec\//);
  });

  it("allows when openspec/ exists but force is true", async () => {
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "README.md"), "# Test\n");

    const result = await preflight(tmpDir, true, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
  });

  it("rejects 403 for unauthorized paths", async () => {
    const result = await preflight(tmpDir, false, (_path: string) => false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it("rejects 403 when authorization callback returns false", async () => {
    const DENY_ALL = (_path: string) => false;
    const result = await preflight(tmpDir, false, DENY_ALL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it("returns filesToScan with relative paths (max 50)", async () => {
    for (let i = 0; i < 60; i++) {
      await writeFile(join(tmpDir, `file${i}.ts`), `export const x${i} = ${i};\n`);
    }

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.filesToScan.length).toBeLessThanOrEqual(50);
    for (const f of result.result.filesToScan) {
      expect(f).not.toMatch(/^\//);
    }
  });

  it("excludes node_modules from scan", async () => {
    await mkdir(join(tmpDir, "node_modules", "some-pkg"), { recursive: true });
    await writeFile(join(tmpDir, "node_modules", "some-pkg", "index.ts"), "const x = 1;\n");
    await writeFile(join(tmpDir, "src.ts"), "const y = 2;\n");

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const f of result.result.filesToScan) {
      expect(f).not.toMatch(/node_modules/);
    }
  });

  it("scanCounts.code counts code files and scanCounts.docs counts doc files", async () => {
    await writeFile(join(tmpDir, "main.ts"), "export default {};\n");
    await writeFile(join(tmpDir, "helper.py"), "def foo(): pass\n");
    await writeFile(join(tmpDir, "README.md"), "# readme\n");
    await writeFile(join(tmpDir, "CONTRIBUTING.md"), "# contrib\n");

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.scanCounts.code).toBeGreaterThanOrEqual(2);
    expect(result.result.scanCounts.docs).toBeGreaterThanOrEqual(2);
  });

  // F6 regression: symlinks inside the project root must not be followed.
  it("does not follow symlinks during walkDir (F6)", async () => {
    await writeFile(join(tmpDir, "real.ts"), "const x = 1;\n");
    const symlinkPath = join(tmpDir, "outside.ts");
    try {
      await symlink("/etc/hosts", symlinkPath);
    } catch {
      return;
    }

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const f of result.result.filesToScan) {
      expect(f).not.toMatch(/etc\/hosts/);
      expect(f).not.toBe("outside.ts");
    }
  });

  // F7 regression: docs/ must not be counted twice.
  it("does not double-count files in docs/ subdirectory (F7)", async () => {
    await mkdir(join(tmpDir, "docs"), { recursive: true });
    await writeFile(join(tmpDir, "docs", "guide.md"), "# Guide\n");
    await writeFile(join(tmpDir, "README.md"), "# Root\n");

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const docsCount = result.result.filesToScan.filter((f) => f.includes("docs/guide.md")).length;
    expect(docsCount).toBe(1);
  });
});

// ---- injectImportCommand tests ----------------------------------------------
describe("injectImportCommand", () => {
  it("injects the correct command string to the PTY relay", () => {
    const injected: Array<{ data: string; terminate: boolean }> = [];
    const mockInject = (data: string, terminate: boolean) => {
      injected.push({ data, terminate });
      return { ok: true as const };
    };

    const result = injectImportCommand("/path/to/target", mockInject);
    expect(result.ok).toBe(true);
    expect(injected).toHaveLength(1);
    expect(injected[0].data).toBe("/ithy-opsx:import /path/to/target");
    expect(injected[0].terminate).toBe(true);
  });

  it("propagates failure when PTY relay is not running", () => {
    const mockInject = (_data: string, _terminate: boolean) => ({
      ok: false as const,
      reason: "No embedded terminal is open. Open a change view to start one.",
    });

    const result = injectImportCommand("/path/to/target", mockInject);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/No embedded terminal/);
  });

  it("includes the target path verbatim in the injected string", () => {
    const injected: string[] = [];
    const mockInject = (data: string, _terminate: boolean) => {
      injected.push(data);
      return { ok: true as const };
    };

    injectImportCommand("/Users/foo/my-project", mockInject);
    expect(injected[0]).toBe("/ithy-opsx:import /Users/foo/my-project");
  });
});

// ---- 503 scenario: Manager PTY not running (unit-level) --------------------
// The HTTP 503 path is exercised in server/index.ts when injectImportCommand
// returns ok: false. The unit test above covers that return shape. Full
// integration (HTTP 503 response) is verified manually in task 8.6.
