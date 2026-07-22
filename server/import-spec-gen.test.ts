// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test the preflight function in isolation — the subprocess spawn is
// tested at integration level in 7.3 (manual).
import { preflight } from "./import-spec-gen.js";

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
    // Create a minimal project structure
    await writeFile(join(tmpDir, "README.md"), "# Test Project\n");
    await writeFile(join(tmpDir, "index.ts"), "export default {};\n");

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.jobId).toBeTruthy();
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
    // This test verifies the 403 path using a custom authorization callback.
    // The actual server uses isAuthorizedImportPath which blocks /etc etc;
    // here we demonstrate that the preflight respects whatever callback is passed.
    const DENY_ALL = (_path: string) => false;
    const result = await preflight(tmpDir, false, DENY_ALL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it("returns filesToScan with relative paths (max 50)", async () => {
    // Create 60 source files
    for (let i = 0; i < 60; i++) {
      await writeFile(join(tmpDir, `file${i}.ts`), `export const x${i} = ${i};\n`);
    }

    const result = await preflight(tmpDir, false, ALWAYS_AUTHORIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.filesToScan.length).toBeLessThanOrEqual(50);
    // All entries should be relative paths (not starting with /)
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
});
