import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type { AgentRegistry } from "./registry.js";

const execFile = promisify(execFileCb);

/**
 * Spawns agents in isolated git worktrees and tracks them in an in-memory
 * registry. One job per change is enforced via a lock map. Output is kept
 * in a ring buffer and broadcast over the dashboard's WebSocket.
 */

export type JobStatus = "running" | "completed" | "cancelled" | "crashed";

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
};

export type Job = JobSummary & {
  /** Ring buffer of output lines (most recent at the end). */
  output: OutputLine[];
  /** Lazy-cached diff payload; populated by the diff endpoint on first read,
   *  invalidated when the job transitions back to running (the user re-ran). */
  cachedDiff?: unknown;
};

export type OutputLine = { stream: "stdout" | "stderr"; chunk: string; ts: number };

const RING_LIMIT = 10_000;

type RunnerEvent =
  | { type: "agent-job-started"; job: JobSummary }
  | { type: "agent-job-output"; jobId: string; chunk: string; stream: "stdout" | "stderr" }
  | { type: "agent-job-finished"; jobId: string; status: JobStatus; exitCode: number | null };

export class AgentRunner {
  private jobs = new Map<string, Job>();
  private processes = new Map<string, ChildProcess>();
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

    const child = spawn(def.command, resolved.args, {
      cwd: worktreePath,
      env: { ...process.env, ...resolved.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.processes.set(id, child);

    this.emit({ type: "agent-job-started", job: stripOutput(job) });

    const handleChunk = (stream: "stdout" | "stderr") => (buf: Buffer) => {
      // Push as one chunk per readable tick — UI splits by newline on render.
      // Bytes are decoded as UTF-8 with replacement for invalid sequences.
      const text = buf.toString("utf8");
      pushOutput(job, { stream, chunk: text, ts: Date.now() });
      this.emit({ type: "agent-job-output", jobId: id, chunk: text, stream });
    };
    child.stdout?.on("data", handleChunk("stdout"));
    child.stderr?.on("data", handleChunk("stderr"));

    const finish = (status: JobStatus, exitCode: number | null) => {
      job.status = status;
      job.finishedAt = Date.now();
      job.exitCode = exitCode;
      this.locks.delete(changeId);
      this.processes.delete(id);
      this.emit({ type: "agent-job-finished", jobId: id, status, exitCode });
    };

    child.on("error", (err) => {
      console.error(`[runner] spawn error for ${changeId} (${def.command}): ${err.message}`);
      pushOutput(job, { stream: "stderr", chunk: `spawn error: ${err.message}\n`, ts: Date.now() });
      finish("crashed", null);
    });
    child.on("exit", (code, signal) => {
      // SIGTERM with no explicit cancel still ends the process; if we sent
      // SIGTERM through cancel(), the status was already toggled — leave it.
      const finalStatus = job.status === "running"
        ? (signal === "SIGTERM" ? "cancelled" : code === 0 ? "completed" : "crashed")
        : job.status;
      console.log(`[runner] exit ${changeId} status=${finalStatus} code=${code} signal=${signal}`);
      if (job.status === "running") {
        finish(finalStatus, code);
      }
    });

    return { ok: true, job: stripOutput(job) };
  }

  cancel(id: string): { ok: boolean; reason?: string } {
    const job = this.jobs.get(id);
    if (!job) return { ok: false, reason: "Unknown job id" };
    if (job.status !== "running") return { ok: false, reason: "Job is not running" };
    const proc = this.processes.get(id);
    if (!proc) return { ok: false, reason: "Process handle missing" };
    job.status = "cancelled";
    proc.kill("SIGTERM");
    return { ok: true };
  }

  /** SIGTERM every active process. Called on server shutdown. */
  shutdown(): void {
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
  const { output: _output, ...rest } = job;
  return rest;
}
