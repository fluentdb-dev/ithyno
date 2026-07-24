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

  // F2: preflight must reject projects whose total code+docs size exceeds the
  // 50 MB cap with HTTP 400. We use a sparse file (truncate to 51 MB) so
  // lstat reports a large apparent size without writing 51 MB to disk.
  it("rejects 400 when total file size exceeds 50 MB cap", async () => {
    const { truncate } = await import("node:fs/promises");
    const FIFTY_ONE_MB = 51 * 1024 * 1024;

    // A sparse .ts file: lstat reports its apparent size as 51 MB.
    const sparsePath = join(tmpDir, "sparse.ts");
    await writeFile(sparsePath, "");
    await truncate(sparsePath, FIFTY_ONE_MB);

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.reason).toMatch(/exceeds/);
    expect(result.reason).toMatch(/50 MB/);
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

  // F4: targetPath containing control characters must be rejected before
  // reaching the PTY, preventing shell injection.
  it("rejects 400 when targetPath contains a newline (\\n)", () => {
    const mockInject = (_data: string, _terminate: boolean) => ({ ok: true as const });
    const result = injectImportCommand("/path/evil\ncommand", mockInject);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result as { status?: number }).status).toBe(400);
    expect(result.reason).toMatch(/control characters/);
  });

  it("rejects 400 when targetPath contains a carriage return (\\r)", () => {
    const mockInject = (_data: string, _terminate: boolean) => ({ ok: true as const });
    const result = injectImportCommand("/path/evil\rcommand", mockInject);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result as { status?: number }).status).toBe(400);
  });

  it("rejects 400 when targetPath contains a NUL byte", () => {
    const mockInject = (_data: string, _terminate: boolean) => ({ ok: true as const });
    const result = injectImportCommand("/path/evil\x00command", mockInject);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result as { status?: number }).status).toBe(400);
  });

  it("does not call inject when control chars are present", () => {
    let called = false;
    const mockInject = (_data: string, _terminate: boolean) => {
      called = true;
      return { ok: true as const };
    };
    injectImportCommand("/path/\nevil", mockInject);
    expect(called).toBe(false);
  });
});

// ---- 503 scenario: Manager PTY not running (unit-level) --------------------
// The HTTP 503 path is exercised in server/index.ts when injectImportCommand
// returns ok: false. The unit test above covers that return shape. Full
// integration (HTTP 503 response) is verified manually in task 8.6.

// ---- Doctor gate (enable-import-both-patterns task 9.3) --------------------
// The 409 doctor gate lives in server/index.ts, NOT in preflight() itself.
// Preflight has no knowledge of doctor. These tests document the HTTP-layer
// behavior via the contract: when doctor returns readyForManager: false, the
// endpoint should 409 before running preflight. We test the preflight function
// directly here — endpoint-level behavior is manual (task 10.7).

describe("preflight — doctor independence", () => {
  // Preflight itself does not call runDoctor(). The gate in server/index.ts
  // runs the doctor check first. These tests simply confirm that preflight
  // still returns ok: true for a valid root, independent of whether a doctor
  // check would pass or fail — the two concerns are separated.
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "preflight-doctor-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("preflight ok: true for a project root (doctor check is orthogonal)", async () => {
    await writeFile(join(tmpDir, "main.ts"), "export {};\n");
    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
  });

  it("preflight 409 when openspec/ exists (independent of doctor)", async () => {
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });
});

// ---- Pattern hint (enable-import-both-patterns task 3.2) -------------------
// The pattern: "A" | "B" derivation (`targetPath === PROJECT_ROOT`) lives in
// server/index.ts around the preflight result. The computation is simple and
// tied to a runtime-constant (PROJECT_ROOT). We test the discrimination logic
// in isolation below.

describe("pattern classification logic", () => {
  function classifyPattern(targetPath: string, projectRoot: string): "A" | "B" {
    return targetPath === projectRoot ? "B" : "A";
  }

  it("Pattern B when targetPath equals PROJECT_ROOT", () => {
    expect(classifyPattern("/home/user/project", "/home/user/project")).toBe("B");
  });

  it("Pattern A when targetPath differs from PROJECT_ROOT", () => {
    expect(classifyPattern("/home/user/other", "/home/user/project")).toBe("A");
  });

  it("Pattern A when targetPath is a subdirectory of PROJECT_ROOT", () => {
    expect(classifyPattern("/home/user/project/subdir", "/home/user/project")).toBe("A");
  });
});
