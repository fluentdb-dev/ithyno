import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type { AgentRegistry } from "./registry.js";
import { loadPty } from "../sync/pty.js";
import { startWorktreeProgressWatcher, type WorktreeProgressHandle } from "./worktree-progress.js";
import { listOrphanWorktrees } from "./adopt-orphans.js";
import type { Progress } from "../model.js";
import { statSync, readFileSync } from "node:fs";
import { parseTasks } from "../parser/tasks.js";

const execFile = promisify(execFileCb);

/**
 * Spawns agents in isolated git worktrees and tracks them in an in-memory
 * registry. One job per change is enforced via a lock map. Output is kept
 * in a ring buffer and broadcast over the dashboard's WebSocket.
 */

export type JobStatus = "running" | "completed" | "cancelled" | "crashed" | "orphaned";

export type JobSummary = {
  id: string;
  changeId: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  /** Last-observed worktree tasks.md progress. Included in the summary so
   *  clients that fetch /api/agents/jobs see the current number without
   *  needing to wait for the WS `worktree-progress-updated` event. */
  worktreeProgress?: Progress;
};

export type Job = JobSummary & {
  /** Ring buffer of output lines (most recent at the end). */
  output: OutputLine[];
  /** Lazy-cached diff payload; populated by the diff endpoint on first read,
   *  invalidated when the job transitions back to running (the user re-ran). */
  cachedDiff?: unknown;
  /** Per-job watcher on the worktree's tasks.md — see add-worktree-tasks-watcher. */
  worktreeTasksWatcher?: WorktreeProgressHandle;
  /** Last emitted worktree progress; also used for a final broadcast in finish(). */
  lastWorktreeProgress?: Progress;
};

export type OutputLine = { stream: "stdout" | "stderr" | "stdin"; chunk: string; ts: number };

const RING_LIMIT = 10_000;

type RunnerEvent =
  | { type: "agent-job-started"; job: JobSummary }
  | { type: "agent-job-output"; jobId: string; chunk: string; stream: "stdout" | "stderr" | "stdin" }
  | { type: "agent-job-finished"; jobId: string; status: JobStatus; exitCode: number | null }
  | { type: "worktree-progress-updated"; jobId: string; changeId: string; progress: Progress };

/**
 * A minimal shape of node-pty's IPty that we depend on. Kept structural so
 * we don't couple to the native module's type surface (which varies across
 * @homebridge/node-pty-prebuilt-multiarch versions).
 */
type IPty = {
  write(data: string): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void;
};

export class AgentRunner {
  private jobs = new Map<string, Job>();
  private processes = new Map<string, IPty>();
  private locks = new Map<string, string>(); // changeId -> jobId
  private seq = 0;

  constructor(
    private readonly projectRoot: string,
    private readonly registry: AgentRegistry,
    private readonly emit: (event: RunnerEvent) => void,
  ) {}

  config(): { worktreesDir: string } {
    return { worktreesDir: join(this.projectRoot, ".worktrees") };
  }

  private newId(): string {
    this.seq++;
    return `job-${Date.now().toString(36)}-${this.seq.toString(36)}`;
  }

  /**
   * On startup, scan `.worktrees/` for orphan worktrees (branch matches
   * `agent/<change-id>`, path under `.worktrees/`) and adopt them as
   * synthetic jobs with status "orphaned". Idempotent: skip changes that
   * already have a live lock (either from a fresh spawn or another
   * adoption path, e.g. add-agent-process-detach).
   *
   * See add-orphan-worktree-adoption.
   */
  async adoptOrphanWorktrees(): Promise<void> {
    const orphans = await listOrphanWorktrees(this.projectRoot);
    for (const orphan of orphans) {
      if (this.locks.has(orphan.changeId)) continue;

      const jobId = this.newId();
      let startedAt = Date.now();
      try {
        startedAt = statSync(orphan.worktreePath).mtimeMs;
      } catch {
        /* fall back to now */
      }
      const job: Job = {
        id: jobId,
        changeId: orphan.changeId,
        agentName: "orphan",
        branch: orphan.branch,
        worktreePath: orphan.worktreePath,
        status: "orphaned",
        startedAt,
        output: [],
      };
      this.jobs.set(jobId, job);
      this.locks.set(orphan.changeId, jobId);

      // Eager synchronous parse of tasks.md so the first `/api/agents/jobs`
      // response the client fetches after startup already carries the
      // current progress — the chokidar watcher's debounced initial event
      // races the client's fetch on fresh startup and is not reliable as
      // the sole source.
      try {
        const tasksPath = join(
          orphan.worktreePath,
          "openspec",
          "changes",
          orphan.changeId,
          "tasks.md",
        );
        const raw = readFileSync(tasksPath, "utf8");
        const list = parseTasks(tasksPath, raw);
        let done = 0;
        let total = 0;
        for (const sec of list.sections) {
          for (const t of sec.tasks) {
            total++;
            if (t.checked) done++;
          }
        }
        job.lastWorktreeProgress = { done, total };
      } catch {
        // Worktree may not have the file yet; watcher will pick it up.
      }

      console.log(`[runner] adopted orphan worktree ${orphan.changeId} → ${jobId}`);
      this.emit({ type: "agent-job-started", job: stripOutput(job) });

      // Attach worktree tasks watcher so the Kanban card's progress bar
      // reflects the worktree's live state (and any manual edits).
      job.worktreeTasksWatcher = startWorktreeProgressWatcher({
        projectRoot: this.projectRoot,
        changeId: orphan.changeId,
        onProgress: (progress) => {
          job.lastWorktreeProgress = progress;
          this.emit({
            type: "worktree-progress-updated",
            jobId,
            changeId: orphan.changeId,
            progress,
          });
        },
        onError: (err) => {
          console.warn(
            `[runner] orphan worktree-progress read failed for ${orphan.changeId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        },
      });
    }
  }

  listJobs(limit = 50): JobSummary[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit)
      .map(stripOutput);
  }

  getJob(id: string): Job | null {
    return this.jobs.get(id) ?? null;
  }

  activeJobForChange(changeId: string): JobSummary | null {
    const jobId = this.locks.get(changeId);
    if (!jobId) return null;
    const job = this.jobs.get(jobId);
    return job ? stripOutput(job) : null;
  }

  latestJobForChange(changeId: string): JobSummary | null {
    const all = [...this.jobs.values()].filter((j) => j.changeId === changeId);
    if (all.length === 0) return null;
    all.sort((a, b) => b.startedAt - a.startedAt);
    return stripOutput(all[0]);
  }

  async run(changeId: string, agentName: string): Promise<
    | { ok: true; job: JobSummary }
    | { ok: false; status: number; reason: string }
  > {
    if (this.locks.has(changeId)) {
      const jobId = this.locks.get(changeId)!;
      return { ok: false, status: 409, reason: `A job is already running for ${changeId} (${jobId}). Cancel or wait for it to finish.` };
    }
    const def = this.registry.find(agentName);
    if (!def) {
      return { ok: false, status: 400, reason: `Unknown agent "${agentName}". Check agents.yaml.` };
    }
    const worktreePath = join(this.projectRoot, ".worktrees", changeId);
    const branch = `agent/${changeId}`;
    if (existsSync(worktreePath)) {
      return {
        ok: false,
        status: 409,
        reason: `${worktreePath} already exists. Merge or discard the previous run before starting another.`,
      };
    }

    // Create the worktree on a fresh branch from current HEAD.
    try {
      console.log(`[runner] git worktree add ${worktreePath} -b ${branch}`);
      await execFile("git", ["worktree", "add", worktreePath, "-b", branch], {
        cwd: this.projectRoot,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[runner] git worktree add failed: ${msg}`);
      return {
        ok: false,
        status: 500,
        reason: `git worktree add failed: ${msg}`,
      };
    }

    const resolved = this.registry.resolve(def, {
      change_id: changeId,
      worktree_path: worktreePath,
      branch,
    });
    console.log(`[runner] spawn ${def.command} ${resolved.args.join(" ")} (cwd=${worktreePath})`);

    const id = this.newId();
    const job: Job = {
      id,
      changeId,
      agentName,
      branch,
      worktreePath,
      status: "running",
      startedAt: Date.now(),
      output: [],
    };
    this.jobs.set(id, job);
    this.locks.set(changeId, id);

    // Spawn under a PTY so TTY-detecting CLIs (Claude Code, Aider, Codex,
    // …) enter their interactive modes. Reuses the embedded terminal's
    // node-pty loader; if the native module is unavailable we surface a
    // clean 500 before touching the worktree state further.
    const ptyMod = await loadPty();
    if (!ptyMod.available) {
      console.error(`[runner] pty unavailable: ${ptyMod.reason}`);
      // Roll back the worktree we just created so the user can retry once
      // the pty problem is fixed.
      try {
        await execFile("git", ["worktree", "remove", "--force", worktreePath], { cwd: this.projectRoot });
        await execFile("git", ["branch", "-D", branch], { cwd: this.projectRoot });
      } catch {
        /* best effort */
      }
      return { ok: false, status: 500, reason: `pty unavailable: ${ptyMod.reason}` };
    }
    const term: IPty = ptyMod.module.spawn(def.command, resolved.args, {
      name: "xterm-256color",
      cwd: worktreePath,
      env: { ...process.env, ...resolved.env, TERM: "xterm-256color" },
      cols: 200,
      rows: 50,
    });
    this.processes.set(id, term);

    this.emit({ type: "agent-job-started", job: stripOutput(job) });

    // add-agent-initial-input: hand the CLI its opening prompt via the PTY
    // write channel.
    //
    // Two-step write is deliberate. Claude Code's Ink-based input handler
    // treats a multi-char chunk arriving in a single stdin read as a
    // *paste* — inside a paste, `\r` is inserted as a newline in the
    // composer, NOT treated as submit. So `write("/opsx:apply foo\r")` in
    // one call leaves Claude sitting at the prompt with the text typed
    // but no Enter fired. This is the same automation gotcha tmux
    // `send-keys` users hit.
    //
    // The fix: send the text and the Enter as separate writes with a
    // short gap. Each hits stdin as a distinct read; the second one is a
    // single `\r` byte that Claude treats as a submit.
    //
    // The 800ms pre-delay lets Claude's REPL initialize before either
    // write lands — install line editor, register handlers, etc.
    if (resolved.initialInput !== undefined) {
      // If the caller embedded a trailing newline, honor it (no double).
      const stripped = resolved.initialInput.replace(/[\r\n]+$/, "");
      setTimeout(() => {
        if (!this.processes.has(id)) return;
        try {
          term.write(stripped);
          pushOutput(job, { stream: "stdin", chunk: stripped, ts: Date.now() });
          this.emit({ type: "agent-job-output", jobId: id, chunk: stripped, stream: "stdin" });
          console.log(`[runner] wrote initialInput text for ${changeId}`);
          // Second write: standalone Enter, as its own stdin read.
          // 300ms is long enough that Claude's paste-mode timer has
          // definitely finished between the two reads.
          setTimeout(() => {
            if (!this.processes.has(id)) return;
            try {
              term.write("\r");
              pushOutput(job, { stream: "stdin", chunk: "\r", ts: Date.now() });
              this.emit({ type: "agent-job-output", jobId: id, chunk: "\r", stream: "stdin" });
              console.log(`[runner] wrote initialInput Enter for ${changeId}`);
            } catch (err) {
              console.error(
                `[runner] initial input Enter write failed for ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }, 300);
        } catch (err) {
          console.error(
            `[runner] initial input write failed for ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }, 800);
    }

    term.onData((data: string) => {
      pushOutput(job, { stream: "stdout", chunk: data, ts: Date.now() });
      this.emit({ type: "agent-job-output", jobId: id, chunk: data, stream: "stdout" });
    });

    // add-worktree-tasks-watcher: watch the worktree's tasks.md so the
    // Kanban card's progress bar moves even when the agent is running in
    // `-p` mode (silent PTY). The watcher self-debounces + gates on
    // real changes; the runner just relays each emission over WS.
    job.worktreeTasksWatcher = startWorktreeProgressWatcher({
      projectRoot: this.projectRoot,
      changeId,
      onProgress: (progress) => {
        job.lastWorktreeProgress = progress;
        this.emit({ type: "worktree-progress-updated", jobId: id, changeId, progress });
      },
      onError: (err) => {
        console.warn(
          `[runner] worktree-progress read failed for ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    });

    const finish = (status: JobStatus, exitCode: number | null) => {
      job.status = status;
      job.finishedAt = Date.now();
      job.exitCode = exitCode;
      this.locks.delete(changeId);
      this.processes.delete(id);
      // Emit the last-known worktree progress so the client keeps the
      // right number on screen while the user reviews the finished job.
      if (job.lastWorktreeProgress) {
        this.emit({
          type: "worktree-progress-updated",
          jobId: id,
          changeId,
          progress: job.lastWorktreeProgress,
        });
      }
      // Dispose the fs watcher before broadcasting the finished event so
      // no more progress emissions can race the terminal transition.
      try {
        job.worktreeTasksWatcher?.dispose();
      } catch {
        /* ignore */
      }
      job.worktreeTasksWatcher = undefined;
      this.emit({ type: "agent-job-finished", jobId: id, status, exitCode });
    };

    term.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      // SIGTERM (signal 15) with no prior cancel-flag flip still ends the
      // process; when we cancelled we already flipped status ourselves.
      const isSigterm = signal === 15;
      const finalStatus = job.status === "running"
        ? (isSigterm ? "cancelled" : exitCode === 0 ? "completed" : "crashed")
        : job.status;
      console.log(`[runner] exit ${changeId} status=${finalStatus} code=${exitCode} signal=${signal}`);
      if (job.status === "running") {
        finish(finalStatus, exitCode);
      }
    });

    return { ok: true, job: stripOutput(job) };
  }

  cancel(id: string): { ok: boolean; reason?: string } {
    const job = this.jobs.get(id);
    if (!job) return { ok: false, reason: "Unknown job id" };
    if (job.status === "orphaned") {
      return {
        ok: false,
        reason: "Orphaned worktree has no process to cancel — Discard or Merge instead.",
      };
    }
    if (job.status !== "running") return { ok: false, reason: "Job is not running" };
    const proc = this.processes.get(id);
    if (!proc) return { ok: false, reason: "Process handle missing" };
    job.status = "cancelled";
    proc.kill("SIGTERM");
    return { ok: true };
  }

  /**
   * Write user-supplied bytes to a running agent through its PTY. When
   * appendNewline is true (the default; most CLIs consume input line-by-line),
   * a `\r` — the byte a terminal actually sends on Enter — is appended.
   * The written bytes are echoed into the job's ring buffer as a
   * `stream: "stdin"` line and broadcast to all listeners so the transcript
   * remains self-contained for post-hoc review.
   */
  writeInput(id: string, data: string, appendNewline = true): { ok: true } | { ok: false; status: number; reason: string } {
    const job = this.jobs.get(id);
    if (!job) return { ok: false, status: 404, reason: "Unknown job id" };
    if (job.status === "orphaned") {
      return {
        ok: false,
        status: 409,
        reason: "This job is orphaned; interactive input is disabled — no process handle.",
      };
    }
    if (job.status !== "running") {
      return { ok: false, status: 409, reason: `Job is ${job.status}, not accepting input.` };
    }
    const term = this.processes.get(id);
    if (!term) {
      return { ok: false, status: 500, reason: "PTY handle not available." };
    }
    const bytes = appendNewline ? `${data}\r` : data;
    try {
      term.write(bytes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[runner] pty write failed for ${id}: ${msg}`);
      return { ok: false, status: 500, reason: `pty write failed: ${msg}` };
    }
    pushOutput(job, { stream: "stdin", chunk: bytes, ts: Date.now() });
    this.emit({ type: "agent-job-output", jobId: id, chunk: bytes, stream: "stdin" });
    return { ok: true };
  }

  /** SIGTERM every active process + dispose per-job watchers. Called on
   *  server shutdown. */
  shutdown(): void {
    for (const job of this.jobs.values()) {
      try {
        job.worktreeTasksWatcher?.dispose();
      } catch {
        /* ignore */
      }
    }
    for (const proc of this.processes.values()) {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
}

function pushOutput(job: Job, line: OutputLine): void {
  job.output.push(line);
  if (job.output.length > RING_LIMIT) {
    job.output.splice(0, job.output.length - RING_LIMIT);
  }
}

function stripOutput(job: Job): JobSummary {
  const {
    output: _output,
    cachedDiff: _cachedDiff,
    worktreeTasksWatcher: _watcher,
    lastWorktreeProgress,
    ...rest
  } = job;
  return { ...rest, worktreeProgress: lastWorktreeProgress };
}
