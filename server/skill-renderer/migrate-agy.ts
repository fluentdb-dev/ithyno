// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Legacy-directory migration for the antigravity (agy) renderer.
 *
 * agy's current convention reads `.agent/workflows/*.md` (singular).
 * Older ithyno builds incorrectly emitted `.agents/workflows/*.md`.
 *
 * This helper is invoked ONCE per install by installSkills when the
 * antigravity renderer is selected, BEFORE the render loop runs. It
 * moves every legacy `.agents/workflows/*.md` file into
 * `.agent/workflows/`,
 * skipping files whose target basename already exists (the renderer's
 * own subsequent write remains authoritative — never clobber it via
 * migration). After moving, empty `.agents/workflows/` and empty
 * `.agents/` are removed.
 *
 * Idempotent: a second invocation finds nothing and returns empty
 * `moved` and `skipped` arrays. Non-`.md` files under `.agents/` are
 * left untouched (defensive — respect user files).
 */
import { access, copyFile, mkdir, readdir, rename, rmdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, posix } from "node:path";

export interface MigrationResult {
  moved: string[];
  skipped: Array<{ path: string; reason: string }>;
}

export interface CopyResult {
  copied: string[];
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
 * Migrate legacy `.agents/workflows/*.md` into `.agent/workflows/`.
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
  const legacyDir = join(projectRoot, ".agents", "workflows");
  const targetDir = join(projectRoot, ".agent", "workflows");
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
    // posix.join, not join — this path is returned for logs/tests to
    // compare (per the doc comment above), so it must be forward-slash
    // regardless of host OS. The real filesystem calls above use `join`
    // (OS-native separators), which is correct for them.
    const relFrom = posix.join(".agents", "workflows", basename);

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
    const legacyParent = join(projectRoot, ".agents");
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

/**
 * COPY `.claude/commands/ithy-opsx/*.md` into `.agent/workflows/ithy-opsx/`.
 *
 * Complements `migrateLegacyAntigravityDir` for a different legacy shape:
 * pre-per-CLI-renderer scaffolds hand-authored (or blind-copied) their
 * ithy-opsx commands under `.claude/commands/ithy-opsx/`. agy doesn't
 * read `.claude/`, so those `/ithy-opsx:*` slash-commands are invisible
 * until they're mirrored into the `.agent/workflows/ithy-opsx/`
 * subdirectory (nested colon-form path that agy exposes as
 * `/ithy-opsx:<cmd>`).
 *
 * COPY (not MOVE) semantics — the source `.claude/commands/ithy-opsx/`
 * files are preserved unmodified so Claude users of the same project
 * remain unaffected. Skip-on-conflict guards the target: never
 * overwrite an existing `.agent/workflows/ithy-opsx/<basename>`
 * (which may be renderer output from the same install run).
 * Idempotent, dryRun-aware.
 */
export async function copyClaudeIthyOpsxCommandsToAgent(
  projectRoot: string,
  opts: { dryRun?: boolean } = {},
): Promise<CopyResult> {
  const sourceDir = join(projectRoot, ".claude", "commands", "ithy-opsx");
  const targetDir = join(projectRoot, ".agent", "workflows", "ithy-opsx");
  const result: CopyResult = { copied: [], skipped: [] };

  if (!(await pathExists(sourceDir))) return result;

  let entries: string[];
  try {
    entries = await readdir(sourceDir);
  } catch {
    return result;
  }

  const mdFiles = entries.filter((e) => e.endsWith(".md"));

  if (mdFiles.length > 0 && !opts.dryRun) {
    await mkdir(targetDir, { recursive: true });
  }

  for (const basename of mdFiles) {
    const from = join(sourceDir, basename);
    const to = join(targetDir, basename);
    // posix.join — see the identical comment in
    // migrateLegacyAntigravityDir above.
    const relFrom = posix.join(".claude", "commands", "ithy-opsx", basename);

    if (await pathExists(to)) {
      result.skipped.push({ path: relFrom, reason: "target exists" });
      continue;
    }

    if (opts.dryRun) {
      result.copied.push(relFrom);
      continue;
    }

    try {
      await copyFile(from, to);
      result.copied.push(relFrom);
    } catch (err) {
      result.skipped.push({
        path: relFrom,
        reason: `copy failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // COPY does NOT touch the source dir — .claude/ stays intact for
  // Claude users. Do not rmdir source parents.
  return result;
}
