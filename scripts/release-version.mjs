#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Bump version across all four owned package.json files atomically.
// Usage: node scripts/release-version.mjs <new-version>
// Exits non-zero when the argument is not valid semver 2.0.0.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const semver = require("semver");

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const newVersion = process.argv[2];

if (!newVersion) {
  console.error("Usage: npm run release:version -- <new-version>");
  process.exit(1);
}

const valid = semver.valid(newVersion);
if (!valid) {
  console.error(
    `Invalid semver: "${newVersion}" is not a valid semver 2.0.0 string. No files were modified.`
  );
  process.exit(1);
}

// Owned manifests (vendor/agmsg is excluded — third-party tree).
const manifests = [
  resolve(repoRoot, "package.json"),
  resolve(repoRoot, "electron", "package.json"),
  resolve(repoRoot, "vscode-extension", "package.json"),
  resolve(repoRoot, "vscode-extension", "host", "package.json"),
];

// Read all first so we fail before writing anything if a file is missing.
const parsed = manifests.map((p) => {
  try {
    return { path: p, data: JSON.parse(readFileSync(p, "utf8")) };
  } catch (err) {
    if (err.code === "ENOENT") {
      // host/package.json is generated at build time; skip if absent.
      return { path: p, data: null };
    }
    throw err;
  }
});

// Write atomically (all or nothing).
for (const { path: p, data } of parsed) {
  if (data === null) continue;
  data.version = valid;
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Updated ${p.replace(repoRoot + "/", "")}`);
}

console.log(`Version bumped to ${valid}`);
