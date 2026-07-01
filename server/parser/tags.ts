import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import matter from "gray-matter";

export type ArtifactType = "idea" | "doc" | "change" | "spec" | "archive" | "outcome";

export type ArtifactEntry = {
  type: ArtifactType;
  /** Repo-relative path of the source file. */
  path: string;
  /** Human-friendly title (derived from the first H1 or the filename). */
  title: string;
  /**
   * Router-aware href the UI can navigate to. When the artifact has a
   * corresponding page in the dashboard, this points at it. Otherwise null.
   */
  hrefIn: string | null;
};

export type TagSummary = {
  tag: string; // full <ns>/<name>
  count: number;
  byType: Partial<Record<ArtifactType, number>>;
};

export type TagIndex = {
  byNamespace: Record<string, TagSummary[]>;
  namespaceOrder: string[]; // fixed display order
};

export type TagDetail = {
  tag: string;
  artifacts: ArtifactEntry[];
};

export const NAMESPACE_ORDER = ["feature", "screen", "area", "role", "stage", "other"] as const;

const ARCHIVE_NAME_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

/** Split a tag into namespace/name. Tags without a `/` go to "other". */
export function splitTag(tag: string): { ns: string; name: string } {
  const i = tag.indexOf("/");
  if (i < 0) return { ns: "other", name: tag };
  return { ns: tag.slice(0, i), name: tag.slice(i + 1) };
}

async function readTagsFromFrontmatter(filePath: string): Promise<string[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const fm = matter(raw);
    const tags = fm.data?.tags;
    if (!Array.isArray(tags)) return [];
    return tags.filter((t): t is string => typeof t === "string" && t.length > 0);
  } catch {
    return [];
  }
}

/** Best-effort first-H1 extraction. Falls back to the filename without .md. */
async function readTitle(filePath: string, fallback: string): Promise<string> {
  try {
    const raw = await readFile(filePath, "utf8");
    const fm = matter(raw);
    const m = fm.content.match(/^#\s+(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  return fallback;
}

async function walk(dir: string, fn: (abs: string) => Promise<void>): Promise<void> {
  if (!existsSync(dir)) return;
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const e of dirents) {
    if (e.name.startsWith(".")) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) await walk(abs, fn);
    else if (e.isFile() && e.name.endsWith(".md")) await fn(abs);
  }
}

/** Classify a file under docs/ or openspec/ into an artifact type. */
function classify(projectRoot: string, abs: string): {
  type: ArtifactType;
  hrefIn: string | null;
  changeId?: string;
} | null {
  const docsRoot = join(projectRoot, "docs");
  const specsRoot = join(projectRoot, "openspec", "specs");
  const changesRoot = join(projectRoot, "openspec", "changes");
  const archiveRoot = join(changesRoot, "archive");

  if (abs.startsWith(docsRoot + sep)) {
    const rel = abs.slice(docsRoot.length + 1);
    const isIdea = rel.startsWith("ideas" + sep);
    return {
      type: isIdea ? "idea" : "doc",
      hrefIn: `/docs/${rel.replace(/\.md$/, "")}`,
    };
  }

  if (abs.startsWith(archiveRoot + sep)) {
    const rest = abs.slice(archiveRoot.length + 1);
    const parts = rest.split(sep);
    const dirName = parts[0];
    const m = ARCHIVE_NAME_RE.exec(dirName);
    const changeId = m ? m[2] : dirName;
    const file = parts[parts.length - 1];
    if (file === "outcome.md") {
      return { type: "outcome", hrefIn: `/change/${encodeURIComponent(changeId)}`, changeId };
    }
    // Treat anything else (proposal/design/specs) as the archived change itself,
    // but only emit one entry per change. Use proposal.md as the canonical entry.
    if (file === "proposal.md") {
      return { type: "archive", hrefIn: `/change/${encodeURIComponent(changeId)}`, changeId };
    }
    return null;
  }

  if (abs.startsWith(changesRoot + sep)) {
    const rest = abs.slice(changesRoot.length + 1);
    const parts = rest.split(sep);
    const changeId = parts[0];
    const file = parts[parts.length - 1];
    // Canonical entry per change: proposal.md only.
    if (file === "proposal.md") {
      return { type: "change", hrefIn: `/change/${encodeURIComponent(changeId)}`, changeId };
    }
    return null;
  }

  if (abs.startsWith(specsRoot + sep)) {
    const rest = abs.slice(specsRoot.length + 1);
    const file = rest.split(sep).pop()!;
    if (file === "spec.md") {
      return { type: "spec", hrefIn: `/specs` };
    }
    return null;
  }

  return null;
}

async function deriveTitle(
  abs: string,
  cls: ReturnType<typeof classify>,
): Promise<string> {
  if (!cls) return abs;
  if (cls.type === "change" || cls.type === "archive" || cls.type === "outcome") {
    return cls.changeId ?? abs;
  }
  // For idea/doc/spec, prefer the first H1, fall back to the basename without .md.
  const base = abs.split(sep).pop()!.replace(/\.md$/, "");
  return readTitle(abs, base);
}

/** Walk all artifact sources and return the index of every tag with its artifacts. */
export async function collectTags(projectRoot: string): Promise<{
  index: TagIndex;
  byTag: Map<string, ArtifactEntry[]>; // full tag -> entries (used for the detail endpoint)
}> {
  const byTag = new Map<string, ArtifactEntry[]>();

  const visit = async (abs: string) => {
    const tags = await readTagsFromFrontmatter(abs);
    if (tags.length === 0) return;
    const cls = classify(projectRoot, abs);
    if (!cls) return;
    const title = await deriveTitle(abs, cls);
    const entry: ArtifactEntry = {
      type: cls.type,
      path: abs.slice(projectRoot.length + 1),
      title,
      hrefIn: cls.hrefIn,
    };
    for (const t of tags) {
      const list = byTag.get(t);
      if (list) list.push(entry);
      else byTag.set(t, [entry]);
    }
  };

  await walk(join(projectRoot, "docs"), visit);
  await walk(join(projectRoot, "openspec"), visit);

  // Build summaries grouped by namespace.
  const byNamespace: Record<string, TagSummary[]> = {};
  for (const [tag, entries] of byTag) {
    const { ns } = splitTag(tag);
    const byType: Partial<Record<ArtifactType, number>> = {};
    for (const e of entries) byType[e.type] = (byType[e.type] ?? 0) + 1;
    const summary: TagSummary = { tag, count: entries.length, byType };
    (byNamespace[ns] ??= []).push(summary);
  }
  // Stable sort tags inside each namespace by name.
  for (const ns of Object.keys(byNamespace)) {
    byNamespace[ns].sort((a, b) => a.tag.localeCompare(b.tag));
  }

  // Namespace display order: predefined first, then any custom namespaces alphabetically.
  const seen = new Set(Object.keys(byNamespace));
  const order: string[] = [];
  for (const ns of NAMESPACE_ORDER) if (seen.has(ns)) order.push(ns);
  for (const ns of [...seen].sort())
    if (!NAMESPACE_ORDER.includes(ns as any)) order.push(ns);

  return { index: { byNamespace, namespaceOrder: order }, byTag };
}

export async function getTagDetail(projectRoot: string, tag: string): Promise<TagDetail> {
  const { byTag } = await collectTags(projectRoot);
  return { tag, artifacts: byTag.get(tag) ?? [] };
}
