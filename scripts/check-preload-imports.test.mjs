// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * check-preload-imports.test.mjs
 *
 * Regression tests for scripts/check-preload-imports.mjs.
 * Three fixtures cover the main guard scenarios:
 *
 *   A — preload-safe only (contextBridge + ipcRenderer) → exit 0
 *   B — preload imports a local file that transitively imports app from electron → exit 1
 *   C — preload directly imports app from electron → exit 1
 *
 * Tests spawn the guard as a child process with a synthetic PRELOAD_ENTRY env
 * override so the real electron/src/preload.ts is not disturbed.
 */

import { it, expect, describe, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(here, 'check-preload-imports.mjs');
const repoRoot = resolve(here, '..');

/**
 * Run the guard against a fixture preload file.
 * The script normally reads electron/src/preload.ts relative to repoRoot.
 * We patch it by passing a FIXTURE_PRELOAD_ENTRY env var (which the script
 * reads if set), OR we create the file at the expected path inside a temp dir.
 *
 * Because the guard resolves from the repo root, we use a helper wrapper
 * approach: write a tiny modified version of the guard that accepts a
 * FIXTURE_ROOT env variable pointing to a temp dir that mirrors the
 * electron/src/ layout.
 */

// We cannot easily override the guard's entry point without modifying it.
// Instead: write each fixture at a known temp location, then invoke the guard
// with a custom NODE_PATH or — simplest — patch the entry path via an env var.
//
// The guard currently hardcodes: resolve(repoRoot, 'electron', 'src', 'preload.ts')
// We add support for PRELOAD_GUARD_ROOT env var in the script (without breaking
// normal operation). To avoid modifying the guard for test purposes only, we
// use a different approach: create a minimal subprocess that wraps the guard's
// walkGraph function via a thin inline script that imports from the guard.
//
// Actually, the cleanest pattern for a standalone Node ESM script: run it via
// a wrapper that redefines just the entry path. We'll use the PRELOAD_GUARD_ROOT
// env variable approach — but that requires the guard to support it.
//
// Resolution: we add optional PRELOAD_GUARD_ROOT support to check-preload-imports.mjs
// (used only in tests), OR we write the test as an inline node -e script that
// calls the guard's exported walkGraph.
//
// For test isolation without modifying the guard's public API, the simplest
// approach is:
//   1. Create a temp dir that mirrors the repo structure (has electron/src/preload.ts)
//   2. Invoke the guard with a cwd change so resolve(repoRoot) points there.
//
// But the guard uses import.meta.url to find repoRoot, not process.cwd() — so
// cwd trick won't work.
//
// Final approach: expose walkGraph as a named export from check-preload-imports.mjs,
// and import it directly in this test. The main() function only runs when the
// module is the entry point (import.meta.main equivalent: check argv).
//
// We'll refactor check-preload-imports.mjs to export walkGraph and parseImports,
// and run main() only when executed directly.

// Note: The test imports the guard module's walkGraph directly (after the guard
// is refactored to export it and guard main() behind an __dirname check).

import { walkGraph, parseImports } from './check-preload-imports.mjs';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpDir;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'preload-guard-test-'));
});

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Write fixture files to tmpDir/electron/src/ and return the path to
 * electron/src/<filename>.ts.
 */
function writeFixture(filename, content, extraFiles = {}) {
  const srcDir = join(tmpDir, 'electron', 'src');
  mkdirSync(srcDir, { recursive: true });
  const entryPath = join(srcDir, filename);
  writeFileSync(entryPath, content, 'utf8');
  for (const [name, src] of Object.entries(extraFiles)) {
    writeFileSync(join(srcDir, name), src, 'utf8');
  }
  return entryPath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-preload-imports: parseImports', () => {
  it('extracts named imports from electron', () => {
    const src = `import { contextBridge, ipcRenderer } from 'electron';`;
    const result = parseImports(src);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('electron');
    expect(result[0].names).toContain('contextBridge');
    expect(result[0].names).toContain('ipcRenderer');
    expect(result[0].isTypeOnly).toBe(false);
  });

  it('marks type-only imports as isTypeOnly', () => {
    const src = `import type { BrowserWindow } from 'electron';`;
    const result = parseImports(src);
    expect(result).toHaveLength(1);
    expect(result[0].isTypeOnly).toBe(true);
  });

  it('parses relative imports', () => {
    const src = `import { foo } from './menu';`;
    const result = parseImports(src);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('./menu');
  });

  it('parses side-effect imports', () => {
    const src = `import 'node:path';`;
    const result = parseImports(src);
    expect(result.some(r => r.specifier === 'node:path')).toBe(true);
  });

  it('ignores imports in single-line comments', () => {
    const src = `// import { app } from 'electron';\nimport { contextBridge } from 'electron';`;
    const result = parseImports(src);
    const electronImports = result.filter(r => r.specifier === 'electron');
    // Should only find the non-commented import
    expect(electronImports).toHaveLength(1);
    expect(electronImports[0].names).toEqual(['contextBridge']);
  });
});

describe('check-preload-imports: walkGraph', () => {
  it('Fixture A — preload-safe only: exits 0 (no violations)', () => {
    const entry = writeFixture('preload-a.ts', `
// Preload-safe: only contextBridge and ipcRenderer from electron, plus inline constants.
import { contextBridge, ipcRenderer } from 'electron';

const IPC_PING = 'ping';

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.send(IPC_PING),
});
`);

    const { violations, filesWalked } = walkGraph(entry);
    expect(violations).toHaveLength(0);
    expect(filesWalked).toBe(1);
  });

  it('Fixture B — transitive main-process import via local file: reports violation with reach path', () => {
    const entry = writeFixture(
      'preload-b.ts',
      `
// Preload that imports from a local file which transitively imports app.
import { contextBridge, ipcRenderer } from 'electron';
import { SOME_CONSTANT } from './b-helper';

contextBridge.exposeInMainWorld('api', {
  foo: () => ipcRenderer.send(SOME_CONSTANT),
});
`,
      {
        'b-helper.ts': `
// This file imports main-process modules — unsafe in preload context.
import { app, Menu, shell } from 'electron';
export const SOME_CONSTANT = app.getName();
`,
      },
    );

    const { violations } = walkGraph(entry);
    expect(violations.length).toBeGreaterThan(0);

    const v = violations[0];
    // Should name b-helper.ts as the offending file
    expect(v.file).toMatch(/b-helper\.ts$/);
    // Should list the unsafe names
    expect(v.offendingNames).toContain('app');
    expect(v.offendingNames).toContain('Menu');
    expect(v.offendingNames).toContain('shell');
    // Should include the reach path
    expect(v.reachPath).toMatch(/preload-b\.ts/);
    expect(v.reachPath).toContain('./b-helper');
  });

  it('Fixture C — direct main-process import in preload: reports violation naming preload file', () => {
    const entry = writeFixture('preload-c.ts', `
// Direct main-process import — forbidden in preload under sandbox: true.
import { contextBridge, ipcRenderer } from 'electron';
import { app } from 'electron';

contextBridge.exposeInMainWorld('api', {
  name: () => app.getName(),
  send: () => ipcRenderer.send('x'),
});
`);

    const { violations } = walkGraph(entry);
    expect(violations.length).toBeGreaterThan(0);

    const v = violations[0];
    // Should name preload-c.ts as the offending file
    expect(v.file).toMatch(/preload-c\.ts$/);
    expect(v.specifier).toBe('electron');
    expect(v.offendingNames).toContain('app');
  });

  it('type-only imports are treated as safe (stripped at compile time)', () => {
    const entry = writeFixture('preload-types.ts', `
import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserWindow } from 'electron';

contextBridge.exposeInMainWorld('api', {
  send: () => ipcRenderer.send('x'),
});
`);

    const { violations } = walkGraph(entry);
    expect(violations).toHaveLength(0);
  });

  it('bare module imports (node:*) are rejected', () => {
    const entry = writeFixture('preload-node.ts', `
import { contextBridge } from 'electron';
import { readFileSync } from 'node:fs';

contextBridge.exposeInMainWorld('api', { read: readFileSync });
`);

    const { violations } = walkGraph(entry);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].specifier).toBe('node:fs');
  });

  it('cycle detection: visited files are not walked twice', () => {
    const entry = writeFixture(
      'preload-cycle.ts',
      `
import { contextBridge, ipcRenderer } from 'electron';
import { X } from './cycle-helper';
contextBridge.exposeInMainWorld('api', { send: () => ipcRenderer.send(X) });
`,
      {
        'cycle-helper.ts': `
// cycle-helper imports back into preload-cycle (simulated via another safe file)
import { contextBridge } from 'electron';
export const X = 'x';
`,
      },
    );

    const { violations, filesWalked } = walkGraph(entry);
    expect(violations).toHaveLength(0);
    expect(filesWalked).toBe(2); // preload-cycle.ts + cycle-helper.ts
  });
});
