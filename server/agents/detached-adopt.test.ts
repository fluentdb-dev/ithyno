import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "./registry.js";
import { AgentRunner } from "./runner.js";
import { detachedCommandMatches } from "./detached-runner.js";
import { writeEnvironmentSelection } from "../environment/index.js";

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

  it("adopts a detached worker that resolved project values and stripped dotenvx credentials", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ithyno-adopt-env-"));
    dirs.push(dir);
    await import("node:child_process").then(({ execFileSync }) => {
      execFileSync("git", ["init"], { cwd: dir });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
      writeFileSync(join(dir, "file.txt"), "hello");
      execFileSync("git", ["add", "file.txt"], { cwd: dir });
      execFileSync("git", ["commit", "-m", "initial commit"], { cwd: dir });
    });
    writeFileSync(join(dir, ".env"), "APP=base\n", "utf8");
    writeFileSync(join(dir, ".env.dev"), "APP=from-dev\nFEATURE=enabled\n", "utf8");
    await writeEnvironmentSelection(dir, { selectedProfile: "dev", preferences: {} });
    const previousPrivate = process.env.DOTENV_PRIVATE_KEY;
    const previousLegacy = process.env.DOTENVX_KEY;
    process.env.DOTENV_PRIVATE_KEY = "secret-private";
    process.env.DOTENVX_KEY = "secret-legacy";
    try {
      writeFileSync(join(dir, "agents.yaml"), `agents:
  - name: worker
    command: ${process.execPath}
    args: ["-e", "process.stdout.write(JSON.stringify({ APP: process.env.APP ?? 'MISSING', FEATURE: process.env.FEATURE ?? 'MISSING', hasPrivate: !!process.env.DOTENV_PRIVATE_KEY, hasLegacy: !!process.env.DOTENVX_KEY })); setTimeout(() => {}, 20000)", "--"]
    role: code
    detached: true
`);
      const registry = new AgentRegistry(dir);
      await registry.load();
      const runner = new AgentRunner(dir, registry, () => undefined);
      const run = await runner.run("add-adopted-detached", "worker", "code", "worktree");
      expect(run.ok).toBe(true);
      if (!run.ok) return;
      await new Promise((resolve) => setTimeout(resolve, 500));

      const adopted = await runnerFor(dir);
      await adopted.adoptDetached();
      const active = adopted.activeJobForChange("add-adopted-detached");
      expect(active).toMatchObject({ changeId: "add-adopted-detached", detached: true, status: "running" });
      const job = adopted.getJob(active!.id);
      const output = job?.output.map((item) => item.chunk).join("") ?? "";
      expect(output).toContain("from-dev");
      expect(output).toContain("enabled");
      expect(output).not.toContain("secret-private");
      expect(output).not.toContain("secret-legacy");
      if (job?.detachedMeta) process.kill(job.detachedMeta.pid, "SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 200));
      adopted.shutdown();
    } finally {
      if (previousPrivate === undefined) delete process.env.DOTENV_PRIVATE_KEY;
      else process.env.DOTENV_PRIVATE_KEY = previousPrivate;
      if (previousLegacy === undefined) delete process.env.DOTENVX_KEY;
      else process.env.DOTENVX_KEY = previousLegacy;
    }
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
