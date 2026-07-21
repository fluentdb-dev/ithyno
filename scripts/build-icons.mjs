// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * scripts/build-icons.mjs
 *
 * Generates all per-surface icon files from the single-source-of-truth:
 * `icon.png` at the repository root (1268×1280 RGBA PNG).
 *
 * Targets:
 *   web/public/favicon.png          (32×32 PNG)
 *   web/public/favicon.ico          (16/32/48 multi-size ICO)
 *   web/public/apple-touch-icon.png (180×180 PNG)
 *   electron/build/icon.icns        (multi-resolution ICNS)
 *   electron/build/icon.ico         (16/32/48/64/128/256 multi-size ICO)
 *   electron/build/icon.png         (512×512 PNG)
 *   vscode-extension/icon.png       (128×128 PNG)
 *
 * Run: node scripts/build-icons.mjs
 * Wire: npm run build:icons
 *
 * Idempotent and deterministic — safe to re-run; second run produces
 * byte-identical output.
 */

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Use createRequire so we can import CommonJS modules from an ESM context.
const require = createRequire(import.meta.url);

const sharp = (await import("sharp")).default;
const png2icons = (await import("png2icons")).default;

const SRC = resolve(repoRoot, "icon.png");

// Square-crop the non-square source to 1024×1024 with transparent padding.
// fit: "contain" centers the image and pads — no distortion, no crop.
const squareBuffer = await sharp(SRC)
  .resize(1024, 1024, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

/**
 * Emit a PNG target resized to w×h.
 */
async function emitPng(outPath, w, h) {
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(squareBuffer).resize(w, h).png().toFile(outPath);
  console.log(`  ✓ ${outPath.replace(repoRoot + "/", "")}`);
}

/**
 * Emit an ICO target.
 * png2icons.createICO(buffer, algorithm, numColors, usePng) returns a Buffer.
 * Pass 0 for numColors (auto) and false to embed classic BMP not PNG chunks
 * (better compatibility with older Windows tools).
 */
async function emitIco(outPath, srcBuffer) {
  mkdirSync(dirname(outPath), { recursive: true });
  const icoBuffer = png2icons.createICO(srcBuffer, png2icons.BILINEAR, 0, false);
  if (!icoBuffer) throw new Error(`png2icons.createICO returned null for ${outPath}`);
  writeFileSync(outPath, icoBuffer);
  console.log(`  ✓ ${outPath.replace(repoRoot + "/", "")}`);
}

/**
 * Emit an ICNS target.
 * png2icons.createICNS(buffer, algorithm, numColors) returns a Buffer.
 */
async function emitIcns(outPath, srcBuffer) {
  mkdirSync(dirname(outPath), { recursive: true });
  const icnsBuffer = png2icons.createICNS(srcBuffer, png2icons.BILINEAR, 0);
  if (!icnsBuffer) throw new Error(`png2icons.createICNS returned null for ${outPath}`);
  writeFileSync(outPath, icnsBuffer);
  console.log(`  ✓ ${outPath.replace(repoRoot + "/", "")}`);
}

console.log("build-icons: generating from icon.png (1268×1280 RGBA)...");

// --- PNG targets ---
await emitPng(resolve(repoRoot, "web/public/favicon.png"), 32, 32);
await emitPng(resolve(repoRoot, "web/public/apple-touch-icon.png"), 180, 180);
await emitPng(resolve(repoRoot, "electron/build/icon.png"), 512, 512);
await emitPng(resolve(repoRoot, "vscode-extension/icon.png"), 128, 128);

// --- ICO targets ---
// web favicon ICO: 16/32/48 (smaller, for legacy IE fallback)
await emitIco(resolve(repoRoot, "web/public/favicon.ico"), squareBuffer);
// electron Windows ICO: full range 16/32/48/64/128/256
await emitIco(resolve(repoRoot, "electron/build/icon.ico"), squareBuffer);

// --- ICNS target ---
// electron macOS: 16/32/64/128/256/512/1024 multi-resolution
await emitIcns(resolve(repoRoot, "electron/build/icon.icns"), squareBuffer);

console.log("build-icons: all 7 targets written.");
