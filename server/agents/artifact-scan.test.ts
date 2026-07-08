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
});
