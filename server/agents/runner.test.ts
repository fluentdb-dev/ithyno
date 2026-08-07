// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { AgentRegistry } from "./registry.js";
import { AgentRunner } from "./runner.js";

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
    args: ["-e", "console.log('ok')"]
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
});
