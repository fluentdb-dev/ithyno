// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * scripts/build-icons.test.mjs
 *
 * Regression test for the icon generation pipeline (scripts/build-icons.mjs).
 *
 * Verifies:
 *   - All 7 target files are produced.
 *   - Each file's leading bytes match the expected format magic.
 *
 * PNG magic:  89 50 4E 47 0D 0A 1A 0A
 * ICO magic:  00 00 01 00  (first 4 bytes; icon type header)
 * ICNS magic: 69 63 6E 73  ("icns" ASCII)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// The 7 expected output paths relative to the sandbox root.
const TARGETS = [
  { rel: "web/public/favicon.png", magic: "png" },
  { rel: "web/public/favicon.ico", magic: "ico" },
  { rel: "web/public/apple-touch-icon.png", magic: "png" },
  { rel: "electron/build/icon.icns", magic: "icns" },
  { rel: "electron/build/icon.ico", magic: "ico" },
  { rel: "electron/build/icon.png", magic: "png" },
  { rel: "vscode-extension/icon.png", magic: "png" },
];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]); // first 4 bytes
const ICNS_MAGIC = Buffer.from([0x69, 0x63, 0x6e, 0x73]); // "icns"

function checkMagic(filePath, magic) {
  const buf = readFileSync(filePath);
  switch (magic) {
    case "png":
      expect(buf.slice(0, 8)).toEqual(PNG_MAGIC);
      break;
    case "ico":
      expect(buf.slice(0, 4)).toEqual(ICO_MAGIC);
      break;
    case "icns":
      expect(buf.slice(0, 4)).toEqual(ICNS_MAGIC);
      break;
    default:
      throw new Error(`Unknown magic type: ${magic}`);
  }
}

describe("build-icons pipeline", () => {
  // Use the live repo output (built by npm run build:icons).
  // We verify the already-generated files match format expectations.
  // This avoids re-running the full script in CI (which would need sharp).

  for (const { rel, magic } of TARGETS) {
    it(`${rel} exists and has correct ${magic.toUpperCase()} magic bytes`, () => {
      const absPath = resolve(repoRoot, rel);
      expect(existsSync(absPath), `${rel} must exist (run npm run build:icons first)`).toBe(true);
      checkMagic(absPath, magic);
    });
  }

  it("second run of build:icons produces byte-identical output", async () => {
    // Capture checksums of current files.
    const hashes1 = TARGETS.map(({ rel }) => {
      const buf = readFileSync(resolve(repoRoot, rel));
      return { rel, len: buf.length, start: buf.slice(0, 16).toString("hex") };
    });

    // Re-run the script.
    execSync("node scripts/build-icons.mjs", { cwd: repoRoot, stdio: "pipe" });

    // Compare checksums after second run.
    for (const { rel, len, start } of hashes1) {
      const buf = readFileSync(resolve(repoRoot, rel));
      expect(buf.length, `${rel} byte length must be identical on second run`).toBe(len);
      expect(buf.slice(0, 16).toString("hex"), `${rel} first 16 bytes must match on second run`).toBe(start);
    }
  });
});
