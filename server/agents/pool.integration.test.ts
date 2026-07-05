// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { WorktreePool } from "./pool.js";
import { DEFAULT_WORKTREE_POOL } from "./registry.js";

const execFile = promisify(execFileCb);

/**
 * Pool integration tests — real git operations against a tmpfs repo.
 * Each `describe` block sets up a fresh git repo so tests do not share
 * state.
 */

let root: string;

async function initRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "pool-integration-"));
  await execFile("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execFile("git", ["config", "user.email", "t@t.io"], { cwd: dir });
  await execFile("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "seed\n");
  await execFile("git", ["add", "README.md"], { cwd: dir });
  await execFile("git", ["commit", "-q", "-m", "seed"], { cwd: dir });
  return dir;
}

beforeEach(async () => {
  root = await initRepo();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("WorktreePool", () => {
  it("first acquire creates pool-1 lazily and checks out agent branch", async () => {
    const pool = new WorktreePool(root, { ...DEFAULT_WORKTREE_POOL, max: 2 });
    pool._setDefaultBranchForTest("main");

    const leased = await pool.acquire("add-foo");
    expect(leased).not.toBeNull();
    expect(leased!.poolDir).toBe(join(root, ".worktrees", "pool-1"));
    expect(leased!.branch).toBe("agent/add-foo");
    expect(existsSync(leased!.poolDir)).toBe(true);

    // Verify the branch is actually checked out in the pool worktree.
    const { stdout } = await execFile("git", ["branch", "--show-current"], {
      cwd: leased!.poolDir,
    });
    expect(stdout.trim()).toBe("agent/add-foo");
  });

  it("concurrent acquires get distinct pool slots up to max, then null", async () => {
    const pool = new WorktreePool(root, { ...DEFAULT_WORKTREE_POOL, max: 2 });
    pool._setDefaultBranchForTest("main");

    const a = await pool.acquire("add-a");
    const b = await pool.acquire("add-b");
    const c = await pool.acquire("add-c");

    expect(a!.poolDir).toBe(join(root, ".worktrees", "pool-1"));
    expect(b!.poolDir).toBe(join(root, ".worktrees", "pool-2"));
    expect(c).toBeNull();
  });

  it("release returns the slot to free and preserves the agent branch", async () => {
    const pool = new WorktreePool(root, { ...DEFAULT_WORKTREE_POOL, max: 2 });
    pool._setDefaultBranchForTest("main");

    const leased = await pool.acquire("add-foo");
    // Simulate agent work + commit
    writeFileSync(join(leased!.poolDir, "impl.txt"), "committed\n");
    await execFile("git", ["add", "impl.txt"], { cwd: leased!.poolDir });
    await execFile("git", ["commit", "-q", "-m", "impl"], { cwd: leased!.poolDir });

    // Leave a stray untracked file
    writeFileSync(join(leased!.poolDir, "stray.txt"), "untracked\n");

    await pool.release(leased!.poolDir);

    // Untracked file is gone
    expect(existsSync(join(leased!.poolDir, "stray.txt"))).toBe(false);

    // Agent branch still exists with its commit
    const { stdout: branchList } = await execFile("git", ["branch", "--list", "agent/add-foo"], {
      cwd: root,
    });
    expect(branchList).toContain("agent/add-foo");

    // Worktree is on detached HEAD now
    const { stdout: currentBranch } = await execFile("git", ["branch", "--show-current"], {
      cwd: leased!.poolDir,
    });
    expect(currentBranch.trim()).toBe("");

    // Next acquire reuses pool-1 (not pool-2)
    const next = await pool.acquire("add-bar");
    expect(next!.poolDir).toBe(join(root, ".worktrees", "pool-1"));
  });

  it("reuses an existing agent branch when it has prior commits", async () => {
    const pool = new WorktreePool(root, { ...DEFAULT_WORKTREE_POOL, max: 2 });
    pool._setDefaultBranchForTest("main");

    // Create + commit on the branch, then delete the worktree via release
    const first = await pool.acquire("add-foo");
    writeFileSync(join(first!.poolDir, "impl.txt"), "first attempt\n");
    await execFile("git", ["add", "impl.txt"], { cwd: first!.poolDir });
    await execFile("git", ["commit", "-q", "-m", "first attempt"], {
      cwd: first!.poolDir,
    });
    await pool.release(first!.poolDir);

    // Re-acquire the same change — should reuse the branch and see the commit
    const second = await pool.acquire("add-foo");
    expect(second!.poolDir).toBe(first!.poolDir); // same slot, reused
    const { stdout: log } = await execFile("git", ["log", "--oneline"], {
      cwd: second!.poolDir,
    });
    expect(log).toContain("first attempt");
  });

  it("adoptExisting distinguishes leased (agent branch checked out) from free (detached)", async () => {
    // First pool: acquire two, release one → one leased (pool-1), one free (pool-2)
    const first = new WorktreePool(root, { ...DEFAULT_WORKTREE_POOL, max: 2 });
    first._setDefaultBranchForTest("main");
    await first.acquire("add-a"); // pool-1 leased on agent/add-a
    const b = await first.acquire("add-b"); // pool-2 leased on agent/add-b
    await first.release(b!.poolDir); // pool-2 now free (detached)

    // New pool instance simulates a server restart
    const second = new WorktreePool(root, { ...DEFAULT_WORKTREE_POOL, max: 2 });
    second._setDefaultBranchForTest("main");
    const adopted = await second.adoptExisting();

    expect(adopted).toEqual([{ poolDir: join(root, ".worktrees", "pool-1"), changeId: "add-a" }]);
    const snap = second.snapshot();
    expect(snap.find((s) => s.name === "pool-1")?.status).toBe("leased");
    expect(snap.find((s) => s.name === "pool-2")?.status).toBe("free");
  });

  it("same change already checked out elsewhere makes acquire fail (branch straddling refusal)", async () => {
    // Simulate a dedicated worktree already holding agent/foo
    const dedicatedPath = join(root, ".worktrees", "foo");
    await execFile("git", ["worktree", "add", dedicatedPath, "-b", "agent/foo"], {
      cwd: root,
    });

    const pool = new WorktreePool(root, { ...DEFAULT_WORKTREE_POOL, max: 2 });
    pool._setDefaultBranchForTest("main");

    await expect(pool.acquire("foo")).rejects.toBeTruthy();

    // No dangling pool-1 should remain
    expect(existsSync(join(root, ".worktrees", "pool-1"))).toBe(false);
  });

  it("default-branch resolution falls back to main when symbolic-ref is unset", async () => {
    // Fresh repo with no remote → `git symbolic-ref refs/remotes/origin/HEAD` fails
    // Fallback should locate `main`.
    const pool = new WorktreePool(root, { ...DEFAULT_WORKTREE_POOL, max: 1 });
    // NOT calling _setDefaultBranchForTest — let it resolve for real
    const leased = await pool.acquire("add-foo");
    await pool.release(leased!.poolDir);

    // Verify the release detached at main
    const { stdout } = await execFile("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
      cwd: leased!.poolDir,
    }).catch(() => ({ stdout: "" }));
    // detached — symbolic-ref -q returns empty
    expect(stdout).toBe("");

    // Confirm the commit reached is main's tip
    const { stdout: mainSha } = await execFile("git", ["rev-parse", "main"], { cwd: root });
    const { stdout: headSha } = await execFile("git", ["rev-parse", "HEAD"], {
      cwd: leased!.poolDir,
    });
    expect(headSha.trim()).toBe(mainSha.trim());
  });
});
