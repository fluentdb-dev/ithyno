// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { changeIdForPath } from "./workspace.js";

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
