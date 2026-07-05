// SPDX-License-Identifier: GPL-3.0-or-later
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { relative, sep } from "node:path";

const execFile = promisify(execFileCb);

/**
 * Parse `git worktree list --porcelain` and keep only entries that look
 * like agent worktrees managed by this dashboard:
 *   - worktree path is a direct child of `<projectRoot>/.worktrees/`
 *   - branch is `refs/heads/agent/<change-id>`
 *
 * Defensive parsing: unrecognized field lines are ignored; a malformed
 * block is skipped and the parser continues with the next.
 *
 * See add-orphan-worktree-adoption.
 */
export type OrphanWorktree = {
  changeId: string;
  worktreePath: string;
  branch: string;
};

export async function listOrphanWorktrees(projectRoot: string): Promise<OrphanWorktree[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFile("git", ["worktree", "list", "--porcelain"], {
      cwd: projectRoot,
    }));
  } catch (err) {
    console.warn(
      `[adopt-orphans] git worktree list failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
  return parsePorcelain(stdout, projectRoot);
}

export function parsePorcelain(stdout: string, projectRoot: string): OrphanWorktree[] {
  const orphans: OrphanWorktree[] = [];
  // Records are separated by blank lines. Each record has `worktree <path>`,
  // optionally `HEAD <sha>`, and optionally `branch refs/heads/<name>` (or
  // `detached`, `locked`, `prunable`, etc).
  const blocks = stdout.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    let worktreePath: string | null = null;
    let branch: string | null = null;
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length).trim();
      } else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).trim();
      }
      // Other fields (HEAD, detached, locked, prunable, bare) are ignored.
    }
    if (!worktreePath || !branch) continue;

    // Path filter: must live directly under `<projectRoot>/.worktrees/`.
    const rel = relative(projectRoot, worktreePath);
    const parts = rel.split(sep);
    if (rel.startsWith("..") || parts.length !== 2 || parts[0] !== ".worktrees") continue;

    // Branch filter: `refs/heads/agent/<change-id>`.
    if (!branch.startsWith("refs/heads/agent/")) continue;
    const changeId = branch.slice("refs/heads/agent/".length);
    if (!changeId) continue;

    // The path's directory name must also match the change id.
    if (parts[1] !== changeId) continue;

    orphans.push({
      changeId,
      worktreePath,
      branch: `agent/${changeId}`,
    });
  }
  return orphans;
}
