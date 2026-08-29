// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, realpathSync } from "node:fs";
import { unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import { execFile as execFileCb, spawn as spawnChild, type ChildProcess } from "node:child_process";
import type { AgentRegistry } from "./registry.js";
import { startWorktreeProgressWatcher, type WorktreeProgressHandle } from "./worktree-progress.js";
import { listOrphanWorktrees } from "./adopt-orphans.js";
import { parseReview, type ReviewArtifact } from "./review-parser.js";
import type { Progress } from "../model.js";
import { statSync, readFileSync } from "node:fs";
import { parseTasks } from "../parser/tasks.js";
import { isSafeChangeId } from "../util/change-id.js";
import { detachedCommandMatches, startDetached, startLogTail, type DetachedMeta } from "./detached-runner.js";
import { pidAlive, readDetachedMeta, removeMeta } from "./detached-runner.js";

const execFile = promisify(execFileCb);

/**
 * Spawns agents in isolated git worktrees and tracks them in an in-memory
 * registry. One job per change is enforced via a lock map. Output is kept
 * in a ring buffer and broadcast over the dashboard's WebSocket.
 */

export type JobStatus = "running" | "completed" | "cancelled" | "crashed" | "orphaned" | "timed-out";

/** Controls the execution-root policy for dispatcher-initiated runs.
 *  Landed by route-dispatch-by-manager-worker-cli (Task 2.2). */
export type RunnerExecutionMode = "worktree" | "main-tree";

export type JobSummary = {
  id: string;
  changeId: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  status: JobStatus;
  detached?: boolean;
  /** Dispatch role — set by Manager (or the AgentRunner.run caller) at
   *  dispatch time. Standard workflow values: "propose" | "code" | "review"
   *  | "verify". Custom roles are accepted at the type level but filtered
   *  out of Phase view rendering. Undefined on legacy records from before
   *  this change was applied — Phase view treats those as "unroleable"
   *  and buckets to DONE lane as fallback. Added by
   *  reshape-phase-view-to-active-agent-state. */
  role?: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  /** Last-observed worktree tasks.md progress. Included in the summary so
   *  clients that fetch /api/agents/jobs see the current number without
   *  needing to wait for the WS `worktree-progress-updated` event. */
  worktreeProgress?: Progress;
  /** Parsed `review.md` when the job produced one and its frontmatter
   *  validated against the schema. Undefined otherwise (non-review
   *  jobs, malformed frontmatter, missing file). Landed by
   *  add-review-artifact. */
  verdict?: ReviewArtifact;
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
  detachedMeta?: DetachedMeta;
  detachedPoll?: NodeJS.Timeout;
  logTail?: { dispose(): void };
};

export type OutputLine = { stream: "stdout" | "stderr"; chunk: string; ts: number };

const RING_LIMIT = 10_000;

type RunnerEvent =
  | { type: "agent-job-started"; job: JobSummary }
  | { type: "agent-job-output"; jobId: string; chunk: string; stream: "stdout" | "stderr" }
  | { type: "agent-job-finished"; jobId: string; status: JobStatus; exitCode: number | null }
  | { type: "agent-job-removed"; jobId: string; changeId: string }
  | { type: "worktree-progress-updated"; jobId: string; changeId: string; progress: Progress };

export class AgentRunner {
  private jobs = new Map<string, Job>();
  private processes = new Map<string, ChildProcess>();
  private locks = new Map<string, string>(); // changeId -> jobId
  private seq = 0;
  private readonly eventEmitter = new EventEmitter();

  constructor(
    private readonly projectRoot: string,
    private readonly registry: AgentRegistry,
    private readonly emit: (event: RunnerEvent) => void,
  ) {}

  /** Recover detached jobs left running by a previous server process. */
  async adoptDetached(): Promise<void> {
    const root = join(this.projectRoot, ".worktrees");
    let entries: string[];
    try { entries = await readdir(root); } catch { return; }
    for (const entry of entries) {
      const worktreePath = join(root, entry);
      const metaPath = join(worktreePath, ".agent-meta.json");
      const meta = await readDetachedMeta(metaPath);
      if (!meta || !pidAlive(meta.pid) || !existsSync(worktreePath) || this.locks.has(meta.changeId)) {
        if (metaPath) await removeMeta(metaPath);
        continue;
      }
      try {
        const { stdout } = await execFile("ps", ["-p", String(meta.pid), "-o", "command="], { cwd: this.projectRoot });
        if (!detachedCommandMatches(meta, stdout)) { await removeMeta(metaPath); continue; }
      } catch {
        // `ps` is unavailable on some platforms; liveness and metadata are
        // still sufficient there because detached mode is warned on Windows.
      }
      const job: Job = {
        id: meta.jobId, changeId: meta.changeId, agentName: meta.agentName,
        branch: `agent/${meta.changeId}`, worktreePath, status: "running",
        startedAt: meta.startedAt, output: [], detached: true, detachedMeta: meta,
      };
      this.jobs.set(job.id, job);
      this.locks.set(job.changeId, job.id);
      const adoptedProc = { pid: meta.pid, kill: (signal: NodeJS.Signals) => { process.kill(meta.pid, signal); return true; } } as unknown as ChildProcess;
      this.processes.set(job.id, adoptedProc);
      job.logTail = startLogTail(meta.logPath, (chunk) => {
        pushOutput(job, { stream: "stdout", chunk, ts: Date.now() });
        this.emit({ type: "agent-job-output", jobId: job.id, chunk, stream: "stdout" });
      });
      job.worktreeTasksWatcher = startWorktreeProgressWatcher({
        projectRoot: this.projectRoot, changeId: job.changeId, worktreePath,
        onProgress: (progress) => { job.lastWorktreeProgress = progress; this.emit({ type: "worktree-progress-updated", jobId: job.id, changeId: job.changeId, progress }); },
        onUnlink: () => this.removeJobExternally(job.id, job.changeId),
      });
      job.detachedPoll = setInterval(() => {
        if (!pidAlive(meta.pid)) {
          const status: JobStatus = job.status === "cancelled" ? "cancelled" : "completed";
          job.status = status;
          job.finishedAt = Date.now();
          job.exitCode = null;
          job.logTail?.dispose();
          if (job.detachedPoll) clearInterval(job.detachedPoll);
          this.processes.delete(job.id);
          void removeMeta(metaPath);
          this.emit({ type: "agent-job-finished", jobId: job.id, status, exitCode: null });
          this.eventEmitter.emit(`finished:${job.id}`, { status, exitCode: null });
          this.locks.delete(job.changeId);
        }
      }, 3000);
      this.emit({ type: "agent-job-started", job: stripOutput(job) });
    }
  }

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
        onUnlink: () => this.removeJobExternally(jobId, orphan.changeId),
      });
    }

  }

  /**
   * Called by the worktree-progress watcher when its watched `tasks.md`
   * is unlinked — the signal that someone ran `git worktree remove` (or
   * equivalent) outside the UI. Drops the job from the runner's maps and
   * broadcasts so the client's Kanban card returns to TODO without a
   * server restart. Landed by add-worktree-external-discard-detection.
   */
  private removeJobExternally(jobId: string, changeId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.status === "running") {
      console.warn(
        `[runner] worktree externally removed while ${changeId} agent was live — the process will exit on its own when it notices the missing cwd`,
      );
    }
    try {
      job.worktreeTasksWatcher?.dispose();
    } catch {
      /* ignore */
    }
    job.worktreeTasksWatcher = undefined;
    this.jobs.delete(jobId);
    if (this.locks.get(changeId) === jobId) this.locks.delete(changeId);
    this.emit({ type: "agent-job-removed", jobId, changeId });
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

  // ---------------------------------------------------------------------------
  // Execution-root policy — route-dispatch-by-manager-worker-cli (Task 2.2)
  // ---------------------------------------------------------------------------

  /**
   * Derive and validate the execution root for a dispatcher-initiated run.
   *
   * - `"worktree"`: use `.worktrees/<changeId>`. If the directory already
   *   exists it must belong to this repo AND track `agent/<changeId>`;
   *   anything else is rejected with diagnostics rather than overwritten.
   * - `"main-tree"`: use the project root as-is (no worktree created).
   *
   * Returns `{ ok: true; cwd; branch; created }` on success,
   * or `{ ok: false; status; reason }` on failure.
   */
  async resolveExecutionRoot(
    changeId: string,
    mode: RunnerExecutionMode,
  ): Promise<
    | { ok: true; cwd: string; branch: string; created: boolean }
    | { ok: false; status: number; reason: string }
  > {
    // Defense in depth: AgentRunner also has non-HTTP callers. Never let a
    // change id become more than one worktree path / branch component.
    if (!isSafeChangeId(changeId)) {
      return { ok: false, status: 400, reason: "Invalid change id" };
    }
    if (mode === "main-tree") {
      return { ok: true, cwd: this.projectRoot, branch: "", created: false };
    }
    // worktree mode
    const worktreePath = join(this.projectRoot, ".worktrees", changeId);
    const branch = `agent/${changeId}`;
    if (existsSync(worktreePath)) {
      // Validate the existing worktree: must belong to this repo and branch.
      try {
        const [listOut, currentBranch] = await Promise.all([
          execFile("git", ["worktree", "list", "--porcelain"], { cwd: this.projectRoot }).then(
            (r) => r.stdout,
          ),
          execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: worktreePath }).then(
            (r) => r.stdout.trim(),
          ),
        ]);
        // Parse worktree paths from porcelain output and compare canonically.
        // git resolves symlinks when recording worktree paths (e.g. macOS
        // /var → /private/var), so we must do the same for worktreePath.
        // We also normalize separators and case for Windows where git outputs
        // forward slashes but path.join() produces backslashes.
        // realpathSync.native uses the OS-level call (GetFinalPathNameByHandle
        // on Windows) which expands 8.3 short names (RUNNER~1 → RunnerAdmin)
        // and resolves symlinks (macOS /var → /private/var). Plain realpathSync
        // is JS-only and skips short-name expansion, causing mismatches on CI.
        const normPath = (p: string) => {
          try {
            return realpathSync.native(p).toLowerCase().replace(/\\/g, "/");
          } catch {
            return p.toLowerCase().replace(/[/\\]+/g, "/");
          }
        };
        const knownPaths = listOut
          .split(/\n/)
          .filter((l) => l.startsWith("worktree "))
          .map((l) => l.slice("worktree ".length).trim());
        if (!knownPaths.some((p) => normPath(p) === normPath(worktreePath))) {
          return {
            ok: false,
            status: 409,
            reason:
              `${worktreePath} exists but belongs to a different repository. ` +
              `Remove it manually before retrying.`,
          };
        }
        if (currentBranch !== branch) {
          return {
            ok: false,
            status: 409,
            reason:
              `${worktreePath} exists on branch '${currentBranch}', expected '${branch}'. ` +
              `Merge or discard the previous run before starting another.`,
          };
        }
        // Existing worktree is valid — reuse it.
        return { ok: true, cwd: worktreePath, branch, created: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          status: 409,
          reason: `${worktreePath} exists but could not be validated: ${msg}. Remove it manually before retrying.`,
        };
      }
    }
    // Create a fresh worktree.
    try {
      console.log(`[runner] git worktree add ${worktreePath} -b ${branch}`);
      await execFile("git", ["worktree", "add", worktreePath, "-b", branch], {
        cwd: this.projectRoot,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[runner] git worktree add failed: ${msg}`);
      return { ok: false, status: 500, reason: `git worktree add failed: ${msg}` };
    }
    return { ok: true, cwd: worktreePath, branch, created: true };
  }

  /** Spawn an agent for a change.
   *
   *  `role` is the dispatch role — set by the caller (Manager, or an
   *  HTTP client hitting /api/agents/run). When omitted, falls back to
   *  the agent's first declared role (`def.roles[0]`), which is the
   *  legacy behavior. Phase view uses this to bucket the change into
   *  the correct role lane. Added by
   *  reshape-phase-view-to-active-agent-state.
   *
   *  `executionMode` controls the execution-root policy
   *  (route-dispatch-by-manager-worker-cli Task 2.2):
   *  - `"worktree"` (default): create / reuse `.worktrees/<changeId>`.
   *  - `"main-tree"`: use the project root as cwd; no worktree created. */
  async run(
    changeId: string,
    agentName: string,
    role?: string,
    executionMode: RunnerExecutionMode = "worktree",
    /** Dispatcher-supplied prompt with artifact contract. When set, overrides
     *  both `agents.yaml` prompts and the built-in default for this run. */
    promptOverride?: string,
  ): Promise<
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
    const dispatchRole = role ?? def.roles[0];

    // Derive and validate the execution root (Task 2.2).
    const rootResult = await this.resolveExecutionRoot(changeId, executionMode);
    if (!rootResult.ok) return rootResult;
    const { cwd: worktreePath, branch, created } = rootResult;

    let resolved;
    try {
      resolved = this.registry.resolve(
        def,
        {
          change_id: changeId,
          worktree_path: worktreePath,
          branch,
        },
        dispatchRole,
        promptOverride,
      );
    } catch (err) {
      // Clean up only when the worktree was freshly created by this call.
      // In main-tree mode or when reusing an existing worktree, we must
      // not remove anything.
      if (created) await this.cleanupWorktreeOnEarlyReturn(worktreePath, branch);
      return {
        ok: false,
        status: 400,
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    // A review artifact is a per-launch success signal, not durable evidence
    // that any later review/verify worker completed. Remove the prior artifact
    // before spawning so finalize() cannot parse stale output when the current
    // worker exits 0 without writing its contract file.
    if (dispatchRole === "review" || dispatchRole === "verify") {
      const artifactPath = join(worktreePath, "openspec", "changes", changeId, "review.md");
      try {
        await unlink(artifactPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          if (created) await this.cleanupWorktreeOnEarlyReturn(worktreePath, branch);
          return {
            ok: false,
            status: 500,
            reason: `Unable to invalidate prior review artifact at ${artifactPath}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
    }
    // registry.resolve() inlines cli-arg prompts into `args` at resolve
    // time (so the runner doesn't need to know about promptFlag).
    // Delivery channels for the resolved prompt:
    //   - `initialInputMode: "cli-arg"` — nothing extra; args carry it.
    //   - `initialInputMode: "stdin"` — pipe stdin and write the prompt.
    //     Both stdin-styled runtimes AND workers with `mode: live-shell`
    //     land here (live-shell = stdin-piped headless spawn; no PTY —
    //     CLIs that require a TTY like Claude Code should use
    //     single-prompt instead).
    // Manager `mode: live-shell` never reaches the runner — Terminal
    // panel PTY handling lives in `attachPtyToSocket` on the /pty WS.
    const finalArgs = [...resolved.args];
    const useStdinForPrompt =
      resolved.initialInputMode === "stdin" && resolved.initialInput !== undefined;
    console.log(`[runner] spawn ${resolved.command} ${finalArgs.join(" ")} (cwd=${worktreePath})`);

    const id = this.newId();
    // Dispatch role — caller-supplied (Manager, /api/agents/run) takes
    // precedence; fall back to the agent's first declared role for legacy
    // callers. Phase view reads this via jobByChange in the store.
    const job: Job = {
      id,
      changeId,
      agentName,
      branch,
      worktreePath,
      status: "running",
      role: dispatchRole,
      startedAt: Date.now(),
      output: [],
      ...(def.detached ? { detached: true } : {}),
    };
    this.jobs.set(id, job);
    this.locks.set(changeId, id);

    // Piped stdio spawn: `-p` mode means Claude Code (and equivalents) print
    // plain lines to stdout and exit cleanly — no TTY required, no permission
    // prompts. The prior PTY layer + xterm.js + input-relay chain was
    // reverted because `-p` makes them all unnecessary. See
    // openspec/changes/archive/…-revert-agent-pty-layers.
    //
    // stdin is only piped when the runtime declared promptStyle: stdin;
    // otherwise it stays "ignore" (the reverted PTY chain's decision).
    const child = def.detached
      ? await startDetached({
          command: resolved.command,
          args: finalArgs,
          cwd: worktreePath,
          env: { ...process.env, ...resolved.env },
          jobId: id,
          changeId,
          agentName,
        }).then((result) => {
          job.detachedMeta = result.meta;
          return result.child;
        })
      : spawnChild(resolved.command, finalArgs, {
      cwd: worktreePath,
      env: {
        ...process.env,
        ...resolved.env,
      },
      stdio: [useStdinForPrompt ? "pipe" : "ignore", "pipe", "pipe"],
    });
    this.processes.set(id, child);
    if (!def.detached && useStdinForPrompt && child.stdin) {
      // The registry.resolve() stdin branch guarantees initialInput is
      // set when useStdinForPrompt is true.
      child.stdin.end(resolved.initialInput ?? "");
    }

    this.emit({ type: "agent-job-started", job: stripOutput(job) });

    // Echo the spawn command line into the job's transcript as a synthetic
    // first stdout line. `-p` mode agents (Claude Code, etc.) typically
    // buffer their output and flush at the end — the user sees nothing
    // until completion. Showing the resolved command line up front means
    // the transcript has visible context immediately (what was requested,
    // even if the result takes a while).
    const spawnLine = `$ ${resolved.command}${finalArgs.length ? " " + finalArgs.map(quoteArg).join(" ") : ""}\n\n`;
    pushOutput(job, { stream: "stdout", chunk: spawnLine, ts: Date.now() });
    this.emit({ type: "agent-job-output", jobId: id, chunk: spawnLine, stream: "stdout" });

    const onOutput = (stream: "stdout" | "stderr") => (buf: Buffer | string) => {
      const chunk = buf.toString();
      pushOutput(job, { stream, chunk, ts: Date.now() });
      this.emit({ type: "agent-job-output", jobId: id, chunk, stream });
    };
    if (def.detached) {
      job.logTail = startLogTail(join(worktreePath, ".agent.log"), onOutput("stdout"));
    }
    child.stdout?.on("data", onOutput("stdout"));
    child.stderr?.on("data", onOutput("stderr"));
    // add-worktree-tasks-watcher: watch the worktree's tasks.md so the
    // Kanban card's progress bar moves even when the agent is running in
    // `-p` mode (silent PTY). The watcher self-debounces + gates on
    // real changes; the runner just relays each emission over WS.
    job.worktreeTasksWatcher = startWorktreeProgressWatcher({
      projectRoot: this.projectRoot,
      changeId,
      // Pool worktrees are named `.worktrees/<prefix>-N/`, not
      // `.worktrees/<change-id>/`, so pass the actual path through.
      worktreePath,
      onProgress: (progress) => {
        job.lastWorktreeProgress = progress;
        this.emit({ type: "worktree-progress-updated", jobId: id, changeId, progress });
      },
      onUnlink: () => this.removeJobExternally(id, changeId),
      onError: (err) => {
        console.warn(
          `[runner] worktree-progress read failed for ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    });

    let finalized = false;
    const finalize = async (status: JobStatus, exitCode: number | null) => {
      // Idempotent — the exit handler can race with cancel/timeout and
      // both may try to finalize; the first one wins.
      if (finalized) return;
      finalized = true;
      job.finishedAt = Date.now();
      job.exitCode = exitCode;
      this.processes.delete(id);
      job.logTail?.dispose();
      job.logTail = undefined;
      if (job.detachedPoll) clearInterval(job.detachedPoll);
      job.detachedPoll = undefined;
      if (job.detachedMeta) {
        await unlink(job.detachedMeta.metaPath).catch(() => undefined);
      }
      // If a review.md landed in the change dir, parse it into a
      // structured verdict. Landed by add-review-artifact. Read from
      // the WORKTREE — the branch is not yet merged so review.md only
      // exists there. parseReview returns null when the file is
      // missing / malformed, so no artifact-scan pre-check is needed.
      const parsed = await parseReview(worktreePath, changeId);
      if (parsed) job.verdict = parsed;
      job.status = status;
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
      // Do NOT dispose the fs watcher here — post-run jobs (completed /
      // crashed / cancelled) leave the worktree on disk waiting for
      // Merge / Discard. The watcher stays alive so an external `git
      // worktree remove` still fires `onUnlink` → `removeJobExternally`
      // and the Kanban card returns to TODO without a server restart.
      // Disposal happens in removeJobExternally itself.
      // Landed by add-worktree-external-discard-detection.
      this.eventEmitter.emit(`finished:${id}`, { status, exitCode });
      this.emit({ type: "agent-job-finished", jobId: id, status, exitCode });
      // Release the lock LAST — a concurrent runner.run(changeId, ...)
      // must see either "job in progress" or a fully-populated finished
      // job, never a partially-finalized one.
      this.locks.delete(changeId);
    };

    child.on("exit", (code, signal) => {
      // SIGTERM handling: when we called cancel() we already flipped status,
      // so respect the existing flag; otherwise infer from code/signal.
      const isSigterm = signal === "SIGTERM";
      const inferredStatus: JobStatus = isSigterm
        ? "cancelled"
        : code === 0
          ? "completed"
          : "crashed";
      // If cancel() flipped status to "cancelled" before the child
      // reaped, honor that decision; otherwise use the exit-inferred
      // status. Always call finalize() — the review-artifact scan,
      // pool release, and agent-job-finished emit all belong on
      // cancelled/crashed transitions too.
      const finalStatus = job.status === "running" ? inferredStatus : job.status;
      console.log(`[runner] exit ${changeId} status=${finalStatus} code=${code} signal=${signal}`);
      void finalize(finalStatus, code);
    });

    if (def.detached) {
      job.detachedPoll = setInterval(() => {
        try {
          process.kill(child.pid!, 0);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ESRCH") {
            void finalize(job.status === "running" ? "completed" : job.status, null);
          }
        }
      }, 3000);
      child.removeAllListeners("exit");
    }

    return { ok: true, job: stripOutput(job) };
  }

  /** Roll back a partially-set-up job when registry.resolve() throws
   *  after the worktree is already created. Failures are logged, not
   *  rethrown — the caller is already returning an error to the client. */
  private async cleanupWorktreeOnEarlyReturn(
    worktreePath: string,
    branch: string,
  ): Promise<void> {
    try {
      await execFile("git", ["worktree", "remove", "--force", worktreePath], {
        cwd: this.projectRoot,
      });
    } catch (err) {
      console.error(
        `[runner] worktree remove (early return) failed for ${worktreePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      await execFile("git", ["branch", "-D", branch], { cwd: this.projectRoot });
    } catch (err) {
      console.error(
        `[runner] branch delete (early return) failed for ${branch}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Synchronously await job completion without HTTP polling.
   * Resolves when the job reaches a terminal state (completed/crashed/cancelled).
   * Times out after `timeoutMs` if specified, killing the process and throwing.
   */
  async waitForCompletion(
    jobId: string,
    options?: { timeoutMs?: number },
  ): Promise<{ status: JobStatus; exitCode: number | null }> {
    const timeoutMs = options?.timeoutMs;
    // Repeat the bound at the timer sink so direct/internal callers cannot
    // allocate an arbitrarily long timer by bypassing HTTP validation.
    if (
      timeoutMs !== undefined &&
      (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30 * 60 * 1000)
    ) {
      throw new Error("timeoutMs must be a positive integer no greater than 1800000");
    }
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job id "${jobId}"`);
    if (job.status !== "running") {
      return { status: job.status, exitCode: job.exitCode ?? null };
    }

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      let timeoutError: Error | undefined;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.eventEmitter.removeListener(`finished:${jobId}`, onFinished);
      };

      const onFinished = (data: { status: JobStatus; exitCode: number | null }) => {
        cleanup();
        if (timeoutError) reject(timeoutError);
        else resolve(data);
      };

      this.eventEmitter.once(`finished:${jobId}`, onFinished);

      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          // Mark and terminate now, but do not return control to the caller
          // until the child has actually emitted exit and finalize() has run.
          // Windows keeps cwd/worktree handles locked between SIGTERM and exit;
          // rejecting immediately lets callers tear down the directory during
          // that window and produces EBUSY. onFinished performs the rejection.
          timeoutError = new Error(`Execution timed out after ${timeoutMs}ms`);
          const result = this.timeoutJob(jobId);
          if (!result.ok) {
            cleanup();
            reject(new Error(`${timeoutError.message}: ${result.reason ?? "termination failed"}`));
          }
        }, timeoutMs);
      }
    });
  }

  cancel(id: string): { ok: boolean; reason?: string } {
    return this.terminateJobWithStatus(id, "cancelled");
  }

  writeInput(id: string, input: string): { ok: boolean; status?: number; reason?: string } {
    const job = this.jobs.get(id);
    if (!job) return { ok: false, status: 404, reason: "Unknown job id" };
    if (job.detached) {
      return { ok: false, status: 409, reason: "This job is detached; interactive input is disabled." };
    }
    const proc = this.processes.get(id);
    if (!proc?.stdin || job.status !== "running") {
      return { ok: false, status: 409, reason: "Job does not accept input" };
    }
    proc.stdin.write(input);
    return { ok: true };
  }

  timeoutJob(id: string): { ok: boolean; reason?: string } {
    return this.terminateJobWithStatus(id, "timed-out");
  }

  private terminateJobWithStatus(id: string, status: "cancelled" | "timed-out"): { ok: boolean; reason?: string } {
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
    job.status = status;
    proc.kill("SIGTERM");
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
    for (const job of this.jobs.values()) {
      if (job.detachedPoll) clearInterval(job.detachedPoll);
      if (job.detached) {
        job.logTail?.dispose();
        job.logTail = undefined;
      }
    }
    for (const [id, proc] of this.processes) {
      if (this.jobs.get(id)?.detached) continue;
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

/**
 * POSIX-ish shell quoting for readable output. Not for actual re-execution —
 * spawn already got the args verbatim; this is just so the user sees an
 * unambiguous representation of what was launched.
 */
function quoteArg(a: string): string {
  if (a === "") return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(a)) return a;
  return `'${a.replace(/'/g, "'\\''")}'`;
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
