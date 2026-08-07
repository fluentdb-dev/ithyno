// SPDX-License-Identifier: GPL-3.0-or-later
// Pre-package: stage the ithyno monorepo assets (bin/, server/,
// web/dist/, templates/, vendor/agmsg/, top-level package.json, and production node_modules)
// into electron/host/ so electron-builder bundles them into extraResources.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, "..");
const repoRoot = resolve(extRoot, "..");
const stageDir = resolve(extRoot, "host");

console.log(`[electron prepack] staging ${repoRoot} → ${stageDir}`);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const rel of ["bin", "server", "web/dist", "templates", "vendor/agmsg", "ithyno"]) {
  const src = resolve(repoRoot, rel);
  if (!existsSync(src)) {
    throw new Error(`missing required dir: ${rel} (run "npm run build" at repo root first)`);
  }
  const dst = resolve(stageDir, rel);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}

// Stage package.json and tsconfig.json so the server runs correctly
for (const file of ["package.json", "tsconfig.json", "LICENSE"]) {
  const src = resolve(repoRoot, file);
  if (existsSync(src)) {
    cpSync(src, resolve(stageDir, file));
  }
}

// Install production deps inside stageDir so require()/import resolution
// works when the Electron shell launches the server.
console.log("[electron prepack] npm install --omit=dev (this can take a minute)…");
execSync("npm install --omit=dev --no-audit --no-fund --ignore-scripts", {
  cwd: stageDir,
  stdio: "inherit",
});

// Copy the compiled node-pty binaries from the root node_modules since compiling them
// during staging fails due to python version / distutils issues.
const rootPtyBuild = resolve(repoRoot, "node_modules", "@homebridge", "node-pty-prebuilt-multiarch", "build");
const stagePtyBuild = resolve(stageDir, "node_modules", "@homebridge", "node-pty-prebuilt-multiarch", "build");

if (existsSync(rootPtyBuild)) {
  console.log("[electron prepack] copying compiled node-pty build from root node_modules...");
  mkdirSync(dirname(stagePtyBuild), { recursive: true });
  cpSync(rootPtyBuild, stagePtyBuild, { recursive: true });
} else {
  console.warn("[electron prepack] warning: compiled node-pty build NOT found in root node_modules");
}

// Copy fsevents.node on macOS if present, to optimize file watching in chokidar
const rootFsevents = resolve(repoRoot, "node_modules", "fsevents", "fsevents.node");
const stageFsevents = resolve(stageDir, "node_modules", "fsevents", "fsevents.node");
if (existsSync(rootFsevents)) {
  console.log("[electron prepack] copying compiled fsevents.node from root node_modules...");
  mkdirSync(dirname(stageFsevents), { recursive: true });
  cpSync(rootFsevents, stageFsevents);
}

console.log("[electron prepack] done");
