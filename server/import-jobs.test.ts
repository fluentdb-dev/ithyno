// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerImportJob,
  getImportJob,
  deleteImportJob,
  importJobCount,
  _clearImportJobsForTest,
  type ImportJob,
} from "./import-jobs.js";

function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    jobId: "test-job-id",
    targetPath: "/tmp/test-project",
    startedAt: Date.now(),
    pattern: "A",
    ...overrides,
  };
}

describe("registerImportJob", () => {
  beforeEach(() => {
    _clearImportJobsForTest();
  });

  it("registers a new job and returns ok: true", () => {
    const job = makeJob({ jobId: "job-1" });
    const result = registerImportJob(job);
    expect(result.ok).toBe(true);
  });

  it("registered job can be retrieved by getImportJob", () => {
    const job = makeJob({ jobId: "job-2", targetPath: "/tmp/my-project", pattern: "B" });
    registerImportJob(job);
    const found = getImportJob("job-2");
    expect(found).toEqual(job);
  });

  it("idempotency: registering the same jobId twice returns ok: true without duplicating", () => {
    const job = makeJob({ jobId: "job-3" });
    registerImportJob(job);
    const result = registerImportJob(job);
    expect(result.ok).toBe(true);
    expect(importJobCount()).toBe(1);
  });

  it("returns 429 when cap of 20 is reached", () => {
    for (let i = 0; i < 20; i++) {
      const r = registerImportJob(makeJob({ jobId: `cap-job-${i}` }));
      expect(r.ok).toBe(true);
    }
    const overflow = registerImportJob(makeJob({ jobId: "cap-overflow" }));
    expect(overflow.ok).toBe(false);
    if (overflow.ok) return;
    expect(overflow.status).toBe(429);
    expect(overflow.reason).toMatch(/20/);
  });

  it("sweeps expired jobs on register (TTL 1 hour)", () => {
    // Manually register a job with startedAt older than 1 hour.
    const oldJob = makeJob({ jobId: "old-job", startedAt: Date.now() - 61 * 60 * 1000 });
    registerImportJob(oldJob);
    expect(importJobCount()).toBe(1);

    // Registering a new job triggers a sweep.
    registerImportJob(makeJob({ jobId: "new-job" }));
    // old-job should have been swept; only new-job remains.
    expect(getImportJob("old-job")).toBeUndefined();
    expect(getImportJob("new-job")).toBeDefined();
    expect(importJobCount()).toBe(1);
  });
});

describe("deleteImportJob", () => {
  beforeEach(() => {
    _clearImportJobsForTest();
  });

  it("removes an existing job", () => {
    registerImportJob(makeJob({ jobId: "del-1" }));
    deleteImportJob("del-1");
    expect(getImportJob("del-1")).toBeUndefined();
    expect(importJobCount()).toBe(0);
  });

  it("is a no-op when the job does not exist", () => {
    deleteImportJob("nonexistent");
    expect(importJobCount()).toBe(0);
  });
});

describe("getImportJob", () => {
  beforeEach(() => {
    _clearImportJobsForTest();
  });

  it("returns undefined for an unknown jobId", () => {
    expect(getImportJob("unknown")).toBeUndefined();
  });

  it("returns the correct pattern", () => {
    registerImportJob(makeJob({ jobId: "pat-a", pattern: "A" }));
    registerImportJob(makeJob({ jobId: "pat-b", pattern: "B" }));
    expect(getImportJob("pat-a")?.pattern).toBe("A");
    expect(getImportJob("pat-b")?.pattern).toBe("B");
  });
});

describe("importJobCount (after TTL sweep)", () => {
  beforeEach(() => {
    _clearImportJobsForTest();
  });

  it("returns 0 initially", () => {
    expect(importJobCount()).toBe(0);
  });

  it("increments after register", () => {
    registerImportJob(makeJob({ jobId: "cnt-1" }));
    expect(importJobCount()).toBe(1);
    registerImportJob(makeJob({ jobId: "cnt-2" }));
    expect(importJobCount()).toBe(2);
  });

  it("decrements after delete", () => {
    registerImportJob(makeJob({ jobId: "cnt-3" }));
    deleteImportJob("cnt-3");
    expect(importJobCount()).toBe(0);
  });
});
