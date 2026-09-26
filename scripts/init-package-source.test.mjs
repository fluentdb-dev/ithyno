// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageInitPackageSource } from "./init-package-source.mjs";

const originalReleaseBuild = process.env.ITHYNO_RELEASE_BUILD;
const roots = [];

afterEach(() => {
  if (originalReleaseBuild === undefined) delete process.env.ITHYNO_RELEASE_BUILD;
  else process.env.ITHYNO_RELEASE_BUILD = originalReleaseBuild;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("stageInitPackageSource", () => {
  it("writes an explicit release manifest without packing the checkout", () => {
    process.env.ITHYNO_RELEASE_BUILD = "1";
    const stageDir = mkdtempSync(join(tmpdir(), "ithyno-stage-source-"));
    roots.push(stageDir);

    expect(stageInitPackageSource({ repoRoot: "/unused", stageDir })).toEqual({ kind: "release" });
    expect(JSON.parse(readFileSync(join(stageDir, "init-package-source.json"), "utf8"))).toEqual({
      kind: "release",
    });
  });

  it("writes a bundled manifest for a local debug package", () => {
    delete process.env.ITHYNO_RELEASE_BUILD;
    const stageDir = mkdtempSync(join(tmpdir(), "ithyno-stage-source-"));
    roots.push(stageDir);

    const result = stageInitPackageSource({
      repoRoot: "/checkout",
      stageDir,
      pack: ({ repoRoot, packagesDir }) => {
        expect(repoRoot).toBe("/checkout");
        writeFileSync(join(packagesDir, "ithyno-debug.tgz"), "fixture");
        return "ithyno-debug.tgz";
      },
    });

    expect(result).toEqual({ kind: "bundled", relativePath: "packages/ithyno-debug.tgz" });
    expect(JSON.parse(readFileSync(join(stageDir, "init-package-source.json"), "utf8"))).toEqual(result);
  });
});
