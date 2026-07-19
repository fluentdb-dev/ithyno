// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyFile, updateGitignore, runInit } from "../bin/init.js";

const execFile = promisify(execFileCb);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ithyno-init-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("copyFile — file-action policy", () => {
  it("returns 'create' when the destination did not exist", async () => {
    const src = join(dir, "src.txt");
    const dest = join(dir, "sub", "dest.txt");
    await writeFile(src, "hello");
    const action = await copyFile({ srcAbs: src, destAbs: dest, force: false });
    expect(action).toBe("create");
    expect(await readFile(dest, "utf8")).toBe("hello");
  });

  it("returns 'skip' when the destination exists and force is false", async () => {
    const src = join(dir, "src.txt");
    const dest = join(dir, "dest.txt");
    await writeFile(src, "new");
    await writeFile(dest, "existing");
    const action = await copyFile({ srcAbs: src, destAbs: dest, force: false });
    expect(action).toBe("skip");
    expect(await readFile(dest, "utf8")).toBe("existing");
  });

  it("returns 'overwrite' when the destination exists and force is true", async () => {
    const src = join(dir, "src.txt");
    const dest = join(dir, "dest.txt");
    await writeFile(src, "new");
    await writeFile(dest, "existing");
    const action = await copyFile({ srcAbs: src, destAbs: dest, force: true });
    expect(action).toBe("overwrite");
    expect(await readFile(dest, "utf8")).toBe("new");
  });
});

describe("updateGitignore — append-only-if-missing", () => {
  it("returns 'created' and writes the line when .gitignore does not exist", async () => {
    const result = await updateGitignore(dir);
    expect(result).toBe("created");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(".worktrees/\n");
  });

  it("returns 'appended' and adds one line when .gitignore exists without it", async () => {
    await writeFile(join(dir, ".gitignore"), "node_modules/\n");
    const result = await updateGitignore(dir);
    expect(result).toBe("appended");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.worktrees/\n",
    );
  });

  it("returns 'already-present' and does NOT duplicate the line when .gitignore already has it", async () => {
    await writeFile(join(dir, ".gitignore"), "node_modules/\n.worktrees/\n");
    const result = await updateGitignore(dir);
    expect(result).toBe("already-present");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.worktrees/\n",
    );
  });

  it("appends a newline first when the existing file lacks a trailing newline", async () => {
    await writeFile(join(dir, ".gitignore"), "node_modules/");
    const result = await updateGitignore(dir);
    expect(result).toBe("appended");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.worktrees/\n",
    );
  });

  it("returns 'skipped' and does not touch the file when disabled", async () => {
    await writeFile(join(dir, ".gitignore"), "keep me\n");
    const result = await updateGitignore(dir, { disabled: true });
    expect(result).toBe("skipped");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe("keep me\n");
  });

  it("ends up with exactly one .worktrees/ line regardless of how many times init runs (task 8.5)", async () => {
    for (let i = 0; i < 5; i++) {
      await updateGitignore(dir);
    }
    const raw = await readFile(join(dir, ".gitignore"), "utf8");
    const occurrences = raw.split(/\r?\n/).filter((l) => l.trim() === ".worktrees/").length;
    expect(occurrences).toBe(1);
  });
});

describe("runInit — autoCreateDir + autoGitInit (add-init-http-endpoint)", () => {
  it("autoCreateDir: true creates the missing target dir recursively before scaffolding", async () => {
    const nested = join(dir, "nested", "child");
    const res = await runInit({
      targetDir: nested,
      autoCreateDir: true,
      autoGitInit: true,
      quiet: true,
    });
    expect(res.ok).toBe(true);
    expect((await stat(nested)).isDirectory()).toBe(true);
    expect(res.gitInitPerformed).toBe(true);
  });

  it("autoCreateDir: false (default) refuses a missing target with exitCode 2", async () => {
    const nested = join(dir, "missing");
    const res = await runInit({ targetDir: nested, quiet: true });
    expect(res.ok).toBe(false);
    expect(res.exitCode).toBe(2);
    expect(res.reason).toContain("Target directory does not exist");
    expect(existsSync(nested)).toBe(false);
  });

  it("autoGitInit: true runs git init in a non-git dir and reports gitInitPerformed", async () => {
    // dir exists (mkdtemp) but is NOT a git repo.
    expect(existsSync(join(dir, ".git"))).toBe(false);
    const res = await runInit({
      targetDir: dir,
      autoGitInit: true,
      quiet: true,
    });
    expect(res.ok).toBe(true);
    expect(res.gitInitPerformed).toBe(true);
    expect(existsSync(join(dir, ".git"))).toBe(true);
  });

  it("autoGitInit: false (default) refuses non-git dir with exitCode 2 and gitInitPerformed absent", async () => {
    const res = await runInit({ targetDir: dir, quiet: true });
    expect(res.ok).toBe(false);
    expect(res.exitCode).toBe(2);
    expect(res.reason).toContain("not a git repository");
    // Directory still not a git repo.
    expect(existsSync(join(dir, ".git"))).toBe(false);
  });

  it("existing git repo does not trigger autoGitInit — gitInitPerformed is false", async () => {
    await execFile("git", ["init"], { cwd: dir });
    const res = await runInit({
      targetDir: dir,
      autoGitInit: true,
      quiet: true,
    });
    expect(res.ok).toBe(true);
    expect(res.gitInitPerformed).toBe(false);
  });
});

describe("template drift guard", () => {
  // The two skill files SHALL be byte-identical except for the
  // frontmatter `description:` line, which intentionally names
  // "ithyno" in the in-repo copy vs. a generic phrasing in the
  // template. Any other drift is a bug — update templates/ when
  // you edit the in-repo skill.
  it("templates/.claude/skills/openspec-flow/SKILL.md matches the in-repo copy (excluding the description line)", async () => {
    const templated = await readFile(
      join(process.cwd(), "templates/.claude/skills/openspec-flow/SKILL.md"),
      "utf8",
    );
    const inRepo = await readFile(
      join(process.cwd(), ".claude/skills/openspec-flow/SKILL.md"),
      "utf8",
    );
    const strip = (s: string) =>
      s.split(/\r?\n/).filter((l) => !l.startsWith("description:")).join("\n");
    expect(strip(templated)).toBe(strip(inRepo));
  });
});
