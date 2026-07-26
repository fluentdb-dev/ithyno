// SPDX-License-Identifier: GPL-3.0-or-later
// First-launch installer for the vendored fujibee/agmsg tree
// (bundle-agmsg-in-electron). Copies the shell scripts into the
// user's Claude plugin directory when they're absent, so the
// dispatcher's agmsg branch works without a manual `/plugin
// marketplace add fujibee/agmsg` step.
//
// CLI users are untouched — this file is only wired into the
// Electron `app.whenReady()` chain (see main.ts).

import { app, dialog } from 'electron';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveGitBash } from './resolve-git-bash';

const TARGET_ROOT = join(homedir(), '.agents', 'skills', 'agmsg');
const TARGET_MARKER = join(TARGET_ROOT, 'scripts', 'send.sh');
const NEVER_ASK_MARKER = join(homedir(), '.ithyno-config', 'skip-agmsg-install');

/** agmsg's own runtime dependency (see vendor/agmsg/README.md) — checked
 *  on Windows only, where it's not guaranteed to be present the way it
 *  usually is on macOS. */
function hasSqlite3(): boolean {
  try {
    return spawnSync('where', ['sqlite3'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

/**
 * Resolve the vendored agmsg tree in both dev (electron/out/main.js →
 * ../../vendor/agmsg) and packaged (extraResources copies vendor/
 * under process.resourcesPath/app/vendor/agmsg) layouts.
 */
function resolveVendorRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app', 'vendor', 'agmsg');
  }
  return resolve(app.getAppPath(), '..', 'vendor', 'agmsg');
}

/** Recursively chmod every `.sh` file under `dir` to 0755. Electron-
 *  builder is inconsistent about preserving executable bits across
 *  extraResources copies; this makes the install path deterministic. */
function chmodShellScripts(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      chmodShellScripts(full);
    } else if (entry.endsWith('.sh')) {
      try {
        chmodSync(full, 0o755);
      } catch (err) {
        console.warn(`[agmsg-installer] chmod failed for ${full}:`, err);
      }
    }
  }
}

/**
 * Guarantee `~/.agents/skills/agmsg/scripts/send.sh` exists, prompting
 * the user on first launch when it doesn't.
 *
 * On Windows, agmsg's own runtime deps (bash + sqlite3, per
 * vendor/agmsg/README.md) aren't guaranteed present the way they are on
 * macOS — gate the prompt on both being resolvable first. Git Bash is
 * resolved via `resolveGitBash()` (never a bare PATH search for `bash`
 * — see its doc comment for why). The install step itself (a plain
 * recursive copy + best-effort chmod, below) needs no shell at all, on
 * any platform; the Git Bash check exists only to confirm the installed
 * scripts will actually be runnable later, when the live Manager agent
 * invokes them through its own Bash tool.
 *
 * Called from `app.whenReady()` in main.ts before window creation.
 */
export async function ensureAgmsgInstalled(): Promise<void> {
  if (platform() === 'win32') {
    const gitBash = resolveGitBash();
    const sqlite3 = hasSqlite3();
    if (!gitBash || !sqlite3) {
      const missing = [!gitBash && 'Git Bash', !sqlite3 && 'sqlite3'].filter(Boolean).join(', ');
      console.warn(
        `[agmsg-installer] Windows: ${missing} not found — skipping install prompt`,
      );
      return;
    }
  }

  // Already installed (either by ithyno's prior first-launch or by the
  // user via `/plugin marketplace add fujibee/agmsg`).
  if (existsSync(TARGET_MARKER)) return;

  // User opted out earlier.
  if (existsSync(NEVER_ASK_MARKER)) return;

  const vendorRoot = resolveVendorRoot();
  if (!existsSync(join(vendorRoot, 'scripts', 'send.sh'))) {
    // The vendored tree is missing — likely a dev build without the
    // submodule initialized. Log and skip; the user can still run
    // `/plugin marketplace add fujibee/agmsg` manually.
    console.warn(
      `[agmsg-installer] vendored agmsg tree not found at ${vendorRoot} — skipping install prompt`,
    );
    return;
  }

  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Install', 'Skip', 'Never ask'],
    defaultId: 0,
    cancelId: 1,
    title: 'Install agmsg?',
    message: 'Install agmsg for multi-agent workflows?',
    detail:
      'ithyno uses agmsg to run multiple AI agents in parallel tmux ' +
      'panes. It requires ~1 MB of shell scripts installed at ' +
      '~/.agents/skills/agmsg/.\n\n' +
      'Choose "Skip" to install later, or "Never ask" to hide this ' +
      'dialog on future launches.',
  });

  if (response === 0) {
    // Install: copy vendor/agmsg → ~/.agents/skills/agmsg
    try {
      mkdirSync(join(homedir(), '.agents', 'skills'), { recursive: true });
      cpSync(vendorRoot, TARGET_ROOT, { recursive: true, force: false });
      chmodShellScripts(join(TARGET_ROOT, 'scripts'));
      console.log(
        `[agmsg-installer] installed vendored agmsg tree to ${TARGET_ROOT}`,
      );
    } catch (err) {
      console.error('[agmsg-installer] install failed:', err);
      await dialog.showMessageBox({
        type: 'error',
        buttons: ['OK'],
        title: 'agmsg install failed',
        message: 'Could not install agmsg.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (response === 2) {
    // Never ask: create the marker file.
    try {
      mkdirSync(join(homedir(), '.ithyno-config'), { recursive: true });
      writeFileSync(NEVER_ASK_MARKER, '', 'utf8');
      console.log(
        `[agmsg-installer] user chose "Never ask"; created ${NEVER_ASK_MARKER}`,
      );
    } catch (err) {
      console.warn('[agmsg-installer] could not write never-ask marker:', err);
    }
  } else {
    // Skip: no-op this launch.
    console.log('[agmsg-installer] user chose "Skip"; will ask again next launch');
  }
}
