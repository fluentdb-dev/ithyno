// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyFile, updateGitignore, runInit } from "../bin/init.js";
import { resolveManagerFromDoctor, writeAgentsYaml } from "./init-handler.js";
import type { DoctorReport } from "./doctor.js";

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

describe("updateGitignore — append-only-if-missing (both .worktrees/ and .ithyno/)", () => {
  it("returns 'created' and writes both lines when .gitignore does not exist", async () => {
    const result = await updateGitignore(dir);
    expect(result).toBe("created");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      ".worktrees/\n.ithyno/\n",
    );
  });

  it("returns 'appended' and adds both when .gitignore exists with neither", async () => {
    await writeFile(join(dir, ".gitignore"), "node_modules/\n");
    const result = await updateGitignore(dir);
    expect(result).toBe("appended");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.worktrees/\n.ithyno/\n",
    );
  });

  it("appends only .ithyno/ when .worktrees/ is already present", async () => {
    await writeFile(join(dir, ".gitignore"), "node_modules/\n.worktrees/\n");
    const result = await updateGitignore(dir);
    expect(result).toBe("appended");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.worktrees/\n.ithyno/\n",
    );
  });

  it("appends only .worktrees/ when .ithyno/ is already present", async () => {
    await writeFile(join(dir, ".gitignore"), "node_modules/\n.ithyno/\n");
    const result = await updateGitignore(dir);
    expect(result).toBe("appended");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.ithyno/\n.worktrees/\n",
    );
  });

  it("returns 'already-present' when both lines exist and file is untouched", async () => {
    await writeFile(
      join(dir, ".gitignore"),
      "node_modules/\n.worktrees/\n.ithyno/\n",
    );
    const result = await updateGitignore(dir);
    expect(result).toBe("already-present");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.worktrees/\n.ithyno/\n",
    );
  });

  it("appends a newline first when the existing file lacks a trailing newline", async () => {
    await writeFile(join(dir, ".gitignore"), "node_modules/");
    const result = await updateGitignore(dir);
    expect(result).toBe("appended");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.worktrees/\n.ithyno/\n",
    );
  });

  it("returns 'skipped' and does not touch the file when disabled", async () => {
    await writeFile(join(dir, ".gitignore"), "keep me\n");
    const result = await updateGitignore(dir, { disabled: true });
    expect(result).toBe("skipped");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe("keep me\n");
  });

  it("ends up with exactly one .worktrees/ and one .ithyno/ line regardless of how many times init runs (idempotence)", async () => {
    for (let i = 0; i < 5; i++) {
      await updateGitignore(dir);
    }
    const raw = await readFile(join(dir, ".gitignore"), "utf8");
    const worktrees = raw.split(/\r?\n/).filter((l) => l.trim() === ".worktrees/").length;
    const ithyno = raw.split(/\r?\n/).filter((l) => l.trim() === ".ithyno/").length;
    expect(worktrees).toBe(1);
    expect(ithyno).toBe(1);
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

describe("ithy-opsx template drift guard", () => {
  // distribute-ithy-opsx-via-init-templates: the ithy-opsx surface
  // ships via Init (templates/.claude/…), and this repo's own
  // .claude/ copy IS the dev-copy that the templates mirror.
  // Byte-identity between the two prevents drift landing in a PR
  // that only edits one side. On failure, the message names the
  // specific pair so the fix is one grep away.
  const repoRoot = process.cwd();

  async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    async function inner(cur: string) {
      for (const ent of await readdir(cur, { withFileTypes: true })) {
        const p = join(cur, ent.name);
        if (ent.isDirectory()) await inner(p);
        else if (ent.isFile()) out.push(p);
      }
    }
    await inner(dir);
    return out.sort();
  }

  it("every .claude/commands/ithy-opsx/*.md file is byte-identical to templates/.claude/commands/ithy-opsx/*.md", async () => {
    const devDir = join(repoRoot, ".claude/commands/ithy-opsx");
    const tmplDir = join(repoRoot, "templates/.claude/commands/ithy-opsx");
    const files = await walk(devDir);
    expect(files.length).toBeGreaterThan(0);
    for (const dev of files) {
      const rel = dev.slice(devDir.length + 1);
      const tmpl = join(tmplDir, rel);
      const [devBuf, tmplBuf] = await Promise.all([
        readFile(dev),
        readFile(tmpl).catch((e) => {
          throw new Error(
            `template missing for ${rel} (expected at templates/.claude/commands/ithy-opsx/${rel}): ${(e as Error).message}`,
          );
        }),
      ]);
      if (!devBuf.equals(tmplBuf)) {
        throw new Error(
          `drift: .claude/commands/ithy-opsx/${rel} differs from templates/.claude/commands/ithy-opsx/${rel}`,
        );
      }
    }
  });

  it("every .claude/skills/ithy-opsx-*/** file is byte-identical to templates/.claude/skills/ithy-opsx-*/**", async () => {
    const devSkillsRoot = join(repoRoot, ".claude/skills");
    const tmplSkillsRoot = join(repoRoot, "templates/.claude/skills");
    const skills = (
      await readdir(devSkillsRoot, { withFileTypes: true })
    ).filter((e) => e.isDirectory() && e.name.startsWith("ithy-opsx-"));
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      const devDir = join(devSkillsRoot, skill.name);
      const tmplDir = join(tmplSkillsRoot, skill.name);
      const files = await walk(devDir);
      for (const dev of files) {
        const rel = dev.slice(devDir.length + 1);
        const tmpl = join(tmplDir, rel);
        const [devBuf, tmplBuf] = await Promise.all([
          readFile(dev),
          readFile(tmpl).catch((e) => {
            throw new Error(
              `template missing for ${skill.name}/${rel} (expected at templates/.claude/skills/${skill.name}/${rel}): ${(e as Error).message}`,
            );
          }),
        ]);
        if (!devBuf.equals(tmplBuf)) {
          throw new Error(
            `drift: .claude/skills/${skill.name}/${rel} differs from templates/.claude/skills/${skill.name}/${rel}`,
          );
        }
      }
    }
  });
});

// ---- expand-init-to-scaffold-agents: doctor gate + agents.yaml write -------

/** Minimal DoctorReport fixture with only claude installed. */
function makeReport(overrides: Partial<Record<string, boolean>> = {}): DoctorReport {
  const defaultInstalled: Record<string, boolean> = {
    claude: true,
    codex: false,
    agy: false,
    copilot: false,
    gemini: false,
    opencode: false,
    cursor: false,
    ...overrides,
  };
  return {
    readyForManager: Object.values(defaultInstalled).some(Boolean),
    agents: Object.fromEntries(
      Object.entries(defaultInstalled).map(([k, v]) => [k, { installed: v }]),
    ) as DoctorReport["agents"],
    tmux: { installed: false },
    agmsg: { installed: false },
    checkedAt: new Date().toISOString(),
  };
}

describe("resolveManagerFromDoctor (expand-init-to-scaffold-agents)", () => {
  it("409 when readyForManager is false (no CLI installed)", () => {
    const report = makeReport({ claude: false });
    const result = resolveManagerFromDoctor(report, {});
    expect(result.ok).toBe(false);
    if (!result.ok && result.status === 409) {
      expect(result.hint).toContain("Settings > Prerequisites");
    }
  });

  it("400 when requested manager.command is not installed", () => {
    const report = makeReport({ claude: true, codex: false });
    const result = resolveManagerFromDoctor(report, { managerCommand: "codex" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      if ("installed" in result) {
        expect(result.installed).toContain("claude");
        expect(result.installed).not.toContain("codex");
      }
    }
  });

  it("200: picks priority default when manager omitted (claude before codex)", () => {
    const report = makeReport({ claude: true, codex: true });
    const result = resolveManagerFromDoctor(report, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chosenCli).toBe("claude");
    }
  });

  it("200: picks codex when claude is not installed and codex is", () => {
    const report = makeReport({ claude: false, codex: true });
    const result = resolveManagerFromDoctor(report, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chosenCli).toBe("codex");
    }
  });

  it("200: respects explicit manager.command when installed", () => {
    const report = makeReport({ claude: true, codex: true });
    const result = resolveManagerFromDoctor(report, { managerCommand: "codex" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chosenCli).toBe("codex");
    }
  });

  it("200: respects defaultManager when installed and no explicit command", () => {
    const report = makeReport({ claude: true, codex: true });
    const result = resolveManagerFromDoctor(report, { defaultManager: "codex" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chosenCli).toBe("codex");
    }
  });

  it("200: ignores defaultManager when it is not installed; falls back to priority order", () => {
    const report = makeReport({ claude: true, codex: false });
    const result = resolveManagerFromDoctor(report, { defaultManager: "codex" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chosenCli).toBe("claude");
    }
  });
});

describe("writeAgentsYaml (expand-init-to-scaffold-agents)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ithyno-agents-yaml-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes agents.yaml with {{MANAGER_COMMAND}} substituted", async () => {
    const pkgRoot = process.cwd();
    await writeAgentsYaml(dir, "claude", pkgRoot);
    const content = await readFile(join(dir, "agents.yaml"), "utf8");
    expect(content).toContain("command: claude");
    expect(content).not.toContain("{{MANAGER_COMMAND}}");
  });

  it("rolls back openspec/ when write fails due to bad path", async () => {
    // Create a fake openspec/ directory to simulate the post-runInit state.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, "openspec"), { recursive: true });

    // Use a pkgRoot that has no templates/ to trigger a read failure.
    const badPkgRoot = join(dir, "nonexistent-pkg");
    await expect(writeAgentsYaml(dir, "claude", badPkgRoot)).rejects.toThrow();

    // openspec/ should have been removed (rollback).
    expect(existsSync(join(dir, "openspec"))).toBe(false);
  });
});

describe("runInit + writeAgentsYaml integration (expand-init-to-scaffold-agents)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ithyno-init-agents-"));
    await execFile("git", ["init"], { cwd: dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("agents.yaml is written at <projectRoot>/agents.yaml with the correct command", async () => {
    const initResult = await runInit({ targetDir: dir, quiet: true });
    expect(initResult.ok).toBe(true);

    const pkgRoot = process.cwd();
    await writeAgentsYaml(dir, "claude", pkgRoot);

    const agentsYaml = await readFile(join(dir, "agents.yaml"), "utf8");
    expect(agentsYaml).toContain("command: claude");
    expect(agentsYaml).toContain("roles: [manager]");
    expect(agentsYaml).toContain("mode: live-shell");
  });
});
