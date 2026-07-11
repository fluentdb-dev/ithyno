// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { listChangeArtifacts } from "./artifact-scan.js";

const execFile = promisify(execFileCb);
const skipOnWindows = process.platform === "win32" ? it.skip : it;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-artifact-scan-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function initGit(root: string): Promise<void> {
  await execFile("git", ["-C", root, "init", "-q"]);
  await execFile("git", ["-C", root, "config", "user.email", "t@t.local"]);
  await execFile("git", ["-C", root, "config", "user.name", "t"]);
}

describe("listChangeArtifacts", () => {
  skipOnWindows("returns [] for a repo with nothing changed", async () => {
    await initGit(dir);
    const paths = await listChangeArtifacts(dir, "add-foo");
    expect(paths).toEqual([]);
  });

  skipOnWindows("returns files under openspec/changes/<id>/ that are new", async () => {
    await initGit(dir);
    const changeDir = join(dir, "openspec", "changes", "add-foo");
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, "review.md"), "---\nverdict: pass\n---\n");
    writeFileSync(join(changeDir, "notes.txt"), "hello");
    const paths = await listChangeArtifacts(dir, "add-foo");
    expect(paths.sort()).toEqual([
      "openspec/changes/add-foo/notes.txt",
      "openspec/changes/add-foo/review.md",
    ]);
  });

  skipOnWindows("filters out files outside the change directory", async () => {
    await initGit(dir);
    const otherDir = join(dir, "openspec", "changes", "add-bar");
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, "review.md"), "content");
    // Also make a file outside openspec/changes/
    writeFileSync(join(dir, "unrelated.md"), "content");
    const paths = await listChangeArtifacts(dir, "add-foo");
    expect(paths).toEqual([]);
  });

  it("returns [] when the worktree isn't a git repo", async () => {
    // No git init. `git status` will fail.
    const paths = await listChangeArtifacts(dir, "add-foo");
    expect(paths).toEqual([]);
  });

  it("returns [] when the worktree path doesn't exist", async () => {
    const paths = await listChangeArtifacts("/nonexistent/path/that/should/not/exist", "add-foo");
    expect(paths).toEqual([]);
  });

  skipOnWindows("captures the new-side path of a rename into the change dir", async () => {
    // Regression: the old porcelain parser (`slice(3)` on newline-split
    // output) mangled `R  old -> new` lines, so review.md that arrived
    // via a rename was silently dropped from artifactPaths.
    await initGit(dir);
    const changeDir = join(dir, "openspec", "changes", "add-foo");
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, "review-draft.md"), "draft\n");
    await execFile("git", ["-C", dir, "add", "-A"]);
    await execFile("git", ["-C", dir, "commit", "-m", "seed", "-q"]);
    // Rename the draft into review.md — porcelain will emit
    // `R  <old> -> <new>` (or `-z`'s NUL-separated equivalent).
    await execFile("git", [
      "-C",
      dir,
      "mv",
      "openspec/changes/add-foo/review-draft.md",
      "openspec/changes/add-foo/review.md",
    ]);
    const paths = await listChangeArtifacts(dir, "add-foo");
    expect(paths).toContain("openspec/changes/add-foo/review.md");
    expect(paths).not.toContain("openspec/changes/add-foo/review-draft.md");
  });

  skipOnWindows("handles paths that would be quoted in porcelain v1", async () => {
    // Regression: porcelain v1 wraps paths containing spaces/non-ASCII
    // in double quotes with C-style escapes; the old `slice(3) +
    // startsWith` parser failed both cases. `-z` sidesteps quoting.
    await initGit(dir);
    const changeDir = join(dir, "openspec", "changes", "add-foo");
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, "note with spaces.md"), "hello");
    const paths = await listChangeArtifacts(dir, "add-foo");
    expect(paths).toContain("openspec/changes/add-foo/note with spaces.md");
  });
});
