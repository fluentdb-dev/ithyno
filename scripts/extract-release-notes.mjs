#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync, writeFileSync } from "node:fs";

export function extractReleaseNotes(changelog, requestedVersion) {
  const version = requestedVersion.replace(/^v/, "");
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^## \\[${escaped}\\](?:\\s+-\\s+.*)?$`, "m");
  const match = heading.exec(changelog);

  if (!match) {
    throw new Error(`CHANGELOG section not found for ${version}`);
  }

  const bodyStart = match.index + match[0].length;
  const remainder = changelog.slice(bodyStart);
  const nextHeading = /^## \[/m.exec(remainder);
  const section = (nextHeading ? remainder.slice(0, nextHeading.index) : remainder).trim();

  if (!section) {
    throw new Error(`CHANGELOG section for ${version} is empty`);
  }

  return [
    `Built from tag \`v${version}\`.`,
    "",
    section,
    "",
    "## Downloads",
    "",
    "Choose the DMG for macOS, EXE for Windows, AppImage for Linux, VSIX for the VS Code extension, or TGZ for the project-local CLI package.",
    "",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , version, changelogPath = "CHANGELOG.md", outputPath = "release-notes.md"] = process.argv;
  if (!version) {
    console.error("Usage: node scripts/extract-release-notes.mjs <version-or-tag> [changelog] [output]");
    process.exit(1);
  }

  try {
    const notes = extractReleaseNotes(readFileSync(changelogPath, "utf8"), version);
    writeFileSync(outputPath, notes, "utf8");
    console.log(`Prepared ${outputPath} for ${version}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
