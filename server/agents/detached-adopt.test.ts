import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "./registry.js";
import { AgentRunner } from "./runner.js";
import { detachedCommandMatches } from "./detached-runner.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  await new Promise((resolve) => setTimeout(resolve, 100));
});

function writeMeta(worktree: string, values: Record<string, unknown>): string {
  const path = join(worktree, ".agent-meta.json");
  writeFileSync(path, JSON.stringify({
    jobId: "job-adopt",
    changeId: "add-adopt",
    agentName: "node",
    command: process.execPath,
    pid: process.pid,
    startedAt: Date.now(),
    logPath: join(worktree, ".agent.log"),
    ...values,
  }));
  return path;
}

async function runnerFor(dir: string): Promise<AgentRunner> {
  writeFileSync(join(dir, "agents.yaml"), "agents: []\n");
  const registry = new AgentRegistry(dir);
  await registry.load();
  return new AgentRunner(dir, registry, () => undefined);
}

describe("detached job adoption", () => {
  it("adopts metadata for a live pid and existing worktree", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ithyno-adopt-"));
    dirs.push(dir);
    const worktree = join(dir, ".worktrees", "add-adopt");
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, ".agent.log"), "recovered\n");
    const metaPath = writeMeta(worktree, {});
    const runner = await runnerFor(dir);

    await runner.adoptDetached();
    expect(runner.activeJobForChange("add-adopt")).toMatchObject({
      id: "job-adopt",
      detached: true,
      status: "running",
    });
    runner.shutdown();
    await rm(metaPath, { force: true });
  });

  it.each([
    ["dead pid", { pid: 99999999 }],
    ["invalid metadata", { pid: "not-a-number" }],
  ])("unlinks metadata on %s", async (_label, values) => {
    const dir = mkdtempSync(join(tmpdir(), "ithyno-adopt-invalid-"));
    dirs.push(dir);
    const worktree = join(dir, ".worktrees", "add-adopt");
    mkdirSync(worktree, { recursive: true });
    const metaPath = writeMeta(worktree, values);
    const runner = await runnerFor(dir);

    await runner.adoptDetached();
    expect(existsSync(metaPath)).toBe(false);
    expect(runner.activeJobForChange("add-adopt")).toBeNull();
  });

  it("rejects a command line that does not identify the configured agent", () => {
    expect(detachedCommandMatches({ command: "claude" }, "/usr/bin/node worker.js")).toBe(false);
    expect(detachedCommandMatches({ command: "claude" }, "/usr/local/bin/claude -p prompt")).toBe(true);
  });

  it("ignores an entry whose worktree no longer exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ithyno-adopt-missing-"));
    dirs.push(dir);
    mkdirSync(join(dir, ".worktrees"), { recursive: true });
    // A metadata file cannot survive removal of its containing worktree; a
    // broken entry is therefore represented by a non-directory worktree path.
    writeFileSync(join(dir, ".worktrees", "missing"), "stale");
    const runner = await runnerFor(dir);
    await runner.adoptDetached();
    expect(runner.listJobs()).toHaveLength(0);
  });
});
