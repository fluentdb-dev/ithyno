// SPDX-License-Identifier: GPL-3.0-or-later
import { promisify } from "node:util";
import { execFile } from "node:child_process";

/**
 * Discover files created or modified inside a change directory during a
 * worker job. Runs `git status --porcelain` in the job's worktree and
 * filters entries to those under `openspec/changes/<changeId>/`.
 *
 * The runner calls this once per job at terminal-state transition
 * (`finish()`) and stores the result on the Job so downstream consumers
 * (dispatch endpoint, Agents tab) can read from the single source of
 * truth. Adopted orphan jobs are not scanned — see
 * `openspec/changes/archive/2026-07-08-extend-agent-job-model/proposal.md`.
 */

const execFileP = promisify(execFile);

/**
 * Enumerate artifact files newly created (untracked) or modified inside
 * the change's directory since the branch was checked out.
 *
 * Returns an empty array on any git failure (missing binary, non-repo,
 * detached HEAD without index, etc.). Never throws.
 */
export async function listChangeArtifacts(
  worktreePath: string,
  changeId: string,
): Promise<string[]> {
  try {
    // `--untracked-files=all` expands untracked directories to their
    // individual files. Without it, `git status --porcelain` collapses
    // an entirely-new directory into a single "?? dir/" entry, which
    // hides the review.md / needs-human.md we're trying to discover.
    const { stdout } = await execFileP("git", [
      "-C",
      worktreePath,
      "status",
      "--porcelain",
      "--untracked-files=all",
    ]);
    const lines = stdout.split("\n").filter((l) => l.length > 0);
    const prefix = `openspec/changes/${changeId}/`;
    const out: string[] = [];
    for (const l of lines) {
      // Format: "XY <path>" where XY is the two-char status field.
      const path = l.slice(3);
      if (path.startsWith(prefix)) out.push(path);
    }
    return out;
  } catch {
    return [];
  }
}
