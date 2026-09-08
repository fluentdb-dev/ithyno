// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOperationalStore } from "./store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("hub operational store", () => {
  it("rejects startup when a single-writer lock is already held", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-store-"));
    tempDirs.push(dir);
    const lockFile = join(dir, "operations.lock");
    await (await import("node:fs/promises")).writeFile(lockFile, "locked");

    const store = createOperationalStore(dir);
    await expect(store.initialize()).rejects.toThrow(/single-writer lock already held/);
  });

  it("releases expired leases and advances retry attempts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-store-"));
    tempDirs.push(dir);
    const store = createOperationalStore(dir);
    await store.initialize();
    await store.createJob("job-1", "issue", "group/project", "Issue", "https://gitlab.example.com/group/project/-/issues/1");
    await store.claimJob("job-1", "hub-processor", Date.now() - 1000);
    const recovered = await store.recoverExpiredLeases(Date.now());
    expect(recovered).toEqual(["job-1"]);
    const readyJobs = await store.listReadyJobs(Date.now(), 10);
    expect(readyJobs).toHaveLength(1);
    expect(readyJobs[0]?.status).toBe("queued");
    await store.markJobRetry("job-1", 1, Date.now() + 1000);
    const retried = await store.listReadyJobs(Date.now() + 2000, 10);
    expect(retried[0]?.attempts).toBe(1);
    await store.close();
  });
});
