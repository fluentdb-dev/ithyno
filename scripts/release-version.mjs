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

// Existence check — fail before any write if a manifest is missing.
const missing = manifests.filter((p) => {
  try {
    readFileSync(p);
    return false;
  } catch (err) {
    if (err.code === "ENOENT") return true;
    throw err;
  }
});
if (missing.length > 0) {
  console.error(
    `Cannot bump version: the following manifest(s) are missing:\n` +
      missing.map((p) => `  ${p.replace(repoRoot + "/", "")}`).join("\n") +
      `\nNo files were modified.`
  );
  process.exit(1);
}

// Read all manifests into memory, then write in a batch.
const parsed = manifests.map((p) => ({
  path: p,
  data: JSON.parse(readFileSync(p, "utf8")),
}));

let written = 0;
for (const { path: p, data } of parsed) {
  data.version = valid;
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
  written += 1;
  console.log(`Updated ${p.replace(repoRoot + "/", "")}`);
}

console.log(`Version bumped to ${valid}`);
