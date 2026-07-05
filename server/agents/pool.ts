// SPDX-License-Identifier: GPL-3.0-or-later
import { execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { WorktreePoolConfig } from "./registry.js";

const execFile = promisify(execFileCb);

/**
 * Bounded pool of reusable git worktrees under `.worktrees/<prefix>-N/`.
 * Landed by add-worktree-pool. Phase 1 semantics:
 *
 * - Opt-in per-agent via `dedicated: false` in agents.yaml.
 * - `acquire()` returns a leased pool worktree with `agent/<change-id>`
 *   checked out (branch reused if it exists, created if not), or `null`
 *   when all `max` slots are leased.
 * - `release()` runs `git-clean` cleanup (`git reset --hard`, `git clean
 *   -fd`, `git checkout --detach <default-branch>`), preserving the
 *   `agent/<change-id>` branch for the normal merge flow.
 * - `adoptExisting()` scans for pool directories on startup: a leased
 *   worktree is inferred from the checked-out branch name; a detached-
 *   HEAD worktree is registered as free.
 * - Cleanup failures quarantine the affected slot; subsequent acquires
 *   skip it.
 * - Default-branch resolution is cached for the pool's lifetime — tried
 *   in order: `git symbolic-ref refs/remotes/origin/HEAD` → `main` →
 *   `master`.
 *
 * Not implemented in Phase 1 (dispatcher's territory): queueing on
 * exhaustion, `idleReleaseAfter` reaper, `reset-to-main` / `recreate`
 * cleanup modes.
 */

type SlotStatus = "free" | "leased" | "quarantined";

type Slot = {
  path: string;
  status: SlotStatus;
  changeId?: string;
};

export type PoolSlotSnapshot = {
  name: string;
  path: string;
  status: SlotStatus;
  changeId?: string;
};

export class WorktreePool {
  private slots = new Map<string, Slot>();
  private defaultBranchCached: string | null = null;

  constructor(
    private readonly projectRoot: string,
    private readonly config: WorktreePoolConfig,
  ) {}

  private slotName(n: number): string {
    return `${this.config.namePrefix}-${n}`;
  }

  private slotPath(name: string): string {
    return join(this.projectRoot, ".worktrees", name);
  }

  private async resolveDefaultBranch(): Promise<string> {
    if (this.defaultBranchCached) return this.defaultBranchCached;
    try {
      const { stdout } = await execFile(
        "git",
        ["symbolic-ref", "refs/remotes/origin/HEAD"],
        { cwd: this.projectRoot },
      );
      const name = stdout.trim().replace(/^refs\/remotes\/origin\//, "");
      if (name) {
        this.defaultBranchCached = name;
        return name;
      }
    } catch {
      // symbolic-ref not set — fall through to hardcoded fallbacks.
    }
    for (const candidate of ["main", "master"]) {
      try {
        await execFile("git", ["rev-parse", "--verify", candidate], {
          cwd: this.projectRoot,
        });
        this.defaultBranchCached = candidate;
        return candidate;
      } catch {
        // try next
      }
    }
    throw new Error(
      "worktree pool: cannot resolve default branch (tried refs/remotes/origin/HEAD, main, master)",
    );
  }

  private async checkoutBranchForChange(
    poolDir: string,
    changeId: string,
  ): Promise<void> {
    const branch = `agent/${changeId}`;
    let branchExists = false;
    try {
      await execFile("git", ["rev-parse", "--verify", branch], {
        cwd: poolDir,
      });
      branchExists = true;
    } catch {
      branchExists = false;
    }
    if (branchExists) {
      // Reuse the existing branch. If it's already checked out in another
      // worktree (dedicated or another pool slot), git refuses; we
      // propagate that error verbatim to the caller.
      await execFile("git", ["checkout", branch], { cwd: poolDir });
    } else {
      await execFile("git", ["checkout", "-b", branch], { cwd: poolDir });
    }
  }

  /**
   * Lease a pool worktree for the given change. Returns null when all
   * `max` slots are leased. Throws on git failures (branch straddling,
   * failed worktree creation) — the caller surfaces the error.
   */
  async acquire(
    changeId: string,
  ): Promise<{ poolDir: string; branch: string } | null> {
    // 1. Reuse a free existing slot.
    for (const [, slot] of this.slots) {
      if (slot.status !== "free") continue;
      await this.checkoutBranchForChange(slot.path, changeId);
      slot.status = "leased";
      slot.changeId = changeId;
      return { poolDir: slot.path, branch: `agent/${changeId}` };
    }

    // 2. Lazy-create the next slot if we're under the cap.
    if (this.slots.size >= this.config.max) return null;

    let n = 1;
    while (this.slots.has(this.slotName(n))) n++;
    const name = this.slotName(n);
    const path = this.slotPath(name);

    await execFile(
      "git",
      ["worktree", "add", path, "--detach"],
      { cwd: this.projectRoot },
    );

    try {
      await this.checkoutBranchForChange(path, changeId);
    } catch (err) {
      // Newly created worktree could not check out the desired branch —
      // remove it so we don't leave a dangling slot on disk.
      try {
        await execFile("git", ["worktree", "remove", "--force", path], {
          cwd: this.projectRoot,
        });
      } catch {
        // Best-effort cleanup; ignore.
      }
      throw err;
    }

    this.slots.set(name, { path, status: "leased", changeId });
    return { poolDir: path, branch: `agent/${changeId}` };
  }

  /**
   * Return a leased worktree to the pool: git-clean, detach HEAD at the
   * resolved default branch. Leaves `agent/<change-id>` intact for the
   * normal merge flow. On failure, quarantines the slot.
   */
  async release(poolDir: string): Promise<void> {
    const entry = [...this.slots.entries()].find(([, s]) => s.path === poolDir);
    if (!entry) return;
    const [, slot] = entry;
    if (slot.status !== "leased") return;

    try {
      await execFile("git", ["reset", "--hard"], { cwd: poolDir });
      await execFile("git", ["clean", "-fd"], { cwd: poolDir });
      const defaultBranch = await this.resolveDefaultBranch();
      await execFile("git", ["checkout", "--detach", defaultBranch], {
        cwd: poolDir,
      });
      slot.status = "free";
      slot.changeId = undefined;
    } catch (err) {
      console.error(
        `[pool] release failed for ${poolDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
      slot.status = "quarantined";
      slot.changeId = undefined;
    }
  }

  /**
   * Scan `.worktrees/<prefix>-*` on startup: leased or free per branch
   * state. Returns the list of (poolDir, changeId) for adopted orphan
   * jobs so the runner can register them alongside dedicated-worktree
   * orphans.
   */
  async adoptExisting(): Promise<Array<{ poolDir: string; changeId: string }>> {
    const worktreesDir = join(this.projectRoot, ".worktrees");
    if (!existsSync(worktreesDir)) return [];

    const entries = await readdir(worktreesDir, { withFileTypes: true });
    const adopted: Array<{ poolDir: string; changeId: string }> = [];
    const prefix = `${this.config.namePrefix}-`;

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (!ent.name.startsWith(prefix)) continue;
      const path = join(worktreesDir, ent.name);
      try {
        const { stdout } = await execFile("git", ["branch", "--show-current"], {
          cwd: path,
        });
        const currentBranch = stdout.trim();
        if (currentBranch.startsWith("agent/")) {
          const changeId = currentBranch.substring("agent/".length);
          this.slots.set(ent.name, { path, status: "leased", changeId });
          adopted.push({ poolDir: path, changeId });
        } else {
          // Detached HEAD (empty output) or an unexpected branch — treat
          // as free.
          this.slots.set(ent.name, { path, status: "free" });
        }
      } catch (err) {
        console.warn(
          `[pool] failed to inspect ${path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return adopted;
  }

  /** Introspection: current slot table. Used by tests + future UI. */
  snapshot(): PoolSlotSnapshot[] {
    return [...this.slots.entries()].map(([name, slot]) => ({
      name,
      path: slot.path,
      status: slot.status,
      changeId: slot.changeId,
    }));
  }

  /** Escape hatch for tests to inject a resolved default branch, bypassing
   *  the git-symbolic-ref probe. Not called by production code. */
  _setDefaultBranchForTest(name: string): void {
    this.defaultBranchCached = name;
  }
}
