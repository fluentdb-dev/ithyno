import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { join } from "node:path";
import { getGitStatus } from "./status.js";
import type { GitStatus } from "../model.js";

const execFile = promisify(execFileCb);

/**
 * Idempotently initialize the given directory as a git repository.
 * No initial commit is created — that decision (branch name, gitignore
 * state, first content) belongs to the user.
 */
export async function gitInit(projectRoot: string): Promise<GitStatus> {
  const existing = await getGitStatus(projectRoot);
  if (existing.isRepo) return existing;
  if (existing.reason === "git-missing") return existing;
  await execFile("git", ["init", projectRoot], { cwd: projectRoot });
  const after = await getGitStatus(projectRoot);
  if (!after.isRepo && !existsSync(join(projectRoot, ".git"))) {
    throw new Error("git init reported success but .git was not created");
  }
  return after;
}
