// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Import job registry — bounded in-memory Map (max 20) of active import jobs.
 *
 * Per-job record: { jobId, targetPath, startedAt, pattern }
 * TTL 1 hour; sweep on register.
 * 429 when concurrent cap is exceeded.
 *
 * Landed by enable-import-both-patterns.
 */

export type ImportPattern = "A" | "B";

export type ImportJob = {
  jobId: string;
  targetPath: string;
  startedAt: number; // epoch ms
  pattern: ImportPattern;
};

/** Maximum concurrent import jobs in flight. */
const MAX_JOBS = 20;
/** TTL in ms (1 hour). */
const JOB_TTL_MS = 60 * 60 * 1000;

const registry = new Map<string, ImportJob>();

/** Remove all jobs whose startedAt is older than JOB_TTL_MS. */
function sweepExpired(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of registry) {
    if (job.startedAt < cutoff) {
      registry.delete(id);
    }
  }
}

/**
 * Register a new import job.
 *
 * Sweeps expired entries first, then enforces the 20-concurrent cap.
 * Returns `{ ok: true }` on success, `{ ok: false, status: 429, reason }` when
 * the cap is exceeded.
 */
export function registerImportJob(
  job: ImportJob,
): { ok: true } | { ok: false; status: 429; reason: string } {
  sweepExpired();

  // Idempotency: if the same jobId is already registered, no-op.
  if (registry.has(job.jobId)) {
    return { ok: true };
  }

  if (registry.size >= MAX_JOBS) {
    return {
      ok: false,
      status: 429,
      reason: `Import concurrency cap reached: ${registry.size}/${MAX_JOBS} jobs already in flight. Wait for one to complete before dispatching another.`,
    };
  }

  registry.set(job.jobId, job);
  return { ok: true };
}

/** Retrieve an import job by jobId. Returns undefined when not found. */
export function getImportJob(jobId: string): ImportJob | undefined {
  return registry.get(jobId);
}

/** Remove an import job by jobId. No-op when not found. */
export function deleteImportJob(jobId: string): void {
  registry.delete(jobId);
}

/** Exposed for tests. Returns the current registry size (after no sweep). */
export function importJobCount(): number {
  return registry.size;
}

/** Exposed for tests — clears all entries. */
export function _clearImportJobsForTest(): void {
  registry.clear();
}
