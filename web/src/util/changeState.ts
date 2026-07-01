import type { JobSummary, TaskList } from "../types";

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
