// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInitPackageSpec } from "./init-package-source";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "ithyno-init-source-"));
  roots.push(root);
  return root;
}

describe("resolveInitPackageSpec", () => {
  it("uses the current package root for an F5 development host", () => {
    const root = fixture();
    expect(resolveInitPackageSpec(root, true)).toBe(root);
  });

  it("resolves the tarball embedded in a debug VSIX", () => {
    const root = fixture();
    mkdirSync(join(root, "packages"));
    writeFileSync(join(root, "packages", "ithyno-debug.tgz"), "fixture");
    writeFileSync(
      join(root, "init-package-source.json"),
      JSON.stringify({ kind: "bundled", relativePath: "packages/ithyno-debug.tgz" }),
    );
    expect(resolveInitPackageSpec(root, false)).toBe(
      join(root, "packages", "ithyno-debug.tgz"),
    );
  });

  it("leaves release resolution to the shared version-matched installer", () => {
    const root = fixture();
    writeFileSync(join(root, "init-package-source.json"), JSON.stringify({ kind: "release" }));
    expect(resolveInitPackageSpec(root, false)).toBeUndefined();
  });

  it("rejects a bundled manifest whose tarball is missing", () => {
    const root = fixture();
    writeFileSync(
      join(root, "init-package-source.json"),
      JSON.stringify({ kind: "bundled", relativePath: "packages/missing.tgz" }),
    );
    expect(() => resolveInitPackageSpec(root, false)).toThrow("bundled init package is missing");
  });
});
