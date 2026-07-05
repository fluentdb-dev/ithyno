// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGitStatus } from "./status.js";
import { readGitConfig, writeLocalConfig } from "./config.js";
import { gitInit } from "./init.js";

/**
 * End-to-end tests that hit the real `git` binary against a tmp directory.
 * They exercise the full status → init → config → status cycle. Skipped
 * automatically if `git` is not available on PATH.
 */

let root: string;

async function hasGit(): Promise<boolean> {
  try {
    const { promisify } = await import("node:util");
    const { execFile } = await import("node:child_process");
    await promisify(execFile)("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

const gitAvailable = await hasGit();
const d = gitAvailable ? describe : describe.skip;

d("server/git integration", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "opsx-git-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports not-a-repo on a fresh tmp dir", async () => {
    const status = await getGitStatus(root);
    expect(status.isRepo).toBe(false);
  });

  it("initializes a repo and flips isRepo", async () => {
    const before = await getGitStatus(root);
    expect(before.isRepo).toBe(false);

    const after = await gitInit(root);
    expect(after.isRepo).toBe(true);
    if (after.isRepo) {
      expect(after.root).toBeTypeOf("string");
    }
  });

  it("is a no-op on an already-initialized repo", async () => {
    await gitInit(root);
    const again = await gitInit(root);
    expect(again.isRepo).toBe(true);
  });

  it("writes and reads local user.name / user.email", async () => {
    await gitInit(root);
    await writeLocalConfig(root, { userName: "Ada Lovelace", userEmail: "ada@example.com" });
    const cfg = await readGitConfig(root);
    expect(cfg.local.userName).toBe("Ada Lovelace");
    expect(cfg.local.userEmail).toBe("ada@example.com");
    expect(cfg.effective.userName).toBe("Ada Lovelace");
    expect(cfg.effective.userEmail).toBe("ada@example.com");
  });

  it("unsets a local field when written with empty string", async () => {
    await gitInit(root);
    await writeLocalConfig(root, { userName: "Ada", userEmail: "ada@example.com" });
    await writeLocalConfig(root, { userName: "" });
    const cfg = await readGitConfig(root);
    expect(cfg.local.userName).toBeUndefined();
    expect(cfg.local.userEmail).toBe("ada@example.com");
  });

  it("returns empty local when nothing is set locally", async () => {
    await gitInit(root);
    const cfg = await readGitConfig(root);
    // effective may or may not be populated from global; local is definitely empty
    expect(cfg.local.userName).toBeUndefined();
    expect(cfg.local.userEmail).toBeUndefined();
  });

  it("idempotent unset does not throw", async () => {
    await gitInit(root);
    await expect(writeLocalConfig(root, { userName: "" })).resolves.not.toThrow();
  });

  it("survives a subdir cwd (rev-parse walks up)", async () => {
    await gitInit(root);
    const sub = join(root, "nested");
    await mkdir(sub);
    const status = await getGitStatus(sub);
    expect(status.isRepo).toBe(true);
  });
});
