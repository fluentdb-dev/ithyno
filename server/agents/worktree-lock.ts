// SPDX-License-Identifier: GPL-3.0-or-later
// Worktree concurrency semaphore — reads and cleans up
// `.worktrees/.lock`. Landed by collapse-jobregistry-and-add-semaphore.
//
// The lock is written and released by the dispatcher skill (a Bash
// preamble in `.claude/commands/ithy-opsx/dispatch.md`). The server's
// only responsibilities are:
//
//   - **read**  the lock at workspace scan time so the UI can gate the
//     Kanban Start button when `parallelExecution: false`;
//   - **cleanup** stale locks at startup — if the referenced worktree
//     was removed while the process was down, the lock is deleted.

import { existsSync, unlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { WorktreeLock } from "../model.js";

const LOCK_PATH_SEGMENTS = [".worktrees", ".lock"] as const;

/** Read the `.worktrees/.lock` file at the given project root. Returns
 *  null when the file does not exist. Malformed YAML / missing `change`
 *  field is also treated as null (the caller should not gate on a lock
 *  it can't parse). */
export async function readLock(projectRoot: string): Promise<WorktreeLock | null> {
  const path = join(projectRoot, ...LOCK_PATH_SEGMENTS);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const change = typeof o.change === "string" ? o.change : null;
    if (!change) return null;
    const acquiredAt = typeof o.acquiredAt === "string" ? o.acquiredAt : "";
    const pid =
      typeof o.pid === "number" ? o.pid : o.pid === null ? null : null;
    return { change, acquiredAt, pid };
  } catch {
    return null;
  }
}

/** Startup cleanup: if `.worktrees/.lock` names a change whose
 *  `.worktrees/<change>/` was removed while the process was down,
 *  delete the lock. Returns the *post-cleanup* lock (null when we
 *  deleted it, unchanged otherwise). */
export async function cleanupStaleLock(
  projectRoot: string,
): Promise<WorktreeLock | null> {
  const lock = await readLock(projectRoot);
  if (!lock) return null;
  const worktreePath = join(projectRoot, ".worktrees", lock.change);
  if (existsSync(worktreePath)) return lock;
  // Referenced worktree is gone → the lock is stale from a previous
  // crash. Delete synchronously so subsequent scans see the null state.
  try {
    unlinkSync(join(projectRoot, ...LOCK_PATH_SEGMENTS));
  } catch {
    // best-effort; if the delete raced with someone else, the next
    // scan will see whatever state landed.
  }
  return null;
}
