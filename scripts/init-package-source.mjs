// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

function packCheckout({ repoRoot, packagesDir }) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmCache = mkdtempSync(join(tmpdir(), "ithyno-npm-pack-"));
  let stdout;
  try {
    stdout = execFileSync(
      npmCmd,
      ["pack", "--pack-destination", packagesDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, NPM_CONFIG_CACHE: npmCache },
        stdio: ["ignore", "pipe", "inherit"],
        shell: process.platform === "win32",
      },
    );
  } finally {
    rmSync(npmCache, { recursive: true, force: true });
  }
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

/**
 * Write the explicit initialization-package contract consumed by packaged
 * Electron and VSIX launchers. Release builds point at the matching GitHub
 * Release asset. Local/debug packages carry an npm tarball made from the
 * current checkout, so an installed debug VSIX never depends on the original
 * worktree remaining at its build-time absolute path.
 */
export function stageInitPackageSource({ repoRoot, stageDir, pack = packCheckout }) {
  const manifestPath = join(stageDir, "init-package-source.json");
  if (process.env.ITHYNO_RELEASE_BUILD === "1") {
    writeFileSync(manifestPath, JSON.stringify({ kind: "release" }, null, 2) + "\n");
    return { kind: "release" };
  }

  const packagesDir = join(stageDir, "packages");
  mkdirSync(packagesDir, { recursive: true });
  const filename = pack({ repoRoot, packagesDir });
  if (!filename?.endsWith(".tgz") || basename(filename) !== filename) {
    throw new Error(`npm pack did not produce a safe ithyno tarball filename: ${JSON.stringify(filename)}`);
  }
  const relativePath = `packages/${filename}`;
  writeFileSync(
    manifestPath,
    JSON.stringify({ kind: "bundled", relativePath }, null, 2) + "\n",
  );
  return { kind: "bundled", relativePath };
}
