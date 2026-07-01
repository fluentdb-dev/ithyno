import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
import { sha1 } from "../util/hash.js";
import type { DocsEntry, DocsFile, DocsTree } from "../model.js";

/**
 * Recursively scan the `docs/` tree. Each .md file gets its frontmatter parsed
 * eagerly (small payload) so the sidebar can show status indicators without
 * fetching every body. Bodies are fetched on demand via `readDocsFile`.
 */
export async function scanDocs(projectRoot: string): Promise<DocsTree> {
  const root = join(projectRoot, "docs");
  if (!existsSync(root)) {
    return { root, exists: false, entries: [] };
  }
  const entries = await walk(root, root);
  return { root, exists: true, entries };
}

async function walk(dir: string, docsRoot: string): Promise<DocsEntry[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const out: DocsEntry[] = [];

  for (const ent of dirents) {
    if (ent.name.startsWith(".")) continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      const children = await walk(abs, docsRoot);
      out.push({
        kind: "dir",
        name: ent.name,
        path: toRel(abs, docsRoot),
        children,
      });
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      let frontmatter: Record<string, unknown> | null = null;
      try {
        const raw = await readFile(abs, "utf8");
        const fm = matter(raw);
        frontmatter = (fm.data && Object.keys(fm.data).length > 0)
          ? (fm.data as Record<string, unknown>)
          : null;
      } catch {
        frontmatter = null;
      }
      out.push({
        kind: "file",
        name: ent.name,
        path: toRel(abs, docsRoot),
        frontmatter,
      });
    }
  }

  // Sort: dirs first, then files. Inside docs/ideas/, files sort by descending
  // date prefix so the newest idea sits at the top.
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    if (a.kind === "file" && b.kind === "file" && isIdeaFile(a.path)) {
      // Reverse alphabetical (which == reverse chronological for YYYY-MM-DD prefix).
      return b.name.localeCompare(a.name);
    }
    return a.name.localeCompare(b.name);
  });

  return out;
}

function toRel(abs: string, docsRoot: string): string {
  return relative(docsRoot, abs).split(sep).join("/");
}

function isIdeaFile(relPath: string): boolean {
  return relPath.startsWith("ideas/");
}

/**
 * Read one docs file by its path (relative to `docs/`), returning parsed
 * frontmatter, body without the YAML block, and a sha1 of the raw bytes for
 * change detection.
 */
export async function readDocsFile(
  projectRoot: string,
  relPath: string,
): Promise<DocsFile | null> {
  const root = join(projectRoot, "docs");
  const abs = join(root, relPath);
  // Reject traversal outside docs/.
  if (!abs.startsWith(root + sep) && abs !== root) return null;
  if (!abs.endsWith(".md")) return null;
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch {
    return null;
  }
  const fm = matter(raw);
  return {
    path: relPath,
    frontmatter:
      fm.data && Object.keys(fm.data).length > 0
        ? (fm.data as Record<string, unknown>)
        : null,
    body: fm.content,
    hash: sha1(raw),
  };
}

/** Return the path under docs/ (relative form) for a given absolute path, or null. */
export function docsRelPath(projectRoot: string, absPath: string): string | null {
  const root = join(projectRoot, "docs");
  if (!absPath.startsWith(root + sep)) return null;
  if (!absPath.endsWith(".md")) return null;
  return relative(root, absPath).split(sep).join("/");
}
