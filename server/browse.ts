// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Read-only browse endpoints for the unify-open-project-3-branch feature.
 *
 * GET /api/browse/markdown-tree — returns a bounded JSON tree of markdown
 *   files under the project root. Works regardless of whether openspec/
 *   exists, which is the whole point.
 *
 * GET /api/browse/markdown?path=<rel> — returns the raw UTF-8 content of a
 *   single markdown file. Path is validated to stay within the project root.
 */

import { readdir as _readdir, stat, lstat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import type { Dirent } from "node:fs";

// readdir with { withFileTypes: true } returns Dirent[]
async function listDir(dir: string): Promise<Dirent[]> {
  return _readdir(dir, { withFileTypes: true }) as unknown as Promise<Dirent[]>;
}

export type MarkdownTreeNode = {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: MarkdownTreeNode[];
};

/** Directories that should never appear in the browse tree. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".worktrees",
  "dist",
  "build",
  "coverage",
]);

/** File extensions that are shown as leaves. */
function isMarkdownFile(name: string): boolean {
  return name.endsWith(".md") || name.endsWith(".markdown");
}

/**
 * Recursively scan `dir` for markdown files and directories, bounded to
 * `maxDepth` directory levels and `maxFiles` total markdown file leaves.
 */
async function scanDir(
  dir: string,
  relBase: string,
  depth: number,
  maxDepth: number,
  counter: { count: number },
  maxFiles: number,
): Promise<MarkdownTreeNode[]> {
  if (!existsSync(dir)) return [];
  if (depth > maxDepth) return [];

  let entries: Dirent[];
  try {
    entries = await listDir(dir);
  } catch {
    return [];
  }

  // Sort: directories first, then files, each alphabetically.
  entries.sort((a, b) => {
    const aDir = a.isDirectory();
    const bDir = b.isDirectory();
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nodes: MarkdownTreeNode[] = [];

  for (const entry of entries) {
    if (counter.count >= maxFiles) break;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue; // skip hidden dirs
      const childRel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const children = await scanDir(
        join(dir, entry.name),
        childRel,
        depth + 1,
        maxDepth,
        counter,
        maxFiles,
      );
      if (children.length > 0) {
        nodes.push({ path: childRel, name: entry.name, kind: "dir", children });
      }
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      const filePath = relBase ? `${relBase}/${entry.name}` : entry.name;
      nodes.push({ path: filePath, name: entry.name, kind: "file" });
      counter.count++;
    }
  }

  return nodes;
}

/** Root-level markdown files to check first (in order). */
const ROOT_FILES = ["README.md", "CLAUDE.md", "CONTRIBUTING.md", "CHANGELOG.md", "LICENSE.md"];

/**
 * Build the full markdown tree for a project root.
 * Strategy:
 *   1. Emit the well-known root-level files in declaration order (if present).
 *   2. Recursively scan all top-level directories (except SKIP_DIRS) for
 *      additional markdown files.
 *
 * Bounded to 5 directory levels deep and 500 total files.
 */
export async function buildMarkdownTree(projectRoot: string): Promise<MarkdownTreeNode[]> {
  const MAX_DEPTH = 5;
  const MAX_FILES = 500;
  const counter = { count: 0 };

  // Step 1: well-known root files.
  const rootNodes: MarkdownTreeNode[] = [];
  for (const name of ROOT_FILES) {
    if (counter.count >= MAX_FILES) break;
    const abs = join(projectRoot, name);
    if (existsSync(abs)) {
      rootNodes.push({ path: name, name, kind: "file" });
      counter.count++;
    }
  }

  // Step 2: scan all top-level entries.
  let topLevel: Dirent[];
  try {
    topLevel = await listDir(projectRoot);
  } catch {
    return rootNodes;
  }

  const rootFileSet = new Set(ROOT_FILES);

  // Directories first (scan subdirectories for .md files).
  for (const entry of topLevel.filter((e) => e.isDirectory())) {
    if (counter.count >= MAX_FILES) break;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;
    const children = await scanDir(
      join(projectRoot, entry.name),
      entry.name,
      1,
      MAX_DEPTH,
      counter,
      MAX_FILES,
    );
    if (children.length > 0) {
      rootNodes.push({ path: entry.name, name: entry.name, kind: "dir", children });
    }
  }

  // Then any non-ROOT_FILES markdown files at root level.
  for (const entry of topLevel.filter((e) => e.isFile() && isMarkdownFile(e.name))) {
    if (counter.count >= MAX_FILES) break;
    if (rootFileSet.has(entry.name)) continue; // already included
    rootNodes.push({ path: entry.name, name: entry.name, kind: "file" });
    counter.count++;
  }

  return rootNodes;
}

/**
 * Validate that a relative path stays within `projectRoot` (no `..`, not
 * absolute, and symlinks do not escape the root).
 */
export async function resolveSafePath(
  projectRoot: string,
  relPath: string,
): Promise<{ ok: true; abs: string } | { ok: false; reason: string }> {
  if (!relPath || relPath.trim() === "") {
    return { ok: false, reason: "path must not be empty" };
  }
  if (isAbsolute(relPath)) {
    return { ok: false, reason: "path must be relative, not absolute" };
  }
  // Reject any path containing ".." segments.
  const segments = relPath.split(/[/\\]/);
  if (segments.some((s) => s === "..")) {
    return { ok: false, reason: "path must not contain '..' segments" };
  }

  const joined = join(projectRoot, relPath);
  const realRoot = resolve(projectRoot);

  // Check if the joined path starts within the root.
  const rel = relative(realRoot, joined);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { ok: false, reason: "path resolves outside the project root" };
  }

  // Resolve symlinks via lstat — if the target is a symlink, check its real path.
  try {
    const lstats = await lstat(joined);
    if (lstats.isSymbolicLink()) {
      try {
        const realAbs = resolve(joined);
        await stat(realAbs); // verify it resolves
        const relReal = relative(realRoot, realAbs);
        if (relReal.startsWith("..") || isAbsolute(relReal)) {
          return { ok: false, reason: "symlink target resolves outside the project root" };
        }
      } catch {
        return { ok: false, reason: "path is a broken symlink" };
      }
    }
  } catch {
    // File may not exist yet — let the caller handle 404.
  }

  return { ok: true, abs: joined };
}
