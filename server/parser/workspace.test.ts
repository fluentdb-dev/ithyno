// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { changeIdForPath, resolveOpenspecDir, scanWorkspace } from "./workspace.js";

// These run with POSIX path semantics on the test host. The implementation uses
// path.relative + path.sep (OS-native), so the same logic resolves Windows
// backslash paths when executed on Windows.
describe("changeIdForPath (cross-platform)", () => {
  const dir = "/proj/openspec";

  it("resolves a change from its tasks.md", () => {
    expect(changeIdForPath(dir, "/proj/openspec/changes/add-foo/tasks.md")).toBe("add-foo");
  });

  it("resolves a change from a nested delta spec", () => {
    expect(changeIdForPath(dir, "/proj/openspec/changes/add-foo/specs/cap/spec.md")).toBe("add-foo");
  });

  it("returns null for archived changes", () => {
    expect(changeIdForPath(dir, "/proj/openspec/changes/archive/2026-01-01-x/tasks.md")).toBeNull();
  });

  it("returns null for paths outside changes/", () => {
    expect(changeIdForPath(dir, "/proj/openspec/specs/cap/spec.md")).toBeNull();
  });

  it("returns null for the changes directory itself", () => {
    expect(changeIdForPath(dir, "/proj/openspec/changes")).toBeNull();
  });

  it("returns null for an unrelated path", () => {
    expect(changeIdForPath(dir, "/somewhere/else/file.md")).toBeNull();
  });
});

// ---- F1 regression: /api/state must return exists: true after import ---------
//
// Simulates the critical bug from round 2: ithyno starts without openspec/,
// the import sub-agent creates it at runtime, and the server's /api/state
// handler must now return { exists: true, generatedMarkerPresent: true }.
//
// The fix in server/index.ts calls resolveOpenspecDir(PROJECT_ROOT) on every
// /api/state request rather than using the boot-time cached const. This test
// validates that the primitives used by that fix behave correctly:
//   1. resolveOpenspecDir returns null before openspec/ exists
//   2. resolveOpenspecDir returns a non-null path once openspec/changes/ exists
//   3. scanWorkspace(resolvedDir, projectRoot) returns exists: true, generatedMarkerPresent: true
describe("resolveOpenspecDir + scanWorkspace — import runtime scenario (F1 regression)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "workspace-import-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("resolveOpenspecDir returns null when openspec/ does not exist", () => {
    const result = resolveOpenspecDir(tmpDir);
    expect(result).toBeNull();
  });

  it("resolveOpenspecDir returns the openspec/ path once openspec/changes/ is created", async () => {
    await mkdir(join(tmpDir, "openspec", "changes"), { recursive: true });
    const result = resolveOpenspecDir(tmpDir);
    expect(result).toBe(join(tmpDir, "openspec"));
  });

  it("scanWorkspace returns exists: true, generatedMarkerPresent: true after import completes", async () => {
    // Simulate what the import sub-agent does:
    // 1. openspec init creates openspec/changes/
    await mkdir(join(tmpDir, "openspec", "changes"), { recursive: true });
    // 2. sub-agent writes specs, then writes GENERATED.md
    await writeFile(join(tmpDir, "openspec", "GENERATED.md"), "# Generated\n");

    // The fix: /api/state re-calls resolveOpenspecDir each request
    const liveOpenspecDir = resolveOpenspecDir(tmpDir);
    expect(liveOpenspecDir).not.toBeNull();

    const state = await scanWorkspace(liveOpenspecDir, tmpDir);
    expect(state.exists).toBe(true);
    expect(state.generatedMarkerPresent).toBe(true);
  });

  it("scanWorkspace with stale null openspecDir returns exists: false even when GENERATED.md present", async () => {
    // This documents the old (broken) behavior: the module-level const was null
    // at boot and never updated, so /api/state always returned exists: false.
    await mkdir(join(tmpDir, "openspec", "changes"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "GENERATED.md"), "# Generated\n");

    // Simulate the stale boot-time null
    const staleOpenspecDir = null;
    const state = await scanWorkspace(staleOpenspecDir, tmpDir);
    // Old behavior: exists: false even though openspec/ is there
    expect(state.exists).toBe(false);
    // But generatedMarkerPresent is computed independently
    expect(state.generatedMarkerPresent).toBe(true);
    // This is why the client predicate state.exists && state.generatedMarkerPresent
    // never fired — the server fix addresses this by re-resolving on each call.
  });
});
