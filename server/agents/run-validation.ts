// SPDX-License-Identifier: GPL-3.0-or-later
import type { RunnerExecutionMode } from "./runner.js";
import { isSafeChangeId } from "../util/change-id.js";

export const MAX_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

export type RunBody = {
  changeId: string;
  agentName: string;
  role?: string;
  executionMode?: RunnerExecutionMode;
  prompt?: string;
  wait?: boolean;
  timeoutMs?: number;
};

export function validateRunPayload(body: unknown): { ok: true; data: RunBody } | { ok: false; status: number; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  if (!b.changeId || typeof b.changeId !== "string" || !b.agentName || typeof b.agentName !== "string") {
    return { ok: false, status: 400, error: "changeId and agentName required" };
  }
  if (!isSafeChangeId(b.changeId)) {
    return { ok: false, status: 400, error: "changeId must contain only letters, numbers, '.', '_', or '-' and must not be '.' or '..'" };
  }
  if (b.executionMode !== undefined && b.executionMode !== "worktree" && b.executionMode !== "main-tree") {
    return { ok: false, status: 400, error: "executionMode must be 'worktree' or 'main-tree'" };
  }
  if (b.prompt !== undefined && typeof b.prompt !== "string") {
    return { ok: false, status: 400, error: "prompt must be a string" };
  }
  if (b.wait !== undefined && typeof b.wait !== "boolean") {
    return { ok: false, status: 400, error: "wait must be a boolean" };
  }
  if (
    b.timeoutMs !== undefined &&
    (typeof b.timeoutMs !== "number" ||
      !Number.isInteger(b.timeoutMs) ||
      b.timeoutMs <= 0 ||
      b.timeoutMs > MAX_AGENT_TIMEOUT_MS)
  ) {
    return {
      ok: false,
      status: 400,
      error: `timeoutMs must be a positive integer no greater than ${MAX_AGENT_TIMEOUT_MS}`,
    };
  }

  return {
    ok: true,
    data: {
      changeId: b.changeId as string,
      agentName: b.agentName as string,
      role: b.role as string | undefined,
      executionMode: b.executionMode as RunnerExecutionMode | undefined,
      prompt: b.prompt as string | undefined,
      wait: b.wait as boolean | undefined,
      timeoutMs: b.timeoutMs as number | undefined,
    },
  };
}
