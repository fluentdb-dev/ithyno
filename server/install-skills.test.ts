// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIG_HOME = process.env.HOME;
const ORIG_USERPROFILE = process.env.USERPROFILE;
const ORIG_BUNDLE = process.env.ITHYNO_BUNDLED_SKILLS;

async function seedBundle(bundleRoot: string): Promise<void> {
  await mkdir(join(bundleRoot, "commands", "ithy-opsx"), { recursive: true });
  await writeFile(join(bundleRoot, "commands", "ithy-opsx", "apply.md"), "# apply\n", "utf8");
  await writeFile(join(bundleRoot, "commands", "ithy-opsx", "review.md"), "# review\n", "utf8");
  await mkdir(join(bundleRoot, "skills", "ithy-opsx-apply"), { recursive: true });
  await writeFile(join(bundleRoot, "skills", "ithy-opsx-apply", "SKILL.md"), "# skill\n", "utf8");
  await mkdir(join(bundleRoot, "skills", "ithy-opsx-apply", "sub"), { recursive: true });
  await writeFile(
    join(bundleRoot, "skills", "ithy-opsx-apply", "sub", "helper.md"),
    "# helper\n",
    "utf8",
  );
  // Non-ithy-opsx sibling MUST NOT be picked up.
  await mkdir(join(bundleRoot, "skills", "openspec-flow"), { recursive: true });
  await writeFile(join(bundleRoot, "skills", "openspec-flow", "SKILL.md"), "unrelated\n", "utf8");
  await writeFile(
    join(bundleRoot, "..", "package.json"),
    JSON.stringify({ name: "ithyno", version: "9.9.9-test" }),
    "utf8",
  );
}

describe("install-skills", () => {
  let workRoot: string;
  let bundleRoot: string;
  let userClaudeRoot: string;

  beforeEach(async () => {
    workRoot = await mkdtemp(join(tmpdir(), "ithy-opsx-install-test-"));
    const pkgDir = join(workRoot, "pkg");
    await mkdir(pkgDir, { recursive: true });
    bundleRoot = join(pkgDir, ".claude");
    await mkdir(bundleRoot, { recursive: true });
    await seedBundle(bundleRoot);
    userClaudeRoot = join(workRoot, "user-home");
    await mkdir(userClaudeRoot, { recursive: true });

    process.env.ITHYNO_BUNDLED_SKILLS = bundleRoot;
    process.env.HOME = userClaudeRoot;
    process.env.USERPROFILE = userClaudeRoot;
  });

  afterEach(async () => {
    process.env.HOME = ORIG_HOME;
    process.env.USERPROFILE = ORIG_USERPROFILE;
    process.env.ITHYNO_BUNDLED_SKILLS = ORIG_BUNDLE;
    if (ORIG_HOME === undefined) delete process.env.HOME;
    if (ORIG_USERPROFILE === undefined) delete process.env.USERPROFILE;
    if (ORIG_BUNDLE === undefined) delete process.env.ITHYNO_BUNDLED_SKILLS;
    await rm(workRoot, { recursive: true, force: true });
  });

  it("resolveBundledSkillsRoot honors ITHYNO_BUNDLED_SKILLS", async () => {
    const mod = await import("./install-skills.js");
    expect(mod.resolveBundledSkillsRoot()).toBe(bundleRoot);
  });

  it("resolveUserClaudeRoot returns $HOME/.claude", async () => {
    const mod = await import("./install-skills.js");
    expect(mod.resolveUserClaudeRoot()).toBe(join(userClaudeRoot, ".claude"));
  });

  it("fresh install copies every bundled ithy-opsx file", async () => {
    const { installIthyOpsxSkills } = await import("./install-skills.js");
    const rep = await installIthyOpsxSkills();
    expect(rep.errors).toEqual([]);
    // 2 commands + SKILL.md + sub/helper.md = 4
    expect(rep.installed).toBe(4);
    const claudeDir = join(userClaudeRoot, ".claude");
    expect(existsSync(join(claudeDir, "commands", "ithy-opsx", "apply.md"))).toBe(true);
    expect(existsSync(join(claudeDir, "commands", "ithy-opsx", "review.md"))).toBe(true);
    expect(existsSync(join(claudeDir, "skills", "ithy-opsx-apply", "SKILL.md"))).toBe(true);
    expect(existsSync(join(claudeDir, "skills", "ithy-opsx-apply", "sub", "helper.md"))).toBe(true);
    // Non-ithy-opsx sibling NOT copied.
    expect(existsSync(join(claudeDir, "skills", "openspec-flow"))).toBe(false);
    expect(existsSync(join(claudeDir, ".ithyno-install-manifest.json"))).toBe(true);
    const manifest = JSON.parse(
      await readFile(join(claudeDir, ".ithyno-install-manifest.json"), "utf8"),
    );
    expect(manifest.installedVersion).toBe("9.9.9-test");
    expect(manifest.files).toHaveLength(4);
  });

  it("second install at same version is a no-op", async () => {
    const { installIthyOpsxSkills } = await import("./install-skills.js");
    await installIthyOpsxSkills();
    const rep = await installIthyOpsxSkills();
    expect(rep.installed).toBe(0);
    expect(rep.updated).toBe(0);
    expect(rep.errors).toEqual([]);
  });

  it("version bump overwrites unmodified files", async () => {
    const { installIthyOpsxSkills } = await import("./install-skills.js");
    await installIthyOpsxSkills();
    await writeFile(
      join(bundleRoot, "..", "package.json"),
      JSON.stringify({ name: "ithyno", version: "10.0.0-test" }),
      "utf8",
    );
    await writeFile(join(bundleRoot, "commands", "ithy-opsx", "apply.md"), "# apply v2\n", "utf8");
    const rep = await installIthyOpsxSkills();
    expect(rep.errors).toEqual([]);
    expect(rep.updated).toBeGreaterThanOrEqual(1);
    const updated = await readFile(
      join(userClaudeRoot, ".claude", "commands", "ithy-opsx", "apply.md"),
      "utf8",
    );
    expect(updated).toBe("# apply v2\n");
  });

  it("user-modified file is preserved on version bump", async () => {
    const { installIthyOpsxSkills } = await import("./install-skills.js");
    await installIthyOpsxSkills();
    const target = join(userClaudeRoot, ".claude", "commands", "ithy-opsx", "apply.md");
    await writeFile(target, "# my custom edits\n", "utf8");
    await writeFile(
      join(bundleRoot, "..", "package.json"),
      JSON.stringify({ name: "ithyno", version: "10.0.0-test" }),
      "utf8",
    );
    await writeFile(join(bundleRoot, "commands", "ithy-opsx", "apply.md"), "# apply v2\n", "utf8");
    const rep = await installIthyOpsxSkills();
    expect(rep.userModified).toBeGreaterThanOrEqual(1);
    const after = await readFile(target, "utf8");
    expect(after).toBe("# my custom edits\n");
    const manifest = JSON.parse(
      await readFile(join(userClaudeRoot, ".claude", ".ithyno-install-manifest.json"), "utf8"),
    );
    const applyEntry = manifest.files.find(
      (e: { path: string }) => e.path === "commands/ithy-opsx/apply.md",
    );
    expect(applyEntry?.status).toBe("user-modified");
  });

  it("cleanup removes files dropped from newer bundle", async () => {
    const { installIthyOpsxSkills } = await import("./install-skills.js");
    await installIthyOpsxSkills();
    expect(
      existsSync(join(userClaudeRoot, ".claude", "commands", "ithy-opsx", "review.md")),
    ).toBe(true);
    await rm(join(bundleRoot, "commands", "ithy-opsx", "review.md"));
    await writeFile(
      join(bundleRoot, "..", "package.json"),
      JSON.stringify({ name: "ithyno", version: "10.0.0-test" }),
      "utf8",
    );
    const rep = await installIthyOpsxSkills();
    expect(rep.removed).toBeGreaterThanOrEqual(1);
    expect(
      existsSync(join(userClaudeRoot, ".claude", "commands", "ithy-opsx", "review.md")),
    ).toBe(false);
  });

  it("uninstall removes every installed file + manifest", async () => {
    const { installIthyOpsxSkills, uninstallIthyOpsxSkills } = await import(
      "./install-skills.js"
    );
    await installIthyOpsxSkills();
    const rep = await uninstallIthyOpsxSkills();
    expect(rep.errors).toEqual([]);
    expect(rep.removed).toBe(4);
    const claudeDir = join(userClaudeRoot, ".claude");
    expect(existsSync(join(claudeDir, "commands", "ithy-opsx"))).toBe(false);
    expect(existsSync(join(claudeDir, "skills", "ithy-opsx-apply"))).toBe(false);
    expect(existsSync(join(claudeDir, ".ithyno-install-manifest.json"))).toBe(false);
  });

  it("uninstall is idempotent", async () => {
    const { installIthyOpsxSkills, uninstallIthyOpsxSkills } = await import(
      "./install-skills.js"
    );
    await installIthyOpsxSkills();
    await uninstallIthyOpsxSkills();
    const rep = await uninstallIthyOpsxSkills();
    expect(rep.removed).toBe(0);
    expect(rep.alreadyGone).toBe(0);
    expect(rep.errors).toEqual([]);
  });

  it("uninstall preserves unrelated files under ~/.claude", async () => {
    const { installIthyOpsxSkills, uninstallIthyOpsxSkills } = await import(
      "./install-skills.js"
    );
    await installIthyOpsxSkills();
    const agmsg = join(userClaudeRoot, ".claude", "commands", "agmsg.md");
    await writeFile(agmsg, "# agmsg\n", "utf8");
    await uninstallIthyOpsxSkills();
    expect(existsSync(agmsg)).toBe(true);
  });

  it("checkIthyOpsxInstall reports installed after fresh install", async () => {
    const { installIthyOpsxSkills, checkIthyOpsxInstall } = await import(
      "./install-skills.js"
    );
    await installIthyOpsxSkills();
    const rep = await checkIthyOpsxInstall();
    expect(rep.installed).toBe(true);
    expect(rep.installedVersion).toBe("9.9.9-test");
    expect(rep.bundledVersion).toBe("9.9.9-test");
    expect(rep.commandCount).toBe(2);
    expect(rep.skillCount).toBe(1);
    expect(rep.userModifiedFiles).toEqual([]);
    expect(rep.installError).toBeNull();
  });

  it("checkIthyOpsxInstall reports not-installed before install", async () => {
    const { checkIthyOpsxInstall } = await import("./install-skills.js");
    const rep = await checkIthyOpsxInstall();
    expect(rep.installed).toBe(false);
    expect(rep.installedVersion).toBeNull();
    expect(rep.commandCount).toBe(2);
    expect(rep.skillCount).toBe(1);
  });
});
