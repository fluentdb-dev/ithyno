#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Print a summary of produced release artifacts (path + size in bytes).
// Invoked at the end of the release:build script.
import { statSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function globFiles(dir, patterns) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...globFiles(full, patterns));
    } else if (patterns.some((p) => entry.name.match(p))) {
      results.push(full);
    }
  }
  return results;
}

const vsixDir = resolve(repoRoot, "vscode-extension");
const electronDistDir = resolve(repoRoot, "electron", "dist");

const vsixFiles = globFiles(vsixDir, [/ithyno-.*\.vsix$/]);
const electronFiles = globFiles(electronDistDir, [
  /ithyno-.*\.(dmg|exe|AppImage)$/,
]);

const artifacts = [...vsixFiles, ...electronFiles];

if (artifacts.length === 0) {
  console.log("\n[release-summary] No artifacts found.");
} else {
  console.log("\n[release-summary] Produced artifacts:");
  for (const f of artifacts) {
    const rel = f.replace(repoRoot + "/", "");
    let size;
    try {
      size = statSync(f).size;
    } catch {
      size = "?";
    }
    console.log(`  ${rel}  (${size} bytes)`);
  }
}
