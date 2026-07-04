// Pre-package: stage the openspec-ui monorepo assets (bin/, server/,
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

for (const rel of ["bin", "server", "web/dist", "templates"]) {
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
const stagedPkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  type: rootPkg.type,
  bin: rootPkg.bin,
  dependencies: depsMinusPty,
};
writeFileSync(resolve(stageDir, "package.json"), JSON.stringify(stagedPkg, null, 2));

// Install production deps inside stageDir so require()/import resolution
// works when the extension host launches the bin.
console.log("[prepack] npm install --omit=dev (this can take a minute)…");
execSync("npm install --omit=dev --no-audit --no-fund --ignore-scripts", {
  cwd: stageDir,
  stdio: "inherit",
});

console.log("[prepack] done");
