// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * check-preload-imports.mjs
 *
 * Pre-tsc guard that walks the import graph of electron/src/preload.ts and
 * rejects any import that is not preload-safe under Electron's sandbox mode.
 *
 * Background: When `sandbox: true` is set in BrowserWindow's webPreferences,
 * the preload script runs in a restricted environment that does NOT have access
 * to Node.js main-process APIs. Importing Electron main-process modules (app,
 * Menu, shell, dialog, BrowserWindow, ipcMain, screen, etc.) or any bare
 * Node module will throw at runtime — silently killing the preload before
 * contextBridge.exposeInMainWorld() runs.
 *
 * This guard closes that gap by failing at build time with a clear error,
 * so Manager verify's `npm run build` surfaces it before archive.
 *
 * See: docs/ideas/2026-07-21-preload-sandbox-import-guard.md (status: promoted)
 *
 * Usage (from repo root or electron/):
 *   node scripts/check-preload-imports.mjs
 *   node ../scripts/check-preload-imports.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Preload-safe allowlist (explicit — changing this is a deliberate code edit)
// ---------------------------------------------------------------------------
//
// From `electron`: ONLY contextBridge and ipcRenderer are preload-safe.
//   - contextBridge: exposes APIs to the renderer world
//   - ipcRenderer: sends/receives IPC messages from/to main
//   All other named imports (app, Menu, shell, dialog, BrowserWindow, screen,
//   ipcMain, nativeImage, Notification, powerMonitor, session, Tray, etc.)
//   are main-process-only and MUST be rejected.
//
// From relative paths ('./foo', '../bar'): allowed and recursed into
//   transitively. The files they resolve to are themselves subject to this
//   same allowlist check.
//
// Everything else (bare modules: 'node:fs', 'node:path', 'electron/main',
//   'electron/renderer', third-party packages): REJECTED.

/** Named imports from 'electron' that are preload-safe. */
const ELECTRON_SAFE_NAMES = new Set(['contextBridge', 'ipcRenderer']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * Resolve a relative specifier from a given directory to an absolute path.
 * Tries: <spec>.ts, <spec>.tsx, <spec>/index.ts, <spec>/index.tsx.
 * Returns null if nothing resolves.
 */
function resolveRelative(specifier, fromDir) {
  const candidates = [];
  const ext = extname(specifier);
  if (ext) {
    // Has extension — try as-is (but we only track .ts/.tsx)
    candidates.push(resolve(fromDir, specifier));
  } else {
    candidates.push(
      resolve(fromDir, specifier + '.ts'),
      resolve(fromDir, specifier + '.tsx'),
      resolve(fromDir, specifier, 'index.ts'),
      resolve(fromDir, specifier, 'index.tsx'),
    );
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Parse import specifiers from TypeScript source text.
 * Returns an array of { specifier, names, isTypeOnly }.
 *
 * Handles:
 *   import { a, b } from 'x'
 *   import * as ns from 'x'
 *   import defaultExport from 'x'
 *   import 'x'            (side-effect import)
 *   import type ...       (type-only — safe, stripped at compile time)
 *
 * Skips dynamic imports (import()) — those can't be statically walked.
 */
function parseImports(source) {
  const results = [];

  // Regex approach: match static import statements.
  // We use a multi-step approach:
  //   1. Strip single-line comments and string literals to avoid false matches.
  //   2. Match import lines.
  //
  // For robustness with multi-line imports we use a pattern that allows
  // the import clause to span lines (up to a reasonable count).

  // Step 1: Remove single-line comments (// ...) to avoid matching specifiers in comments.
  const stripped = source.replace(/\/\/[^\n]*/g, '');

  // Step 2: Match static import statements (not dynamic import()).
  // Pattern: import [type] <clause> from '<specifier>'
  //       or import '<specifier>'   (side-effect)
  const importRe =
    /^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm;
  const sideEffectRe = /^\s*import\s+['"]([^'"]+)['"]/gm;

  let m;

  // Side-effect imports (no clause)
  while ((m = sideEffectRe.exec(stripped)) !== null) {
    results.push({ specifier: m[1], names: [], isTypeOnly: false });
  }

  // Regular imports
  while ((m = importRe.exec(stripped)) !== null) {
    const isTypeOnly = Boolean(m[1]);
    const clause = m[2];
    const specifier = m[3];

    // Extract named imports from { a, b as c, type d }
    const names = [];
    const namedRe = /\{\s*([\s\S]*?)\s*\}/;
    const namedMatch = namedRe.exec(clause);
    if (namedMatch) {
      for (const part of namedMatch[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        // Skip 'type' keyword inline import type modifier and empty strings
        if (name && name !== 'type') names.push(name);
      }
    }

    results.push({ specifier, names, isTypeOnly });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Core walk
// ---------------------------------------------------------------------------

/**
 * Walk the import graph starting from `entryAbsPath`.
 * Returns { violations, filesWalked }.
 *
 * Each violation is:
 *   { file, specifier, offendingNames, reachPath }
 */
function walkGraph(entryAbsPath) {
  const visited = new Set();
  const violations = [];

  function visit(absPath, reachPath) {
    if (visited.has(absPath)) return;
    visited.add(absPath);

    let source;
    try {
      source = readFileSync(absPath, 'utf8');
    } catch {
      // File not readable — skip (may be a generated file or outside scope)
      return;
    }

    const imports = parseImports(source);
    const fileDir = dirname(absPath);
    // Relative display path (from repo root)
    const displayFile = absPath.startsWith(repoRoot + '/')
      ? absPath.slice(repoRoot.length + 1)
      : absPath;

    for (const { specifier, names, isTypeOnly } of imports) {
      // Type-only imports are stripped at compile time and never cross the
      // runtime boundary — treat as safe.
      if (isTypeOnly) continue;

      if (specifier === 'electron') {
        // Check each named import against the safe list.
        // If no named imports extracted (e.g., `import * as electron from 'electron'`
        // or side-effect `import 'electron'`), treat as unsafe.
        if (names.length === 0) {
          violations.push({
            file: displayFile,
            specifier,
            offendingNames: ['(namespace or side-effect)'],
            reachPath,
          });
          continue;
        }
        const unsafe = names.filter((n) => !ELECTRON_SAFE_NAMES.has(n));
        if (unsafe.length > 0) {
          violations.push({
            file: displayFile,
            specifier,
            offendingNames: unsafe,
            reachPath,
          });
        }
        // Safe names need no further recursion — 'electron' is a terminal node.
      } else if (specifier.startsWith('.')) {
        // Relative import — resolve and recurse.
        const resolved = resolveRelative(specifier, fileDir);
        if (resolved) {
          const newReachPath = reachPath ? `${reachPath} → ${specifier}` : specifier;
          visit(resolved, newReachPath);
        }
        // If not resolved, skip (may be a .js/.json file, or missing — tsc will catch)
      } else {
        // Bare module import (node:*, third-party, electron subpath) — REJECTED.
        violations.push({
          file: displayFile,
          specifier,
          offendingNames: [],
          reachPath,
        });
      }
    }
  }

  const entryDisplay = entryAbsPath.startsWith(repoRoot + '/')
    ? entryAbsPath.slice(repoRoot.length + 1)
    : entryAbsPath;

  visit(entryAbsPath, entryDisplay);

  return { violations, filesWalked: visited.size };
}

// ---------------------------------------------------------------------------
// Exports (for tests)
// ---------------------------------------------------------------------------

export { walkGraph, parseImports };

// ---------------------------------------------------------------------------
// Main (only runs when this file is the entry point)
// ---------------------------------------------------------------------------

function main() {
  const entryPath = resolve(repoRoot, 'electron', 'src', 'preload.ts');

  if (!existsSync(entryPath)) {
    console.error(`[preload-guard] ERROR: entry point not found: ${entryPath}`);
    process.exit(1);
  }

  const { violations, filesWalked } = walkGraph(entryPath);

  if (violations.length > 0) {
    for (const v of violations) {
      if (v.offendingNames.length > 0) {
        // Named import violation (electron unsafe names or bare module with extracted names)
        console.error(
          `[preload-guard] ${v.file} imports { ${v.offendingNames.join(', ')} } from '${v.specifier}' — not preload-safe`,
        );
      } else {
        // Bare module (no names extracted)
        console.error(
          `[preload-guard] ${v.file} imports '${v.specifier}' — not preload-safe (bare module imports are not allowed in preload)`,
        );
      }
      if (v.reachPath && v.reachPath !== v.file) {
        console.error(`  reached via: ${v.reachPath}`);
      }
    }
    process.exit(1);
  }

  console.log(`[preload-guard] preload.ts import graph OK (${filesWalked} files walked)`);
  process.exit(0);
}

// Detect direct execution in Node.js ESM: compare script URL to argv[1].
const isMain =
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
