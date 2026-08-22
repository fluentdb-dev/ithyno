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
import { access, lstat, mkdir, readFile, readdir, rename, rmdir, writeFile } from "node:fs/promises";
import { constants as fsConstants, type Dirent } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
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

const SAFE_COMMAND_BASENAME = /^[a-z0-9][a-z0-9._-]*\.md$/i;

/** Resolve a fixed project subpath without allowing any segment to escape. */
function resolveProjectPath(projectRoot: string, ...segments: string[]): string {
  if (!isAbsolute(projectRoot)) {
    throw new Error("projectRoot must be absolute");
  }
  const root = resolve(projectRoot);
  const candidate = resolve(root, ...segments);
  const rel = relative(root, candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("resolved path escapes projectRoot");
  }
  return candidate;
}

/** Resolve one allowlisted file directly below a known directory. */
function resolveWorkflowFile(workflowsDir: string, basename: string): string {
  if (!SAFE_COMMAND_BASENAME.test(basename)) {
    throw new Error(`unsafe workflow basename: ${basename}`);
  }
  const candidate = resolve(workflowsDir, basename);
  if (dirname(candidate) !== resolve(workflowsDir)) {
    throw new Error(`workflow path escapes target directory: ${basename}`);
  }
  return candidate;
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
 * Convert ithyno's bundled `.claude/commands/ithy-opsx/*.md` into flat
 * `.agent/workflows/ithy-opsx-<command>.md` files.
 *
 * This preserves the Claude-authoritative command bodies while keeping the
 * destination project output-only. A stale generated `.claude/` tree in the
 * consumer project must never become renderer input.
 *
 * COPY (not MOVE) semantics preserve the bundled source. Existing managed
 * `.agent/workflows/ithy-opsx-<basename>` output is refreshed from that
 * source; byte-identical output is left untouched. The universal renderer
 * runs afterward and remains authoritative for commands it has ported.
 */
export async function copyClaudeIthyOpsxCommandsToAgent(
  canonicalRoot: string,
  projectRoot: string,
  opts: { dryRun?: boolean } = {},
): Promise<CopyResult> {
  const sourceDir = join(canonicalRoot, ".claude", "commands", "ithy-opsx");
  const targetDir = resolveProjectPath(projectRoot, ".agent", "workflows");
  const result: CopyResult = { copied: [], skipped: [] };

  if (!(await pathExists(sourceDir))) return result;

  let entries: Dirent[];
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch {
    return result;
  }

  const mdFiles = entries
    .filter((entry) => entry.isFile() && SAFE_COMMAND_BASENAME.test(entry.name))
    .map((entry) => entry.name);

  if (mdFiles.length > 0 && !opts.dryRun) {
    await mkdir(targetDir, { recursive: true });
  }

  for (const basename of mdFiles) {
    const from = join(sourceDir, basename);
    const to = resolveWorkflowFile(targetDir, `ithy-opsx-${basename}`);
    // posix.join — see the identical comment in
    // migrateLegacyAntigravityDir above.
    const relFrom = posix.join(".claude", "commands", "ithy-opsx", basename);

    try {
      const raw = await readFile(from, "utf-8");
      const rendered = claudeCommandToAgyWorkflow(raw);
      let existing: string | null = null;
      try {
        const targetStat = await lstat(to);
        if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
          result.skipped.push({ path: relFrom, reason: "target is not a regular file" });
          continue;
        }
        existing = await readFile(to, "utf-8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      if (!opts.dryRun && existing !== rendered) {
        await writeFile(to, rendered, "utf-8");
      }
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
