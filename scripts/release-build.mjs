#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Orchestrate the full release build:
//   typecheck → test → build → vscode package → electron package (host platform)
// Then print a summary of produced artifacts.
// Fails fast if any step exits non-zero.
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function run(label, cmd, opts = {}) {
  console.log(`\n[release:build] ${label}`);
  console.log(`  > ${cmd}`);
  execSync(cmd, { cwd: repoRoot, stdio: "inherit", ...opts });
}

// Detect platform to know which electron package target to run.
const platform = process.platform;
let electronScript;
if (platform === "darwin") {
  electronScript = "package:mac";
} else if (platform === "win32") {
  electronScript = "package:win";
} else {
  electronScript = "package:linux";
}

run("typecheck", "npm run typecheck");
run("test", "npm test");
run("build (web)", "npm run build");
run("vscode-extension package", "npm run --workspace ithyno-vscode package");
run(
  `electron package (${platform})`,
  `npm run --workspace ithyno-electron ${electronScript}`
);

// Print artifact summary.
run("artifact summary", "node scripts/release-summary.mjs");
