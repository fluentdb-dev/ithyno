// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyFile, updateGitignore } from "../bin/init.js";

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
