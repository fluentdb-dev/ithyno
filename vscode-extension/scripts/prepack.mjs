// SPDX-License-Identifier: GPL-3.0-or-later
// Pre-package: stage the ithyno monorepo assets (bin/, server/,
// web/dist/, templates/, top-level package.json, and production node_modules)
// into vscode-extension/host/ so vsce bundles them into the VSIX.
//
// At runtime, the extension's server-spawner resolves `bin/ithyno.js`
// relative to either the extension folder or one directory above it. The
// staged layout puts everything a level below the extension root so we
// support both.
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, "..");
const repoRoot = resolve(extRoot, "..");
const stageDir = resolve(extRoot, "host");

console.log(`[prepack] staging ${repoRoot} → ${stageDir}`);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const rel of ["bin", "server", "web/dist", "templates", "ithyno"]) {
  const src = resolve(repoRoot, rel);
  if (!existsSync(src)) {
    throw new Error(`missing required dir: ${rel} (run "npm run build" at repo root first)`);
  }
  const dst = resolve(stageDir, rel);
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

// Read the actual installed esbuild version to keep it synced
const esbuildPkgPath = resolve(repoRoot, "node_modules", "esbuild", "package.json");
let esbuildVersion = "0.28.1"; // fallback
try {
  const esbuildPkg = JSON.parse(readFileSync(esbuildPkgPath, "utf8"));
  esbuildVersion = esbuildPkg.version;
} catch {
  /* ignore */
}

// Add the platform-specific esbuild packages to dependencies so they are always installed
// regardless of the packaging host platform.
const platformEsbuilds = {
  "@esbuild/darwin-arm64": esbuildVersion,
  "@esbuild/darwin-x64": esbuildVersion,
  "@esbuild/linux-x64": esbuildVersion,
  "@esbuild/linux-arm64": esbuildVersion,
  "@esbuild/win32-x64": esbuildVersion,
  "@esbuild/win32-arm64": esbuildVersion,
};

const stagedPkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  license: rootPkg.license,
  type: rootPkg.type,
  bin: rootPkg.bin,
  dependencies: {
    ...depsMinusPty,
    ...platformEsbuilds,
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
