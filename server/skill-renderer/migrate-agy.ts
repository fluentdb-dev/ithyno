// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Legacy-directory migration for the antigravity (agy) renderer.
 *
 * agy's current convention reads `.agents/workflows/*.md` (with the
 * trailing `s`). openspec's own antigravity adapter is still on the
 * legacy `.agent/workflows/opsx-<id>.md` path. Any project scaffolded
 * by `openspec init --tools antigravity` gets its opsx-* commands
 * written to the wrong dir and agy never discovers them.
 *
 * This helper is invoked ONCE per install by installSkills when the
 * antigravity renderer is selected, BEFORE the render loop runs. It
 * moves every `.agent/workflows/*.md` file into `.agents/workflows/`,
 * skipping files whose target basename already exists (the renderer's
 * own subsequent write remains authoritative — never clobber it via
 * migration). After moving, empty `.agent/workflows/` and empty
 * `.agent/` are removed.
 *
 * Idempotent: a second invocation finds nothing and returns empty
 * `moved` and `skipped` arrays. Non-`.md` files under `.agent/` are
 * left untouched (defensive — respect user files).
 */
import { access, mkdir, readdir, rename, rmdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";

export interface MigrationResult {
  moved: string[];
  skipped: Array<{ path: string; reason: string }>;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isEmptyDir(p: string): Promise<boolean> {
  try {
    const entries = await readdir(p);
    return entries.length === 0;
  } catch {
    return false;
  }
}

/**
 * Migrate legacy `.agent/workflows/*.md` into `.agents/workflows/`.
 *
 * Returned `moved[]` and `skipped[]` paths are project-root-relative
 * so logs/tests can compare them without leaking absolute host paths.
 *
 * `dryRun: true` reports the planned moves without touching disk —
 * the returned `moved[]` reflects what WOULD have moved.
 */
export async function migrateLegacyAntigravityDir(
  projectRoot: string,
  opts: { dryRun?: boolean } = {},
): Promise<MigrationResult> {
  const legacyDir = join(projectRoot, ".agent", "workflows");
  const targetDir = join(projectRoot, ".agents", "workflows");
  const result: MigrationResult = { moved: [], skipped: [] };

  if (!(await pathExists(legacyDir))) return result;

  let entries: string[];
  try {
    entries = await readdir(legacyDir);
  } catch {
    return result;
  }

  const mdFiles = entries.filter((e) => e.endsWith(".md"));

  // Only mkdir the target when we actually have work to do.
  if (mdFiles.length > 0 && !opts.dryRun) {
    await mkdir(targetDir, { recursive: true });
  }

  for (const basename of mdFiles) {
    const from = join(legacyDir, basename);
    const to = join(targetDir, basename);
    const relFrom = join(".agent", "workflows", basename);

    // Skip on any pre-existing target — the renderer's later write is
    // the source of truth. Never overwrite.
    if (await pathExists(to)) {
      result.skipped.push({ path: relFrom, reason: "target exists" });
      continue;
    }

    if (opts.dryRun) {
      result.moved.push(relFrom);
      continue;
    }

    try {
      await rename(from, to);
      result.moved.push(relFrom);
    } catch (err) {
      // Treat per-file failures as skips rather than blowing up the
      // whole migration — a stuck file must not block healthy ones.
      result.skipped.push({
        path: relFrom,
        reason: `rename failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Cleanup empty parents. dryRun leaves everything alone.
  if (!opts.dryRun) {
    if (await isEmptyDir(legacyDir)) {
      try {
        await rmdir(legacyDir);
      } catch {
        /* ignore — non-empty or permission; not fatal */
      }
    }
    const legacyParent = join(projectRoot, ".agent");
    if (await isEmptyDir(legacyParent)) {
      try {
        await rmdir(legacyParent);
      } catch {
        /* ignore */
      }
    }
  }

  return result;
}
