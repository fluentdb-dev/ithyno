// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { AgentRegistry } from "./registry.js";
import { AgentRunner } from "./runner.js";
import { validateRunPayload } from "./run-validation.js";

const execFile = promisify(execFileCb);

describe("AgentRunner execution-root policy (Task 2.4)", () => {
  let dir: string;
  let registry: AgentRegistry;
  let runner: AgentRunner;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-runner-test-"));
    // Initialize git repository
    await execFile("git", ["init"], { cwd: dir });
    await execFile("git", ["config", "user.name", "Test"], { cwd: dir });
    await execFile("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    writeFileSync(join(dir, "file.txt"), "hello");
    await execFile("git", ["add", "file.txt"], { cwd: dir });
    await execFile("git", ["commit", "-m", "initial commit"], { cwd: dir });

    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: worker
    command: node
    args: ["-e", "console.log('ok')", "--"]
    role: code
`,
    );

    registry = new AgentRegistry(dir);
    await registry.load();
    runner = new AgentRunner(dir, registry, () => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("main-tree execution runs in project root without creating a worktree", async () => {
    const res = await runner.resolveExecutionRoot("add-feat", "main-tree");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cwd).toBe(dir);
      expect(res.branch).toBe("");
      expect(res.created).toBe(false);
    }
  });

  it("worktree execution creates a new worktree on agent/<change-id> branch", async () => {
    const res = await runner.resolveExecutionRoot("add-feat", "worktree");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cwd).toBe(join(dir, ".worktrees", "add-feat"));
      expect(res.branch).toBe("agent/add-feat");
      expect(res.created).toBe(true);
    }
  });

  it("valid existing worktree is reused rather than re-created", async () => {
    // First call creates it
    const res1 = await runner.resolveExecutionRoot("add-feat", "worktree");
    expect(res1.ok).toBe(true);

    // Second call reuses it
    const res2 = await runner.resolveExecutionRoot("add-feat", "worktree");
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.cwd).toBe(join(dir, ".worktrees", "add-feat"));
      expect(res2.created).toBe(false);
    }
  });

  it("rejects an existing worktree on a different branch", async () => {
    const worktreePath = join(dir, ".worktrees", "add-feat");
    // Manually create worktree on wrong branch name
    await execFile("git", ["worktree", "add", worktreePath, "-b", "wrong-branch"], { cwd: dir });

    const res = await runner.resolveExecutionRoot("add-feat", "worktree");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.reason).toMatch(/exists on branch 'wrong-branch'/);
    }
  });

  it("rejects an existing worktree from a different repository", async () => {
    const foreignDir = mkdtempSync(join(tmpdir(), "ithyno-foreign-repo-"));
    await execFile("git", ["init"], { cwd: foreignDir });
    await execFile("git", ["config", "user.name", "Test"], { cwd: foreignDir });
    await execFile("git", ["config", "user.email", "test@example.com"], { cwd: foreignDir });
    writeFileSync(join(foreignDir, "file.txt"), "hello");
    await execFile("git", ["add", "file.txt"], { cwd: foreignDir });
    await execFile("git", ["commit", "-m", "initial commit"], { cwd: foreignDir });

    const worktreePath = join(dir, ".worktrees", "add-feat");
    await execFile("git", ["worktree", "add", worktreePath, "-b", "agent/add-feat"], { cwd: foreignDir });

    const res = await runner.resolveExecutionRoot("add-feat", "worktree");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.reason).toMatch(/belongs to a different repository/);
    }

    rmSync(foreignDir, { recursive: true, force: true });
  });

  it("rejects starting a duplicate job for an active change", async () => {
    // Start first job
    const run1 = await runner.run("add-feat", "worker", "code", "worktree");
    expect(run1.ok).toBe(true);

    // Second run attempt on the same change is rejected with 409
    const run2 = await runner.run("add-feat", "worker", "code", "worktree");
    expect(run2.ok).toBe(false);
    if (!run2.ok) {
      expect(run2.status).toBe(409);
      expect(run2.reason).toMatch(/A job is already running for add-feat/);
    }

    if (run1.ok) runner.cancel(run1.job.id);
  });

  it("handles process failure (non-zero exit code / crashed) cleanly", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: failing-worker
    command: node
    args: ["-e", "process.exit(1)", "--"]
    role: code
`,
    );
    await registry.load();
    const run = await runner.run("add-failing", "failing-worker", "code", "worktree");
    expect(run.ok).toBe(true);
    if (run.ok) {
      const summary = await runner.waitForCompletion(run.job.id, { timeoutMs: 5000 });
      expect(summary.status).toBe("crashed");
      expect(summary.exitCode).toBe(1);
    }
  });

  it("waitForCompletion resolves completed status for normal process exit", async () => {
    const run = await runner.run("add-feat", "worker", "code", "worktree");
    expect(run.ok).toBe(true);
    if (run.ok) {
      const res = await runner.waitForCompletion(run.job.id, { timeoutMs: 5000 });
      expect(res.status).toBe("completed");
      expect(res.exitCode).toBe(0);
    }
  });

  it("waitForCompletion resolves crashed status for process error exit", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: failing-worker
    command: node
    args: ["-e", "process.exit(2)", "--"]
    role: code
`,
    );
    await registry.load();
    const run = await runner.run("add-failing", "failing-worker", "code", "worktree");
    expect(run.ok).toBe(true);
    if (run.ok) {
      const res = await runner.waitForCompletion(run.job.id, { timeoutMs: 5000 });
      expect(res.status).toBe("crashed");
      expect(res.exitCode).toBe(2);
    }
  });

  it("waitForCompletion rejects with timeout error and marks job timed-out when limit is exceeded", async () => {
    writeFileSync(
      join(dir, "agents.yaml"),
      `agents:
  - name: slow-worker
    command: node
    args: ["-e", "setTimeout(() => {}, 10000)", "--"]
    role: code
`,
    );
    await registry.load();
    const run = await runner.run("add-slow", "slow-worker", "code", "worktree");
    expect(run.ok).toBe(true);
    if (run.ok) {
      await expect(
        runner.waitForCompletion(run.job.id, { timeoutMs: 50 }),
      ).rejects.toThrow(/Execution timed out after 50ms/);

      const summary = runner.getJob(run.job.id);
      expect(summary?.status).toBe("timed-out");
    }
  });

  it.each(["review", "verify"])(
    "removes a stale review artifact before a %s worker starts",
    async (role) => {
      const root = await runner.resolveExecutionRoot("add-stale", "worktree");
      expect(root.ok).toBe(true);
      if (!root.ok) return;

      const artifact = join(
        root.cwd,
        "openspec",
        "changes",
        "add-stale",
        "review.md",
      );
      mkdirSync(join(artifact, ".."), { recursive: true });
      writeFileSync(artifact, [
        "---",
        "verdict: pass",
        "findings: []",
        "---",
        "",
        "stale",
      ].join("\n"));

      const run = await runner.run("add-stale", "worker", role, "worktree");
      expect(run.ok).toBe(true);
      if (!run.ok) return;
      await runner.waitForCompletion(run.job.id, { timeoutMs: 5000 });

      expect(existsSync(artifact)).toBe(false);
      expect(runner.getJob(run.job.id)?.verdict).toBeUndefined();
    },
  );
});

describe("API Validation rules for wait & timeoutMs (validateRunPayload)", () => {
  it("validates valid payload and rejects bad wait, timeoutMs, and missing fields", () => {
    const base = { changeId: "add-feat", agentName: "worker" };

    // Valid payloads
    expect(validateRunPayload({ ...base, wait: true, timeoutMs: 5000 }).ok).toBe(true);
    expect(validateRunPayload({ ...base, wait: false }).ok).toBe(true);

    // Invalid wait
    const badWait = validateRunPayload({ ...base, wait: "true" });
    expect(badWait.ok).toBe(false);
    if (!badWait.ok) expect(badWait.error).toMatch(/wait must be a boolean/);

    // Invalid timeoutMs
    const badTimeoutZero = validateRunPayload({ ...base, timeoutMs: 0 });
    expect(badTimeoutZero.ok).toBe(false);
    if (!badTimeoutZero.ok) expect(badTimeoutZero.error).toMatch(/timeoutMs must be a positive integer/);

    const badTimeoutNegative = validateRunPayload({ ...base, timeoutMs: -100 });
    expect(badTimeoutNegative.ok).toBe(false);
    if (!badTimeoutNegative.ok) expect(badTimeoutNegative.error).toMatch(/timeoutMs must be a positive integer/);

    const badTimeoutFloat = validateRunPayload({ ...base, timeoutMs: 1.5 });
    expect(badTimeoutFloat.ok).toBe(false);
    if (!badTimeoutFloat.ok) expect(badTimeoutFloat.error).toMatch(/timeoutMs must be a positive integer/);

    const badTimeoutString = validateRunPayload({ ...base, timeoutMs: "5000" });
    expect(badTimeoutString.ok).toBe(false);
    if (!badTimeoutString.ok) expect(badTimeoutString.error).toMatch(/timeoutMs must be a positive integer/);
  });
});
