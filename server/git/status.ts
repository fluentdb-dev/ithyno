// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { join } from "node:path";
import type { GitStatus } from "../model.js";

const execFile = promisify(execFileCb);

/**
 * Detect whether the given directory is inside a git working tree, and if so,
 * report the repository root and current branch. Callers get a single stable
 * shape they can render without further branching.
 *
 * `.git` presence is a fast synchronous fast-path for the common case.
 * `git rev-parse` covers the edge cases (`.git` file-not-dir for linked
 * worktrees, ancestor discovery) and is the authoritative answer.
 */
export async function getGitStatus(projectRoot: string): Promise<GitStatus> {
  const fastPathHit = existsSync(join(projectRoot, ".git"));
  try {
    const { stdout: root } = await execFile(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: projectRoot },
    );
    const trimmedRoot = root.trim();
    const [branch, hasCommits] = await Promise.all([
      currentBranch(trimmedRoot),
      headExists(trimmedRoot),
    ]);
    return { isRepo: true, root: trimmedRoot, headBranch: branch, hasCommits };
  } catch (err) {
    if (isMissingBinary(err)) return { isRepo: false, reason: "git-missing" };
    // Not a git repo — fast-path saw nothing either, or rev-parse rejected.
    void fastPathHit;
    return { isRepo: false };
  }
}

async function headExists(root: string): Promise<boolean> {
  try {
    await execFile("git", ["rev-parse", "--verify", "HEAD"], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

async function currentBranch(root: string): Promise<string | null> {
  try {
    const { stdout } = await execFile(
      "git",
      ["symbolic-ref", "--short", "HEAD"],
      { cwd: root },
    );
    return stdout.trim() || null;
  } catch {
    // Detached HEAD or no commits yet — either way, no symbolic branch.
    return null;
  }
}

function isMissingBinary(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
}
