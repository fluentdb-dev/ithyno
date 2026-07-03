import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";

const execFile = promisify(execFileCb);

export type ChangeGitState = {
  untracked: string[];
  modified: string[];
};

/**
 * Enumerate uncommitted files under `openspec/changes/<changeId>/` relative to
 * the main tree's HEAD. Used by the Start (Worktree) pre-check: `git worktree
 * add HEAD` builds the worktree from the last commit, so untracked files stay
 * behind. The pre-check surfaces that so the user can commit before spawning.
 *
 * `??` (untracked) → untracked; `M`, ` M`, `A`, ` A`, `AM`, `MM`, etc. → modified.
 * Renames are two-line and treated as modified. Deletes are treated as modified
 * (the delta needs to be committed either way).
 *
 * If the change directory doesn't exist at all, both arrays are empty — the
 * caller is doing a defensive check, not validating that the change is real.
 */
export async function getChangeGitState(
  projectRoot: string,
  changeId: string,
): Promise<ChangeGitState> {
  const relPath = `openspec/changes/${changeId}/`;
  let stdout: string;
  try {
    ({ stdout } = await execFile(
      "git",
      ["status", "--porcelain", "--", relPath],
      { cwd: projectRoot },
    ));
  } catch {
    // Not a repo, git missing, or other execFile failure. The guard is
    // defensive; propagate as "clean" rather than blowing up the Start flow.
    return { untracked: [], modified: [] };
  }
  const untracked: string[] = [];
  const modified: string[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    if (raw.length === 0) continue;
    // Porcelain v1 lines: XY<space>path
    const xy = raw.slice(0, 2);
    const path = raw.slice(3);
    if (xy === "??") untracked.push(path);
    else modified.push(path);
  }
  return { untracked, modified };
}

/**
 * `git add openspec/changes/<id>/` + `git commit -m "propose: <id>"`.
 *
 * Returns the new HEAD hash. Throws with `NOTHING_TO_COMMIT` when the working
 * tree under the change dir is clean — the caller turns that into a 409.
 */
export async function commitChangeProposal(
  projectRoot: string,
  changeId: string,
): Promise<{ commitHash: string }> {
  const relPath = `openspec/changes/${changeId}/`;
  const pre = await getChangeGitState(projectRoot, changeId);
  if (pre.untracked.length === 0 && pre.modified.length === 0) {
    throw new Error("NOTHING_TO_COMMIT");
  }
  await execFile("git", ["add", "--", relPath], { cwd: projectRoot });
  await execFile("git", ["commit", "-m", `propose: ${changeId}`], {
    cwd: projectRoot,
  });
  const { stdout } = await execFile("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
  });
  return { commitHash: stdout.trim() };
}
