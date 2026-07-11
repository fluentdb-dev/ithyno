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
    // `-z` gives us NUL-separated output with no quoting — the default
    // porcelain format wraps paths containing spaces / non-ASCII in
    // double quotes with C-style escapes, which the naive slice(3)
    // parser cannot decode. `-z` also splits renames into two entries
    // (new path first, then a second NUL-terminated old path) so we
    // can capture the new-side destination.
    //
    // `--untracked-files=all` expands untracked directories to their
    // individual files; without it a fresh `openspec/changes/<id>/`
    // dir collapses to `?? <dir>/` and hides review.md.
    const { stdout } = await execFileP("git", [
      "-C",
      worktreePath,
      "status",
      "--porcelain",
      "-z",
      "--untracked-files=all",
    ]);
    const prefix = `openspec/changes/${changeId}/`;
    const out: string[] = [];
    // Each entry is `XY <path>\0` (2-char status + space + path). Rename
    // entries append a second `\0<old-path>\0` — we consume both and
    // keep only the new (destination) path.
    const entries = stdout.split("\0");
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.length < 3) continue;
      const status = entry.slice(0, 2);
      const path = entry.slice(3);
      const isRename = status.startsWith("R") || status.startsWith("C");
      if (isRename) {
        // Skip the old-path entry that follows a rename/copy record.
        i += 1;
      }
      if (path.startsWith(prefix)) out.push(path);
    }
    return out;
  } catch {
    return [];
  }
}
