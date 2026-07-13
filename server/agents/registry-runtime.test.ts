// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "./registry.js";

/**
 * Tests for add-runtime-abstraction: the `runtimes:` section, runtime-backed
 * agents (`runtime + prompt`), and the mutual-exclusion validation with the
 * legacy `command + args` shape.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-registry-runtime-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function loadWith(yamlSource: string): Promise<AgentRegistry> {
  writeFileSync(join(dir, "agents.yaml"), yamlSource);
  const reg = new AgentRegistry(dir);
  await reg.load();
  return reg;
}

// Helper: build agents.yaml text with a runtimes block + a single agent.
function yamlWith({
  runtimes,
  agents,
}: {
  runtimes?: string;
  agents: string;
}): string {
  return `${runtimes ?? ""}\nagents:\n${agents}`;
}

describe("runtimes section", () => {
  it("parses a valid runtime entry", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  claude:
    command: claude
    baseArgs: [--dangerously-skip-permissions]
    promptStyle: cli-arg
    promptFlag: -p
    supports:
      interactive: true
      artifactOutput: true
      diff: git
`,
        agents: `  - name: any
    command: echo
    args: []
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.runtimes.claude).toBeDefined();
    expect(cfg.runtimes.claude.command).toBe("claude");
    expect(cfg.runtimes.claude.baseArgs).toEqual(["--dangerously-skip-permissions"]);
    expect(cfg.runtimes.claude.promptStyle).toBe("cli-arg");
    expect(cfg.runtimes.claude.promptFlag).toBe("-p");
    expect(cfg.runtimes.claude.supports).toEqual({
      interactive: true,
      artifactOutput: true,
      diff: "git",
    });
  });

  it("rejects unknown promptStyle", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  broken:
    command: x
    promptStyle: elsewhere
    supports: { interactive: false, artifactOutput: false, diff: none }
`,
        agents: `  - name: any
    command: echo
    args: []
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/runtimes\.broken\.promptStyle/);
  });

  it("rejects unknown supports.diff", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  broken:
    command: x
    promptStyle: cli-arg
    supports: { interactive: false, artifactOutput: false, diff: unknown }
`,
        agents: `  - name: any
    command: echo
    args: []
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/runtimes\.broken\.supports\.diff/);
  });

  it("rejects missing command in runtime", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  broken:
    promptStyle: cli-arg
    supports: { interactive: false, artifactOutput: false, diff: none }
`,
        agents: `  - name: any
    command: echo
    args: []
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/runtimes\.broken\.command/);
  });

  it("rejects unknown keys inside a runtime entry", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  broken:
    command: x
    promptStyle: cli-arg
    supports: { interactive: false, artifactOutput: false, diff: none }
    typo: 1
`,
        agents: `  - name: any
    command: echo
    args: []
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/runtimes\.broken\.typo/);
  });

  it("accepts an agents.yaml with no runtimes: section", async () => {
    const reg = await loadWith(
      `agents:
  - name: claude
    command: claude
    args: []
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    expect(cfg.runtimes).toEqual({});
  });
});

describe("runtime-backed agent validation", () => {
  it("accepts runtime + prompt shape", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  claude:
    command: claude
    baseArgs: []
    promptStyle: cli-arg
    supports: { interactive: true, artifactOutput: true, diff: git }
`,
        agents: `  - name: claude-impl
    runtime: claude
    prompt: /opsx:apply \${change_id}
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    const a = cfg.agents.find((x) => x.name === "claude-impl");
    expect(a).toBeDefined();
    expect(a!.runtime).toBe("claude");
    expect(a!.prompt).toBe("/opsx:apply ${change_id}");
  });

  it("accepts runtime + local command override (post reshape: runtime is optional shared defaults)", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  claude:
    command: claude
    promptStyle: cli-arg
    supports: { interactive: true, artifactOutput: true, diff: git }
`,
        agents: `  - name: mixed
    runtime: claude
    command: aider
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    const a = cfg.agents.find((x) => x.name === "mixed")!;
    expect(a.command).toBe("aider");
    expect(a.runtime).toBe("claude");
  });

  it("accepts runtime + local args override", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  claude:
    command: claude
    promptStyle: cli-arg
    supports: { interactive: true, artifactOutput: true, diff: git }
`,
        agents: `  - name: mixed
    runtime: claude
    args: [x]
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
    const a = cfg.agents.find((x) => x.name === "mixed")!;
    expect(a.args).toEqual(["x"]);
  });

  it("accepts runtime without prompt (falls back to runtime.prompts → built-in)", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  claude:
    command: claude
    promptStyle: cli-arg
    supports: { interactive: true, artifactOutput: true, diff: git }
`,
        agents: `  - name: bare
    runtime: claude
`,
      }),
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(true);
  });

  it("rejects legacy prompt without runtime (bare 'prompt' has no shape to fold into)", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    prompt: /opsx:apply
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    // No command AND no runtime — must declare either.
    expect(cfg.error).toMatch(/must declare either/);
  });

  it("rejects an agent with neither shape", async () => {
    const reg = await loadWith(
      `agents:
  - name: bad
    role: apply
`,
    );
    const cfg = reg.publicConfig();
    expect(cfg.ok).toBe(false);
    expect(cfg.error).toMatch(/must declare either/);
  });
});

describe("resolve — legacy backward compat", () => {
  it("resolve returns command + args identically for legacy agents", async () => {
    const reg = await loadWith(
      `agents:
  - name: claude
    command: claude
    args: ["--dangerously-skip-permissions", "-p", "/opsx:apply \${change_id}"]
`,
    );
    const def = reg.find("claude");
    expect(def).not.toBeNull();
    const r = reg.resolve(def!, {
      change_id: "add-foo",
      worktree_path: "/w/add-foo",
      branch: "agent/add-foo",
    });
    expect(r.command).toBe("claude");
    expect(r.args).toEqual(["--dangerously-skip-permissions", "-p", "/opsx:apply add-foo"]);
  });
});

describe("resolve — runtime-backed", () => {
  async function claudeRuntimeRegistry(): Promise<AgentRegistry> {
    return loadWith(
      yamlWith({
        runtimes: `runtimes:
  claude:
    command: claude
    baseArgs: [--dangerously-skip-permissions]
    promptStyle: cli-arg
    promptFlag: -p
    supports: { interactive: true, artifactOutput: true, diff: git }
  aider:
    command: aider
    baseArgs: [--yes-always, --no-auto-commit]
    promptStyle: cli-arg
    promptFlag: --message
    supports: { interactive: false, artifactOutput: true, diff: aider-native }
  copilot:
    command: gh
    baseArgs: [copilot, suggest]
    promptStyle: stdin
    supports: { interactive: false, artifactOutput: false, diff: none }
`,
        agents: `  - name: claude-impl
    runtime: claude
    prompt: /opsx:apply \${change_id}
  - name: aider-impl
    runtime: aider
    prompt: Implement tasks in openspec/changes/\${change_id}/tasks.md
  - name: copilot-impl
    runtime: copilot
    prompt: Review \${change_id}
`,
      }),
    );
  }

  it("cli-arg + promptFlag: baseArgs, flag, prompt", async () => {
    const reg = await claudeRuntimeRegistry();
    const def = reg.find("claude-impl")!;
    const r = reg.resolve(def, { change_id: "add-foo", worktree_path: "/w", branch: "b" });
    expect(r.command).toBe("claude");
    expect(r.args).toEqual(["--dangerously-skip-permissions", "-p", "/opsx:apply add-foo"]);
    expect(r.initialInput).toBeUndefined();
  });

  it("cli-arg + promptFlag for aider", async () => {
    const reg = await claudeRuntimeRegistry();
    const def = reg.find("aider-impl")!;
    const r = reg.resolve(def, { change_id: "add-bar", worktree_path: "/w", branch: "b" });
    expect(r.command).toBe("aider");
    expect(r.args).toEqual([
      "--yes-always",
      "--no-auto-commit",
      "--message",
      "Implement tasks in openspec/changes/add-bar/tasks.md",
    ]);
  });

  it("cli-arg without promptFlag: baseArgs then prompt directly", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  gemini:
    command: gemini
    baseArgs: [--tool, code]
    promptStyle: cli-arg
    supports: { interactive: false, artifactOutput: true, diff: git }
`,
        agents: `  - name: gem-impl
    runtime: gemini
    prompt: build \${change_id}
`,
      }),
    );
    const def = reg.find("gem-impl")!;
    const r = reg.resolve(def, { change_id: "add-x", worktree_path: "/w", branch: "b" });
    expect(r.command).toBe("gemini");
    expect(r.args).toEqual(["--tool", "code", "build add-x"]);
  });

  it("stdin: baseArgs only, prompt in initialInput", async () => {
    const reg = await claudeRuntimeRegistry();
    const def = reg.find("copilot-impl")!;
    const r = reg.resolve(def, { change_id: "add-baz", worktree_path: "/w", branch: "b" });
    expect(r.command).toBe("gh");
    expect(r.args).toEqual(["copilot", "suggest"]);
    expect(r.initialInput).toBe("Review add-baz");
  });

  // Obsoleted by reshape-agents-yaml-mode-roles: `initialInput` and
  // `prompt` are both folded into the `prompts.<role>` map at load time,
  // with `prompt` winning when both are set. Users should specify
  // `prompts` directly instead. The old "initialInput wins" behavior no
  // longer applies.
  it.skip("stdin: explicit initialInput wins over prompt (obsolete)", async () => {});

  it("template substitution inside baseArgs and prompt", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  sh:
    command: sh
    baseArgs: [-c]
    promptStyle: cli-arg
    supports: { interactive: false, artifactOutput: false, diff: none }
`,
        agents: `  - name: sh-agent
    runtime: sh
    prompt: echo \${change_id} in \${worktree_path} on \${branch}
`,
      }),
    );
    const def = reg.find("sh-agent")!;
    const r = reg.resolve(def, {
      change_id: "add-tmpl",
      worktree_path: "/w/pool-1",
      branch: "agent/add-tmpl",
    });
    expect(r.args).toEqual(["-c", "echo add-tmpl in /w/pool-1 on agent/add-tmpl"]);
  });

  it("throws when runtime name is unknown", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  known:
    command: known-cmd
    promptStyle: cli-arg
    supports: { interactive: true, artifactOutput: true, diff: git }
`,
        agents: `  - name: mysterious
    runtime: nowhere
    prompt: /x
`,
      }),
    );
    const def = reg.find("mysterious")!;
    expect(() =>
      reg.resolve(def, { change_id: "c", worktree_path: "/w", branch: "b" }),
    ).toThrow(/unknown runtime 'nowhere'/);
  });

  it("throws when promptStyle: file is used", async () => {
    const reg = await loadWith(
      yamlWith({
        runtimes: `runtimes:
  future:
    command: futuristic
    promptStyle: file
    supports: { interactive: false, artifactOutput: true, diff: git }
`,
        agents: `  - name: future-agent
    runtime: future
    prompt: hello
`,
      }),
    );
    const def = reg.find("future-agent")!;
    expect(() =>
      reg.resolve(def, { change_id: "c", worktree_path: "/w", branch: "b" }),
    ).toThrow(/not yet supported/);
  });
});
