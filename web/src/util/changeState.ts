// SPDX-License-Identifier: GPL-3.0-or-later
import type { AgentPublic, Change, JobSummary, TaskList } from "../types";

/**
 * True when there is at least one unchecked task in a non-verification
 * section. `verify only` cards (all remaining work is under a Verification
 * section) should not offer Start — the remaining work is human review.
 *
 * Null / empty tasks → return true: we cannot prove there is no work, so we
 * leave Start available.
 */
export function hasNonVerifyWork(tasks: TaskList | null): boolean {
  if (!tasks) return true;
  for (const sec of tasks.sections) {
    const isVerify = sec.title.toLowerCase().includes("verif");
    if (isVerify) continue;
    for (const t of sec.tasks) {
      if (!t.checked) return true;
    }
  }
  return false;
}

/** True when a worktree job is currently in-flight for the change. */
export function isRunningOrPending(job?: JobSummary): boolean {
  return !!job && job.status === "running";
}

/**
 * Filter the workspace's changes down to those that are ready to be started:
 *  - at least one agent is available
 *  - the change is not fully done
 *  - implementation work remains (non-verify tasks unchecked)
 *  - no worktree job is currently running for it
 *
 * Shared by the card-level Start gate and the parallel Start launcher so
 * they agree on what "startable" means.
 */
export function startableCandidates(
  changes: Change[],
  jobByChange: Map<string, JobSummary>,
  agents: AgentPublic[],
): Change[] {
  if (agents.length === 0) return [];
  return changes.filter((c) => {
    const isDone = c.progress.total > 0 && c.progress.done === c.progress.total;
    if (isDone) return false;
    if (!hasNonVerifyWork(c.tasks)) return false;
    if (isRunningOrPending(jobByChange.get(c.id))) return false;
    return true;
  });
}
