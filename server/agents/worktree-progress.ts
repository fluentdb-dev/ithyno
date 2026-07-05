// SPDX-License-Identifier: GPL-3.0-or-later
import chokidar, { type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseTasks } from "../parser/tasks.js";
import type { Progress } from "../model.js";

/**
 * Per-job watcher on the worktree's tasks.md file. Emits `{ done, total }`
 * only when the counts actually change — noisy fs events are debounced and
 * duplicate parses are dropped so we do not flood the WebSocket.
 *
 * Landed by add-worktree-tasks-watcher. Rationale: agents running under
 * Claude Code's `-p` (print) mode do not stream progress to the PTY; the
 * user needs some signal that the job is moving. Task ticks are that
 * signal.
 */

const DEBOUNCE_MS = 200;

export type WorktreeProgressHandle = { dispose(): void };

export type WorktreeProgressOpts = {
  projectRoot: string;
  changeId: string;
  /** Explicit worktree path override. Defaults to
   *  `projectRoot/.worktrees/<changeId>/` (the pre-pool dedicated layout).
   *  Pool-leased worktrees are named `.worktrees/<prefix>-N/` and need to
   *  pass their actual path here. Landed by add-worktree-pool. */
  worktreePath?: string;
  onProgress: (progress: Progress) => void;
  onError?: (err: unknown) => void;
  /** Fires (at most once) when the watched `tasks.md` file is unlinked —
   *  the signal we use to detect an external `git worktree remove`. Callers
   *  should treat this as "the worktree is gone; clean up your job entry."
   *  Landed by add-worktree-external-discard-detection. */
  onUnlink?: () => void;
};

export function startWorktreeProgressWatcher(opts: WorktreeProgressOpts): WorktreeProgressHandle {
  const { projectRoot, changeId, onProgress, onError, onUnlink } = opts;
  const worktreePath = opts.worktreePath ?? join(projectRoot, ".worktrees", changeId);
  const tasksPath = join(
    worktreePath,
    "openspec",
    "changes",
    changeId,
    "tasks.md",
  );

  let last: Progress | null = null;
  let debounce: NodeJS.Timeout | null = null;
  let disposed = false;

  const emitIfChanged = async () => {
    if (disposed) return;
    try {
      const raw = await readFile(tasksPath, "utf8");
      const list = parseTasks(tasksPath, raw);
      const progress = countProgress(list);
      if (last && last.done === progress.done && last.total === progress.total) return;
      last = progress;
      onProgress(progress);
    } catch (err) {
      // Transient errors are expected (agent may briefly delete/rewrite
      // the file). Log at debug volume; the next fs event triggers a
      // fresh read.
      onError?.(err);
    }
  };

  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void emitIfChanged();
    }, DEBOUNCE_MS);
  };

  const watcher: FSWatcher = chokidar.watch(tasksPath, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  watcher.on("add", schedule);
  watcher.on("change", schedule);
  watcher.on("error", (err: unknown) => onError?.(err));
  let unlinkFired = false;
  watcher.on("unlink", () => {
    if (disposed || unlinkFired) return;
    unlinkFired = true;
    try {
      onUnlink?.();
    } catch (err) {
      onError?.(err);
    }
  });

  return {
    dispose() {
      disposed = true;
      if (debounce) {
        clearTimeout(debounce);
        debounce = null;
      }
      void watcher.close().catch(() => {});
    },
  };
}

function countProgress(list: ReturnType<typeof parseTasks>): Progress {
  let done = 0;
  let total = 0;
  for (const sec of list.sections) {
    for (const t of sec.tasks) {
      total++;
      if (t.checked) done++;
    }
  }
  return { done, total };
}
