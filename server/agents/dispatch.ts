// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { AgentRegistry, AgentDef } from "./registry.js";
import { runtimeLabel } from "./registry.js";
import type { AgentRunner, Job } from "./runner.js";
import type { ReviewArtifact } from "./review-parser.js";

/**
 * Role-driven dispatch: pick an agent from `agents.yaml` matching the
 * requested role + change specialties + optional runtime, run it via the
 * existing AgentRunner, and (by default) block until the job terminates
 * before returning a summary.
 *
 * This is the underlying implementation for `POST /api/agents/dispatch`.
 * The Manager (Phase 4's `/opsx:apply` claude session) will call the HTTP
 * endpoint via Bash + curl from within its Claude Code session.
 */

export type DispatchStatus = "completed" | "failed" | "cancelled" | "timeout" | "running";

export type DispatchResult = {
  jobId: string;
  agentName: string;
  runtime: string;
  status: DispatchStatus;
  exitCode?: number;
  stdoutTail?: string;
  artifactPaths?: string[];
  /** Parsed review.md verdict when the underlying job produced one.
   *  Undefined when the job is not a review, or when parsing failed.
   *  Landed by add-review-artifact. */
  verdict?: ReviewArtifact;
};

export type SelectorError = {
  error: string;
  matches: AgentDef[];
};

export type SelectResult = { agent: AgentDef } | SelectorError;

export type SelectQuery = {
  role: string;
  runtime?: string;
  changeTags: string[];
};

const WILDCARD_SPECIALTIES = new Set(["any"]);

/**
 * Filter agents to those matching role, specialties (intersection with
 * changeTags, or wildcard when specialties is empty or contains "any"),
 * and runtime (when supplied). Preserves `agents.yaml` declaration order.
 */
export function selectAgent(registry: AgentRegistry, query: SelectQuery): SelectResult {
  const cfg = registry.publicConfig();
  const candidates: AgentDef[] = [];
  for (const a of cfg.agents) {
    // `publicConfig` strips env; treat the shape as AgentDef for role /
    // specialties / runtime matching (these fields are preserved).
    const def = a as unknown as AgentDef;
    if (def.role !== query.role) continue;

    const spec = def.specialties ?? [];
    const isWildcard =
      spec.length === 0 || spec.some((s) => WILDCARD_SPECIALTIES.has(s));
    if (!isWildcard) {
      const hasIntersection = spec.some((s) => query.changeTags.includes(s));
      if (!hasIntersection) continue;
    }

    if (query.runtime !== undefined) {
      // Legacy agents (command + args, no runtime field) match only when
      // the request does NOT specify a runtime. When a runtime IS
      // requested, only runtime-backed agents with the matching name pass.
      if (def.runtime !== query.runtime) continue;
    }

    candidates.push(def);
  }

  if (candidates.length === 0) {
    return {
      error: `no agent matches role='${query.role}'${query.runtime ? `, runtime='${query.runtime}'` : ""}${
        query.changeTags.length ? `, tags=[${query.changeTags.join(", ")}]` : ""
      }`,
      matches: [],
    };
  }
  return { agent: candidates[0] };
}

/**
 * Read the change's proposal.md frontmatter to extract `tags:` — used by
 * the selector for specialty matching. Missing file / missing tags → empty
 * array. Never throws.
 */
export async function resolveChangeTags(
  projectRoot: string,
  changeId: string,
): Promise<string[]> {
  const p = join(projectRoot, "openspec", "changes", changeId, "proposal.md");
  if (!existsSync(p)) return [];
  try {
    const raw = await readFile(p, "utf8");
    const fm = matter(raw);
    const t = fm.data?.tags;
    if (!Array.isArray(t)) return [];
    return t.filter((v: unknown): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export type DispatchInput = {
  role: string;
  changeId: string;
  runtime?: string;
  promptSuffix?: string;
  wait?: boolean;
  timeoutMs?: number;
};

export const DEFAULT_DISPATCH_TIMEOUT_MS = 30 * 60 * 1000;
export const MIN_DISPATCH_TIMEOUT_MS = 1000;

/**
 * Poll runner.getJob(id) until the job leaves the "running" state or the
 * timeout elapses. On timeout, cancel the job and return "timeout".
 *
 * We poll rather than subscribing because AgentRunner exposes a
 * fire-and-forget event callback (constructor-injected) rather than an
 * EventEmitter surface. A polling loop is simple, reliable, and avoids
 * plumbing a new subscription API for a single caller.
 */
export async function waitForJobCompletion(
  runner: AgentRunner,
  jobId: string,
  timeoutMs: number,
  intervalMs = 250,
): Promise<Job | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = runner.getJob(jobId);
    if (!job) throw new Error(`job ${jobId} disappeared`);
    if (job.status !== "running") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  runner.cancel(jobId);
  return "timeout";
}

/** Trim job.output to the last N bytes of concatenated stdout for the
 *  DispatchResult response. */
export function stdoutTail(job: Job, maxBytes = 4096): string {
  let total = "";
  for (let i = job.output.length - 1; i >= 0; i--) {
    const line = job.output[i];
    if (line.stream !== "stdout") continue;
    total = line.chunk + total;
    if (Buffer.byteLength(total, "utf8") >= maxBytes) break;
  }
  return total.slice(-maxBytes);
}

function mapStatusToDispatch(jobStatus: string): DispatchStatus {
  switch (jobStatus) {
    case "completed":
      return "completed";
    case "crashed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "running":
      return "running";
    default:
      return "failed";
  }
}

export type DispatchOutcome =
  | { ok: true; result: DispatchResult }
  | { ok: false; status: number; error: string; matches?: AgentDef[] };

/**
 * Full dispatch flow. Returns an outcome shape usable directly by the
 * Fastify route.
 */
export async function dispatch(
  runner: AgentRunner,
  registry: AgentRegistry,
  projectRoot: string,
  input: DispatchInput,
): Promise<DispatchOutcome> {
  if (!input.role) return { ok: false, status: 400, error: "role is required" };
  if (!input.changeId) return { ok: false, status: 400, error: "changeId is required" };

  const timeoutMs = input.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;
  if (typeof timeoutMs !== "number" || timeoutMs < MIN_DISPATCH_TIMEOUT_MS) {
    return {
      ok: false,
      status: 400,
      error: `timeoutMs must be a number >= ${MIN_DISPATCH_TIMEOUT_MS}`,
    };
  }

  const changeDir = join(projectRoot, "openspec", "changes", input.changeId);
  if (!existsSync(changeDir)) {
    return { ok: false, status: 404, error: `change '${input.changeId}' not found` };
  }

  const cfg = registry.publicConfig();
  if (cfg.agents.length === 0) {
    return {
      ok: false,
      status: 503,
      error: "no agents defined in agents.yaml",
    };
  }

  const changeTags = await resolveChangeTags(projectRoot, input.changeId);
  const selection = selectAgent(registry, {
    role: input.role,
    runtime: input.runtime,
    changeTags,
  });
  if ("error" in selection) {
    return {
      ok: false,
      status: 404,
      error: selection.error,
      matches: selection.matches,
    };
  }
  const agent = selection.agent;

  const runResult = await runner.run(input.changeId, agent.name);
  if (!runResult.ok) {
    return { ok: false, status: runResult.status, error: runResult.reason };
  }
  const startedJob = runResult.job;

  const runtime = runtimeLabel(agent);

  const wait = input.wait ?? true;
  if (!wait) {
    return {
      ok: true,
      result: {
        jobId: startedJob.id,
        agentName: agent.name,
        runtime,
        status: "running",
      },
    };
  }

  const outcome = await waitForJobCompletion(runner, startedJob.id, timeoutMs);
  if (outcome === "timeout") {
    // Timeout path: the runner's cancel() flipped status, and its finish()
    // hook (invoked by the child's exit handler) is what populates
    // artifactPaths. Read whatever is present; may be undefined if
    // finish() has not settled yet.
    const j = runner.getJob(startedJob.id);
    return {
      ok: true,
      result: {
        jobId: startedJob.id,
        agentName: agent.name,
        runtime,
        status: "timeout",
        stdoutTail: j ? stdoutTail(j) : undefined,
        artifactPaths: j?.artifactPaths ?? [],
        verdict: j?.verdict,
      },
    };
  }

  // Normal termination: runner's finish() awaits the artifact scan before
  // flipping status, so job.artifactPaths / verdict are set atomically
  // alongside the terminal status by the time waitForJobCompletion returns.
  return {
    ok: true,
    result: {
      jobId: outcome.id,
      agentName: agent.name,
      runtime,
      status: mapStatusToDispatch(outcome.status),
      exitCode: outcome.exitCode ?? undefined,
      stdoutTail: stdoutTail(outcome),
      artifactPaths: outcome.artifactPaths ?? [],
      verdict: outcome.verdict,
    },
  };
}
