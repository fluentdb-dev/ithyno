// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  PLATFORM_ESBUILD_PACKAGES,
  assertEsbuildRuntimeVersions,
  createEsbuildRuntimeDependencies,
  normalizeEsbuildBinaryPermissions,
  resolveAuthoritativeEsbuildVersion,
} from "../vscode-extension/scripts/esbuild-permissions.mjs";

describe("VSIX esbuild executable permissions", () => {
  const tempDirs = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createTempRoot() {
    const root = mkdtempSync(resolve(tmpdir(), "ithyno-esbuild-mode-"));
    tempDirs.push(root);
    return root;
  }

  function writePackage(nodeModulesDir, packageName, version) {
    const packageJson = resolve(nodeModulesDir, ...packageName.split("/"), "package.json");
    mkdirSync(resolve(packageJson, ".."), { recursive: true });
    writeFileSync(packageJson, JSON.stringify({ name: packageName, version }));
  }

  it("generates one exact dependency version for the host and every platform binary", () => {
    const dependencies = createEsbuildRuntimeDependencies("0.28.1");

    expect(dependencies).toEqual({
      esbuild: "0.28.1",
      ...Object.fromEntries(PLATFORM_ESBUILD_PACKAGES.map((name) => [name, "0.28.1"])),
    });
  });

  it("resolves the authoritative version from the root installation and rejects a missing source", () => {
    const root = createTempRoot();
    writePackage(resolve(root, "node_modules"), "esbuild", "0.28.1");
    expect(resolveAuthoritativeEsbuildVersion(root)).toBe("0.28.1");

    const missingRoot = createTempRoot();
    expect(() => resolveAuthoritativeEsbuildVersion(missingRoot)).toThrow(
      /install repository dependencies before packaging/,
    );
  });

  it("accepts an aligned staged runtime", () => {
    const root = createTempRoot();
    for (const packageName of ["esbuild", ...PLATFORM_ESBUILD_PACKAGES]) {
      writePackage(root, packageName, "0.28.1");
    }

    expect(assertEsbuildRuntimeVersions(root, "0.28.1")).toEqual([
      "esbuild",
      ...PLATFORM_ESBUILD_PACKAGES,
    ]);
  });

  it("rejects missing and mismatched staged packages", () => {
    const mismatched = createTempRoot();
    for (const packageName of ["esbuild", ...PLATFORM_ESBUILD_PACKAGES]) {
      writePackage(mismatched, packageName, packageName === "@esbuild/darwin-arm64" ? "0.28.2" : "0.28.1");
    }
    expect(() => assertEsbuildRuntimeVersions(mismatched, "0.28.1")).toThrow(
      /@esbuild\/darwin-arm64 version 0\.28\.2 does not match expected esbuild version 0\.28\.1/,
    );

    const missing = createTempRoot();
    writePackage(missing, "esbuild", "0.28.1");
    expect(() => assertEsbuildRuntimeVersions(missing, "0.28.1")).toThrow(
      /cannot read @esbuild\/darwin-arm64 version/,
    );
  });

  it("selects direct and nested POSIX esbuild binaries without selecting Windows executables", () => {
    const root = createTempRoot();

    const direct = resolve(root, "@esbuild", "darwin-arm64", "bin", "esbuild");
    const nested = resolve(root, "esbuild", "node_modules", "@esbuild", "linux-x64", "bin", "esbuild");
    const windows = resolve(root, "@esbuild", "win32-x64", "esbuild.exe");

    for (const file of [direct, nested, windows]) {
      mkdirSync(resolve(file, ".."), { recursive: true });
      writeFileSync(file, "fixture");
      chmodSync(file, 0o644);
    }

    expect(normalizeEsbuildBinaryPermissions(root)).toEqual([direct, nested]);

    // Windows does not expose POSIX execute bits through chmod/stat. The
    // release VSIX is produced on Ubuntu, so mode assertions belong only on
    // POSIX runners; this test still locks discovery behavior on Windows.
    if (process.platform === "win32") return;

    expect(statSync(direct).mode & 0o777).toBe(0o755);
    expect(statSync(nested).mode & 0o777).toBe(0o755);
    expect(statSync(windows).mode & 0o777).toBe(0o644);
  });
});
