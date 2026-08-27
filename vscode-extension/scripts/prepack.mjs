// SPDX-License-Identifier: GPL-3.0-or-later
// Pre-package: stage the ithyno monorepo assets (bin/, server/,
// web/dist/, templates/, top-level package.json, and production node_modules)
// into vscode-extension/host/ so vsce bundles them into the VSIX.
//
// At runtime, the extension's server-spawner resolves `bin/ithyno.js`
// relative to either the extension folder or one directory above it. The
// staged layout puts everything a level below the extension root so we
// support both.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  PLATFORM_ESBUILD_PACKAGES,
  assertEsbuildRuntimeVersions,
  createEsbuildRuntimeDependencies,
  normalizeEsbuildBinaryPermissions,
  resolveAuthoritativeEsbuildVersion,
} from "./esbuild-permissions.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, "..");
const repoRoot = resolve(extRoot, "..");
const stageDir = resolve(extRoot, "host");

console.log(`[prepack] staging ${repoRoot} → ${stageDir}`);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const rel of ["bin", "server", "web/dist", "templates", "ithyno", ".claude/commands/ithy-opsx"]) {
  const src = resolve(repoRoot, rel);
  if (!existsSync(src)) {
    throw new Error(`missing required dir: ${rel} (run "npm run build" at repo root first)`);
  }
  const dst = resolve(stageDir, rel);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}

const claudeSkillsRoot = resolve(repoRoot, ".claude", "skills");
for (const name of readdirSync(claudeSkillsRoot).filter((entry) => entry.startsWith("ithy-opsx-"))) {
  const src = resolve(claudeSkillsRoot, name);
  const dst = resolve(stageDir, ".claude", "skills", name);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}

// Also stage a minimal package.json so `bin/ithyno.js` treats stageDir
// as the package root and can resolve `server/` etc. relative to it.
//
// Deliberately DROP `@homebridge/node-pty-prebuilt-multiarch` from the staged
// dependencies: the VS Code extension routes PTY interactions to VS Code's
// built-in terminal (`vscode.window.createTerminal`) — the server's xterm/PTY
// endpoints are never invoked from the webview. Shipping node-pty would only
// add ~4MB of native binaries and requires a per-platform prebuild dance that
// vsce can't manage. The server's `loadPty()` catches the missing-module
// error and reports `terminal.available: false` via `/api/health`, so the
// dashboard degrades gracefully.
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const { "@homebridge/node-pty-prebuilt-multiarch": _dropPty, ...depsMinusPty } = rootPkg.dependencies;

// Pin both the JavaScript host and every cross-platform binary to the exact
// version installed from the repository lockfile. Leaving `esbuild` itself
// transitive lets this fresh staging install resolve a newer host version.
const esbuildVersion = resolveAuthoritativeEsbuildVersion(repoRoot);
const esbuildRuntimeDependencies = createEsbuildRuntimeDependencies(esbuildVersion);

const stagedPkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  license: rootPkg.license,
  type: rootPkg.type,
  bin: rootPkg.bin,
  dependencies: {
    ...depsMinusPty,
    ...esbuildRuntimeDependencies,
  },
};
writeFileSync(resolve(stageDir, "package.json"), JSON.stringify(stagedPkg, null, 2));

// Install production deps inside stageDir so require()/import resolution
// works when the extension host launches the bin.
console.log("[prepack] npm install --omit=dev (this can take a minute)…");
execSync("npm install --omit=dev --no-audit --no-fund --ignore-scripts --force", {
  cwd: stageDir,
  stdio: "inherit",
});

const stagedNodeModules = resolve(stageDir, "node_modules");
const validatedEsbuildPackages = assertEsbuildRuntimeVersions(stagedNodeModules, esbuildVersion);
console.log(
  `[prepack] validated ${validatedEsbuildPackages.length} esbuild package(s) at ${esbuildVersion}`,
);

// npm installs packages for platforms other than the current host because the
// VSIX is cross-platform. On Ubuntu, foreign POSIX binaries can be written
// without execute bits; VS Code then extracts them as 0644 and tsx cannot
// spawn esbuild on macOS. Normalize the archive mode before vsce packages it.
const normalizedEsbuildBinaries = normalizeEsbuildBinaryPermissions(stagedNodeModules);
const expectedPosixEsbuilds = PLATFORM_ESBUILD_PACKAGES.filter((name) => !name.includes("win32")).length;
if (normalizedEsbuildBinaries.length < expectedPosixEsbuilds) {
  throw new Error(
    `expected at least ${expectedPosixEsbuilds} POSIX esbuild binaries, found ${normalizedEsbuildBinaries.length}`,
  );
}
console.log(`[prepack] normalized ${normalizedEsbuildBinaries.length} esbuild executable(s)`);

// Copy the repo-root LICENSE next to package.json so `vsce` finds it
// (it looks for LICENSE / LICENSE.md / LICENSE.txt in the package root
// and warns when absent). Kept out of git via .gitignore since it's a
// build artifact; the source of truth is repoRoot/LICENSE.
const licenseSrc = resolve(repoRoot, "LICENSE");
const licenseDst = resolve(extRoot, "LICENSE");
if (existsSync(licenseSrc)) {
  cpSync(licenseSrc, licenseDst);
  console.log(`[prepack] copied LICENSE → ${licenseDst}`);
}

console.log("[prepack] done");
