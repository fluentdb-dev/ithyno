// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for server/agent-skills.ts
 * (add-settings-agent-skill-installer)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CLI_ADAPTERS,
  inspectAgentSkills,
  isInstallLocked,
  lockKey,
  _test_exports,
} from "./agent-skills.js";

// ---------------------------------------------------------------------------
// CLI adapter table
// ---------------------------------------------------------------------------

describe("CLI_ADAPTERS (add-settings-agent-skill-installer)", () => {
  it("contains all expected doctor CLI keys", () => {
    const keys = Object.keys(CLI_ADAPTERS);
    expect(keys).toContain("claude");
    expect(keys).toContain("codex");
    expect(keys).toContain("agy");
    expect(keys).toContain("copilot");
    expect(keys).toContain("gemini");
    expect(keys).toContain("opencode");
    expect(keys).toContain("cursor");
  });

  it("copilot maps to github-copilot openspecTool", () => {
    expect(CLI_ADAPTERS["copilot"].openspecTool).toBe("github-copilot");
  });

  it("agy maps to antigravity openspecTool and rendererCli", () => {
    expect(CLI_ADAPTERS["agy"].openspecTool).toBe("antigravity");
    expect(CLI_ADAPTERS["agy"].rendererCli).toBe("antigravity");
  });

  it("codex has codexHome set", () => {
    expect(CLI_ADAPTERS["codex"].codexHome).toBeTruthy();
  });

  it("every adapter has at least one openspecPath", () => {
    for (const [_cli, adapter] of Object.entries(CLI_ADAPTERS)) {
      expect(adapter.openspecPaths.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-project lock helpers
// ---------------------------------------------------------------------------

describe("install lock (add-settings-agent-skill-installer)", () => {
  it("lockKey is stable", () => {
    expect(lockKey("/project", "claude")).toBe("/project\x00claude");
    expect(lockKey("/project", "agy")).toBe("/project\x00agy");
  });

  it("isInstallLocked returns false initially", () => {
    expect(isInstallLocked("/nonexistent", "claude")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inspectAgentSkills — state classification
// ---------------------------------------------------------------------------

describe("inspectAgentSkills (add-settings-agent-skill-installer)", () => {
  let tmpDir: string;
  let fakeSourcesDir: string;
  const mockInstalledClis = {
    claude: { installed: true },
    codex: { installed: true },
    agy: { installed: true },
    copilot: { installed: true },
    gemini: { installed: true },
    opencode: { installed: true },
    cursor: { installed: true },
  };

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ithyno-test-"));
    // Create a fake empty sourcesDir so discoverSkillSourcesDetailed returns no sources
    fakeSourcesDir = join(tmpDir, "skills");
    await mkdir(fakeSourcesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns one entry per supported CLI", async () => {
    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const clis = results.map((r) => r.cli);
    expect(clis).toContain("claude");
    expect(clis).toContain("codex");
    expect(clis).toContain("agy");
    expect(clis).toContain("copilot");
    expect(clis).toContain("gemini");
    expect(clis).toContain("opencode");
    expect(clis).toContain("cursor");
  });

  it("reports missing when openspec paths do not exist", async () => {
    const { CLI_LAYOUTS } = await import("./agent-skills.js");
    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const claude = results.find((r) => r.cli === "claude");
    expect(claude?.openspec.status).toBe("missing");
    expect(claude?.openspec.diagnostics.length).toBeGreaterThan(0);
    expect(claude?.openspec.paths).toEqual(CLI_LAYOUTS["claude"][0].required);
  });

  it("reports installed when all openspec paths exist", async () => {
    // Create the claude openspec path
    const { CLI_LAYOUTS } = await import("./agent-skills.js");
    const claudePaths = CLI_LAYOUTS["claude"][0].required;
    for (const p of claudePaths) {
      const abs = join(tmpDir, p);
      await mkdir(join(abs, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
      // handle both file and directory targets
      try {
        await writeFile(abs, "# placeholder");
      } catch {
        await mkdir(abs, { recursive: true });
      }
    }
    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const claude = results.find((r) => r.cli === "claude");
    expect(claude?.openspec.status).toBe("installed");
    expect(claude?.openspec.diagnostics.length).toBe(0);
  });

  it("reports partial when only some openspec paths exist", async () => {
    const { CLI_LAYOUTS } = await import("./agent-skills.js");
    const claudePaths = CLI_LAYOUTS["claude"][0].required;
    expect(claudePaths.length).toBe(2);

    // Create only the first path
    const p0 = claudePaths[0];
    const abs = join(tmpDir, p0);
    await mkdir(join(abs, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
    await writeFile(abs, "# partial placeholder");

    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const claude = results.find((r) => r.cli === "claude");
    expect(claude?.openspec.status).toBe("partial");
    expect(claude?.openspec.diagnostics[0]).toContain("Partial installation detected");
    expect(claude?.openspec.paths).toEqual(claudePaths);
  });

  it("inspectedAt is a valid ISO timestamp", async () => {
    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    for (const r of results) {
      expect(new Date(r.inspectedAt).getTime()).toBeGreaterThan(0);
    }
  });

  it("reports missing/unsupported ithyno when skills dir is empty", async () => {
    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    // With empty skills dir, all ithyno states should be "unsupported" or "missing"
    for (const r of results) {
      expect(["unsupported", "missing"]).toContain(r.ithyno.status);
      expect(r.ithyno.paths).toBeDefined();
    }
  });

  it("reports unsupported for all components when the CLI itself is not installed", async () => {
    const uninstalled = {
      ...mockInstalledClis,
      opencode: { installed: false },
    };
    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, uninstalled);
    const opencode = results.find((r) => r.cli === "opencode");
    expect(opencode?.openspec.status).toBe("unsupported");
    expect(opencode?.ithyno.status).toBe("unsupported");
    expect(opencode?.openspec.diagnostics).toContain("CLI not installed");
  });

  it("reports project/global Claude ithyno definition collisions without modifying them", async () => {
    const projectCommand = join(tmpDir, ".claude/commands/ithy-opsx/dispatch.md");
    const fakeHome = join(tmpDir, "home");
    const globalCommand = join(fakeHome, ".claude/commands/ithy-opsx/dispatch.md");
    await mkdir(join(projectCommand, ".."), { recursive: true });
    await mkdir(join(globalCommand, ".."), { recursive: true });
    await writeFile(projectCommand, "project definition");
    await writeFile(globalCommand, "stale global definition");

    const results = await inspectAgentSkills(
      tmpDir,
      fakeSourcesDir,
      mockInstalledClis,
      fakeHome,
    );
    const claude = results.find((r) => r.cli === "claude");
    expect(claude?.ithyno.status).toBe("conflict");
    expect(claude?.ithyno.diagnostics.join("\n")).toContain(globalCommand);
    expect(await readFile(globalCommand, "utf8")).toBe("stale global definition");
  });

  it("translates Claude commands to Codex prompt format correctly for inspection expectations", async () => {
    const { codexPromptContent } = await import("./skill-renderer/migrate-codex.js");
    const rawClaude = "---\ndescription: Test\n---\n/opsx:apply change-1";
    const expected = codexPromptContent(rawClaude, "test");
    expect(expected).toContain("openspec-apply-change change-1");
  });

  it("includes Codex review and verify worker Skills in ithyno inspection", async () => {
    const { codexPromptContent, codexWorkerSkillFromCommand } = await import("./skill-renderer/migrate-codex.js");
    const commandsDir = join(tmpDir, ".claude", "commands", "ithy-opsx");
    await mkdir(commandsDir, { recursive: true });

    for (const command of ["review", "verify"]) {
      const raw = `---\ndescription: ${command} a change\n---\n\n# ${command}\n`;
      await writeFile(join(commandsDir, `${command}.md`), raw);
      const prompt = join(tmpDir, ".codex", "prompts", `ithy-opsx-${command}.md`);
      await mkdir(join(prompt, ".."), { recursive: true });
      await writeFile(prompt, codexPromptContent(raw, command));
      const skill = join(tmpDir, ".codex", "skills", `ithy-opsx-${command}`, "SKILL.md");
      await mkdir(join(skill, ".."), { recursive: true });
      await writeFile(skill, codexWorkerSkillFromCommand(raw, command));
    }

    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const codex = results.find((result) => result.cli === "codex");
    expect(codex?.ithyno.status).toBe("installed");
    expect(codex?.ithyno.paths).toContain(".codex/prompts/ithy-opsx-review.md");
    expect(codex?.ithyno.paths).toContain(".codex/skills/ithy-opsx-review/SKILL.md");
    expect(codex?.ithyno.paths).toContain(".codex/skills/ithy-opsx-verify/SKILL.md");

    await rm(join(tmpDir, ".codex", "prompts", "ithy-opsx-review.md"));
    const missingPromptResults = await inspectAgentSkills(
      tmpDir,
      fakeSourcesDir,
      mockInstalledClis,
    );
    const missingPromptCodex = missingPromptResults.find((result) => result.cli === "codex");
    expect(missingPromptCodex?.ithyno.status).toBe("partial");
    expect(missingPromptCodex?.ithyno.diagnostics.join("\n"))
      .toContain(".codex/prompts/ithy-opsx-review.md");
  });

  it("reports installed for Codex when .openspec-target is 'codex' and Codex skills exist", async () => {
    // Write marker file
    const targetFile = join(tmpDir, ".agents/skills/.openspec-target");
    await mkdir(join(targetFile, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
    await writeFile(targetFile, "codex");

    // Write required skills files
    const { CLI_LAYOUTS } = await import("./agent-skills.js");
    const codexSkills = CLI_LAYOUTS["codex"][0].required;
    for (const p of codexSkills) {
      const abs = join(tmpDir, p);
      await mkdir(join(abs, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
      await writeFile(abs, "# placeholder");
    }

    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const codex = results.find((r) => r.cli === "codex");
    expect(codex?.openspec.status).toBe("installed");
  });

  it("does NOT report installed for Codex when .openspec-target is not 'codex'", async () => {
    // Write marker file with wrong value
    const targetFile = join(tmpDir, ".agents/skills/.openspec-target");
    await mkdir(join(targetFile, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
    await writeFile(targetFile, "agents"); // not "codex"

    // Write required skills files
    const { CLI_LAYOUTS } = await import("./agent-skills.js");
    const codexSkills = CLI_LAYOUTS["codex"][0].required;
    for (const p of codexSkills) {
      const abs = join(tmpDir, p);
      await mkdir(join(abs, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
      await writeFile(abs, "# placeholder");
    }

    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const codex = results.find((r) => r.cli === "codex");
    expect(codex?.openspec.status).not.toBe("installed");
  });

  it("reports installed for Agy and missing for Codex when only Agy legacy workflows exist", async () => {
    const { CLI_LAYOUTS } = await import("./agent-skills.js");
    const agyWorkflows = CLI_LAYOUTS["agy"][1].required; // legacy-workflows
    for (const p of agyWorkflows) {
      const abs = join(tmpDir, p);
      await mkdir(join(abs, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
      await writeFile(abs, "# placeholder");
    }

    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const agy = results.find((r) => r.cli === "agy");
    const codex = results.find((r) => r.cli === "codex");
    expect(agy?.openspec.status).toBe("installed");
    expect(codex?.openspec.status).toBe("missing");
  });

  it("reports installed for Codex when only legacy Codex prompts exist", async () => {
    const { CLI_LAYOUTS } = await import("./agent-skills.js");
    const legacyPrompts = CLI_LAYOUTS["codex"][1].required; // legacy-prompts
    for (const p of legacyPrompts) {
      const abs = join(tmpDir, p);
      await mkdir(join(abs, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
      await writeFile(abs, "# placeholder");
    }

    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const codex = results.find((r) => r.cli === "codex");
    expect(codex?.openspec.status).toBe("installed");
  });

  it("reports partial for Codex when one file exists in skills-v1 and one in legacy-prompts", async () => {
    const { CLI_LAYOUTS } = await import("./agent-skills.js");
    
    // One file from skills-v1
    const p1 = CLI_LAYOUTS["codex"][0].required[0];
    const abs1 = join(tmpDir, p1);
    await mkdir(join(abs1, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
    await writeFile(abs1, "# placeholder");

    // One file from legacy-prompts
    const p2 = CLI_LAYOUTS["codex"][1].required[0];
    const abs2 = join(tmpDir, p2);
    await mkdir(join(abs2, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
    await writeFile(abs2, "# placeholder");

    // Fail the marker check for skills-v1
    const targetFile = join(tmpDir, ".agents/skills/.openspec-target");
    await mkdir(join(targetFile, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
    await writeFile(targetFile, "agents");

    const results = await inspectAgentSkills(tmpDir, fakeSourcesDir, mockInstalledClis);
    const codex = results.find((r) => r.cli === "codex");
    expect(codex?.openspec.status).toBe("partial");
  });

  it("does NOT report component success for OpenSpec when post-install verification check fails", async () => {
    const { installAgentSkills } = await import("./agent-skills.js");
    
    const mockChild = {
      stdout: {
        setEncoding: () => {},
        on: () => {},
      },
      stderr: {
        setEncoding: () => {},
        on: () => {},
      },
      on: (event: string, cb: Function) => {
        if (event === "close") {
          setTimeout(() => cb(0), 10);
        }
      },
    };
    const spawnSpy = vi.spyOn(_test_exports, "spawn").mockReturnValue(mockChild as any);

    try {
      const progressEvents: any[] = [];
      const res = await installAgentSkills(
        "codex",
        ["openspec"],
        tmpDir,
        fakeSourcesDir,
        (event, data) => {
          progressEvents.push({ event, data });
        }
      );

      expect(res.result).toBe("failed");
      expect(res.openspec?.status).toBe("failed");
      expect(res.openspec?.error).toContain("OpenSpec verification failed");

      const compResultEvent = progressEvents.find(e => e.event === "component-result");
      expect(compResultEvent?.data.status).toBe("failed");
      expect(compResultEvent?.data.error).toContain("OpenSpec verification failed");
    } finally {
      spawnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Project-boundary enforcement (unit-level)
// ---------------------------------------------------------------------------

describe("project boundary (add-settings-agent-skill-installer)", () => {
  it("CLI_ADAPTERS contains no absolute paths in openspecPaths", () => {
    for (const [_cli, adapter] of Object.entries(CLI_ADAPTERS)) {
      for (const p of adapter.openspecPaths) {
        // All paths must be relative (start with ".", not "/")
        expect(p.startsWith("/")).toBe(false);
        expect(p.startsWith("~")).toBe(false);
      }
    }
  });

  it("codexHome is a relative path", () => {
    const adapter = CLI_ADAPTERS["codex"];
    if (adapter.codexHome) {
      expect(adapter.codexHome.startsWith("/")).toBe(false);
    }
  });
});
