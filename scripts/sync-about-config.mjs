#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * sync-about-config.mjs
 *
 * Copies server/about-config.ts (the single authoritative source) to every
 * surface that cannot import it directly at build time due to isolated
 * tsconfig rootDir boundaries:
 *
 *   server/about-config.ts  ──▶  electron/src/about-config.ts
 *                           ──▶  vscode-extension/src/about-config.ts
 *
 * The destination files are gitignored build artifacts; this script must run
 * BEFORE `tsc` in each surface's build pipeline.
 *
 * Usage:
 *   node scripts/sync-about-config.mjs          # from repo root
 *   node ../scripts/sync-about-config.mjs       # from electron/ or vscode-extension/
 */

import { cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const src = resolve(repoRoot, 'server', 'about-config.ts');

if (!existsSync(src)) {
  console.error(`[sync-about-config] ERROR: source not found: ${src}`);
  process.exit(1);
}

const destinations = [
  resolve(repoRoot, 'electron', 'src', 'about-config.ts'),
  resolve(repoRoot, 'vscode-extension', 'src', 'about-config.ts'),
];

for (const dst of destinations) {
  cpSync(src, dst);
  console.log(`[sync-about-config] ${src} → ${dst}`);
}

console.log('[sync-about-config] done');
