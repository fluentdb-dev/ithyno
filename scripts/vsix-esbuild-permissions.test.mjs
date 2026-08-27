// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { normalizeEsbuildBinaryPermissions } from "../vscode-extension/scripts/esbuild-permissions.mjs";

describe("VSIX esbuild executable permissions", () => {
  const tempDirs = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes direct and nested POSIX esbuild binaries without touching Windows executables", () => {
    const root = mkdtempSync(resolve(tmpdir(), "ithyno-esbuild-mode-"));
    tempDirs.push(root);

    const direct = resolve(root, "@esbuild", "darwin-arm64", "bin", "esbuild");
    const nested = resolve(root, "esbuild", "node_modules", "@esbuild", "linux-x64", "bin", "esbuild");
    const windows = resolve(root, "@esbuild", "win32-x64", "esbuild.exe");

    for (const file of [direct, nested, windows]) {
      mkdirSync(resolve(file, ".."), { recursive: true });
      writeFileSync(file, "fixture");
      chmodSync(file, 0o644);
    }

    expect(normalizeEsbuildBinaryPermissions(root)).toEqual([direct, nested]);
    expect(statSync(direct).mode & 0o777).toBe(0o755);
    expect(statSync(nested).mode & 0o777).toBe(0o755);
    expect(statSync(windows).mode & 0o777).toBe(0o644);
  });
});
