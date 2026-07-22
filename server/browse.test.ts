// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for the browse module (unify-open-project-3-branch).
 *
 * Covers:
 *  - buildMarkdownTree returns the expected shape on a fixture directory.
 *  - resolveSafePath rejects ../ traversal.
 *  - resolveSafePath rejects absolute paths.
 *  - resolveSafePath rejects paths that resolve outside the root.
 *  - resolveSafePath accepts valid relative paths.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildMarkdownTree, resolveSafePath } from "./browse.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ithyno-browse-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// buildMarkdownTree
// ---------------------------------------------------------------------------

describe("buildMarkdownTree", () => {
  it("returns file nodes for root-level markdown files", async () => {
    await writeFile(join(dir, "README.md"), "# hello");
    await writeFile(join(dir, "CLAUDE.md"), "context");

    const tree = await buildMarkdownTree(dir);
    const names = tree.filter((n) => n.kind === "file").map((n) => n.name);
    expect(names).toContain("README.md");
    expect(names).toContain("CLAUDE.md");
  });

  it("returns dir nodes for subdirectories that contain markdown files", async () => {
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(join(dir, "docs", "guide.md"), "guide");

    const tree = await buildMarkdownTree(dir);
    const docsNode = tree.find((n) => n.name === "docs" && n.kind === "dir");
    expect(docsNode).toBeDefined();
    expect(docsNode?.children?.length).toBeGreaterThan(0);
    const child = docsNode?.children?.find((c) => c.name === "guide.md");
    expect(child).toBeDefined();
    expect(child?.kind).toBe("file");
  });

  it("skips node_modules", async () => {
    await mkdir(join(dir, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(dir, "node_modules", "pkg", "README.md"), "pkg readme");

    const tree = await buildMarkdownTree(dir);
    const nm = tree.find((n) => n.name === "node_modules");
    expect(nm).toBeUndefined();
  });

  it("skips .git directory", async () => {
    await mkdir(join(dir, ".git"), { recursive: true });
    await writeFile(join(dir, ".git", "COMMIT_EDITMSG.md"), "commit");

    const tree = await buildMarkdownTree(dir);
    const git = tree.find((n) => n.name === ".git");
    expect(git).toBeUndefined();
  });

  it("does not include non-markdown files as leaves", async () => {
    await writeFile(join(dir, "index.js"), "const x = 1;");
    await writeFile(join(dir, "README.md"), "# hi");

    const tree = await buildMarkdownTree(dir);
    const js = tree.find((n) => n.name === "index.js");
    expect(js).toBeUndefined();
  });

  it("returns empty array for empty directory", async () => {
    const tree = await buildMarkdownTree(dir);
    expect(tree).toEqual([]);
  });

  it("each file node has path, name, kind='file'", async () => {
    await writeFile(join(dir, "README.md"), "# hello");

    const tree = await buildMarkdownTree(dir);
    const node = tree.find((n) => n.name === "README.md");
    expect(node).toBeDefined();
    expect(node?.kind).toBe("file");
    expect(typeof node?.path).toBe("string");
    expect(node?.path).toBe("README.md");
  });
});

// ---------------------------------------------------------------------------
// resolveSafePath
// ---------------------------------------------------------------------------

describe("resolveSafePath", () => {
  it("accepts a simple relative file path", async () => {
    await writeFile(join(dir, "README.md"), "# hello");
    const result = await resolveSafePath(dir, "README.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.abs).toBe(join(dir, "README.md"));
    }
  });

  it("accepts a nested relative path", async () => {
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(join(dir, "docs", "guide.md"), "g");
    const result = await resolveSafePath(dir, "docs/guide.md");
    expect(result.ok).toBe(true);
  });

  it("rejects a path with .. segments", async () => {
    const result = await resolveSafePath(dir, "../password");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/\.\./);
    }
  });

  it("rejects URL-encoded traversal (decoded by caller; raw .. check)", async () => {
    // The server decodes %2f%2e%2e before passing to resolveSafePath via
    // the query string. Here we pass the already-decoded form.
    const result = await resolveSafePath(dir, "../etc/passwd");
    expect(result.ok).toBe(false);
  });

  it("rejects an absolute path", async () => {
    const result = await resolveSafePath(dir, "/etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/absolute/i);
    }
  });

  it("rejects an empty path", async () => {
    const result = await resolveSafePath(dir, "");
    expect(result.ok).toBe(false);
  });

  it("returns ok=true for a path that does not exist yet (caller handles 404)", async () => {
    // A nonexistent file still resolves within root — the endpoint returns 404.
    const result = await resolveSafePath(dir, "missing.md");
    expect(result.ok).toBe(true);
  });

  it("rejects a symlink inside root that points to a file outside root", async () => {
    // Create an external file outside the project root.
    const externalDir = await mkdtemp(join(tmpdir(), "ithyno-browse-ext-"));
    try {
      const externalFile = join(externalDir, "secret.txt");
      await writeFile(externalFile, "top secret contents");

      // Plant a symlink inside the project root that points to the external file.
      await symlink(externalFile, join(dir, "escape.md"));

      const result = await resolveSafePath(dir, "escape.md");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/symlink|outside/i);
      }
    } finally {
      await rm(externalDir, { recursive: true, force: true });
    }
  });
});
