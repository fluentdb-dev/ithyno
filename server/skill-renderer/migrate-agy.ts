// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Legacy-directory migration for the antigravity (agy) renderer.
 *
 * agy's current convention reads `.agent/workflows/*.md` (singular).
 * Older ithyno builds incorrectly emitted `.agents/workflows/*.md` or
 * nested `.agent(s)/workflows/<namespace>/<command>.md` files. Agy discovers
 * only flat workflow files, so nested files are flattened to
 * `<namespace>-<command>.md` while plural-root files are moved to `.agent/`.
 *
 * This helper is invoked ONCE per install by installSkills when the
 * antigravity renderer is selected, BEFORE the render loop runs. It
 * moves every legacy file into `.agent/workflows/`,
 * skipping files whose target basename already exists (the renderer's
 * own subsequent write remains authoritative — never clobber it via
 * migration). Empty legacy and nested source directories are removed.
 *
 * Idempotent: a second invocation finds nothing and returns empty `moved`
 * and `skipped` arrays. Non-`.md` files are left untouched.
 */
import { access, mkdir, readFile, readdir, rename, rmdir, writeFile } from "node:fs/promises";
import { constants as fsConstants, type Dirent } from "node:fs";
import { join, posix } from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

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

/** Convert Claude command metadata and references to Agy's flat workflow
 * contract. In particular, `name: "ITHY-OPSX: Review"` must not survive:
 * Agy otherwise exposes that display name instead of the workflow basename. */
function claudeCommandToAgyWorkflow(raw: string): string {
  const translate = (value: string) => value
    .replace(/\/opsx:([a-z0-9-]+)/g, "/opsx-$1")
    .replace(/\/ithy-opsx:([a-z0-9-]+)/g, "/ithy-opsx-$1");

  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return translate(raw);

  let description = "Ithyno OpenSpec workflow";
  try {
    const parsed = yamlParse(match[1]) as Record<string, unknown> | null;
    if (typeof parsed?.description === "string" && parsed.description.trim()) {
      description = parsed.description.trim();
    }
  } catch {
    // Invalid Claude frontmatter must not leak its incompatible `name` into
    // Agy output. Keep a stable fallback description and preserve the body.
  }

  const frontmatter = yamlStringify({ description }, { lineWidth: 0 }).trimEnd();
  const body = translate(raw.slice(match[0].length));
  return `---\n${frontmatter}\n---\n\n${body}`;
}

/**
 * Migrate plural-root and nested workflow output into flat
 * `.agent/workflows/*.md` files.
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

  type Candidate = { from: string; to: string; relFrom: string; sourceDir: string };
  const candidates: Candidate[] = [];

  async function collectNested(root: string, relRoot: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const nestedDir = join(root, entry.name);
      let nestedEntries;
      try {
        nestedEntries = await readdir(nestedDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const nested of nestedEntries) {
        if (!nested.isFile() || !nested.name.endsWith(".md")) continue;
        candidates.push({
          from: join(nestedDir, nested.name),
          to: join(targetDir, `${entry.name}-${nested.name}`),
          relFrom: posix.join(relRoot, entry.name, nested.name),
          sourceDir: nestedDir,
        });
      }
    }
  }

  // Prefer files already under the singular root if both old layouts exist.
  await collectNested(targetDir, ".agent/workflows");

  let legacyEntries: Dirent[];
  try {
    legacyEntries = await readdir(legacyDir, { withFileTypes: true });
  } catch {
    legacyEntries = [];
  }
  for (const entry of legacyEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    candidates.push({
      from: join(legacyDir, entry.name),
      to: join(targetDir, entry.name),
      relFrom: posix.join(".agents", "workflows", entry.name),
      sourceDir: legacyDir,
    });
  }
  await collectNested(legacyDir, ".agents/workflows");

  if (candidates.length > 0 && !opts.dryRun) {
    await mkdir(targetDir, { recursive: true });
  }

  for (const { from, to, relFrom } of candidates) {
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
    const nestedDirs = [...new Set(candidates.map((candidate) => candidate.sourceDir))]
      .filter((dir) => dir !== legacyDir);
    for (const dir of nestedDirs) {
      if (await isEmptyDir(dir)) {
        try {
          await rmdir(dir);
        } catch {
          /* ignore — non-empty or permission; not fatal */
        }
      }
    }
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
 * Convert `.claude/commands/ithy-opsx/*.md` into flat
 * `.agent/workflows/ithy-opsx-<command>.md` files.
 *
 * Complements `migrateLegacyAntigravityDir` for a different legacy shape:
 * pre-per-CLI-renderer scaffolds hand-authored (or blind-copied) their
 * ithy-opsx commands under `.claude/commands/ithy-opsx/`. agy doesn't
 * read `.claude/`, so those `/ithy-opsx:*` slash-commands are invisible
 * until they're mirrored into Agy's flat workflow directory.
 *
 * COPY (not MOVE) semantics — the source `.claude/commands/ithy-opsx/`
 * files are preserved unmodified so Claude users of the same project
 * remain unaffected. Skip-on-conflict guards the target: never
 * overwrite an existing `.agent/workflows/ithy-opsx-<basename>`
 * (which may be renderer output from the same install run).
 * Idempotent, dryRun-aware.
 */
export async function copyClaudeIthyOpsxCommandsToAgent(
  projectRoot: string,
  opts: { dryRun?: boolean } = {},
): Promise<CopyResult> {
  const sourceDir = join(projectRoot, ".claude", "commands", "ithy-opsx");
  const targetDir = join(projectRoot, ".agent", "workflows");
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
    const to = join(targetDir, `ithy-opsx-${basename}`);
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
      const raw = await readFile(from, "utf-8");
      await writeFile(to, claudeCommandToAgyWorkflow(raw), "utf-8");
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
