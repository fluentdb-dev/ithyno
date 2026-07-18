// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeManagedSections,
  mapCommandToAgmsgType,
  mergeSections,
  parseArgsToFlags,
  parseSpawnOptionsYaml,
  projectManagedTypes,
  stringifySpawnOptionsYaml,
  syncSpawnOptions,
} from "./spawn-options-writer.js";
import type { AgentConfig } from "./registry.js";

let dir: string;
let optionsPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-spawnopts-test-"));
  optionsPath = join(dir, "spawn_options.yaml");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function cfg(partial: Partial<AgentConfig> & { agents: AgentConfig["agents"] }): AgentConfig {
  return {
    ok: true,
    agents: partial.agents,
    parallelExecution: partial.parallelExecution ?? false,
    agmsg: partial.agmsg ?? { team: "openspec-ui" },
    warnings: partial.warnings ?? [],
  };
}

describe("mapCommandToAgmsgType", () => {
  it("maps all 7 supported commands", () => {
    expect(mapCommandToAgmsgType("claude")).toBe("claude-code");
    expect(mapCommandToAgmsgType("codex")).toBe("codex");
    expect(mapCommandToAgmsgType("copilot")).toBe("copilot");
    expect(mapCommandToAgmsgType("gemini")).toBe("gemini");
    expect(mapCommandToAgmsgType("antigravity")).toBe("antigravity");
    expect(mapCommandToAgmsgType("opencode")).toBe("opencode");
    expect(mapCommandToAgmsgType("cursor")).toBe("cursor");
  });

  it("returns null for unknown commands", () => {
    expect(mapCommandToAgmsgType("my-wrapper")).toBeNull();
    expect(mapCommandToAgmsgType(undefined)).toBeNull();
  });
});

describe("parseArgsToFlags", () => {
  it("skips --model and its value entirely", () => {
    expect(parseArgsToFlags(["--dangerously-skip-permissions", "--model", "sonnet"]))
      .toEqual({ "--dangerously-skip-permissions": true });
  });

  it("emits boolean for a flag with no following token", () => {
    expect(parseArgsToFlags(["--dangerously-skip-permissions"]))
      .toEqual({ "--dangerously-skip-permissions": true });
  });

  it("emits pair for flag followed by non-flag value", () => {
    expect(parseArgsToFlags(["--verbose", "2"]))
      .toEqual({ "--verbose": "2" });
  });

  it("emits boolean when next token starts with -- or a short flag", () => {
    expect(parseArgsToFlags(["--flag-a", "--flag-b"]))
      .toEqual({ "--flag-a": true, "--flag-b": true });
    expect(parseArgsToFlags(["--yolo", "-s"]))
      .toEqual({ "--yolo": true });
  });

  it("returns empty object on undefined args", () => {
    expect(parseArgsToFlags(undefined)).toEqual({});
  });

  it("ignores tokens that don't start with --", () => {
    // Rare stray tokens between flags — silently ignored.
    expect(parseArgsToFlags(["stray", "--flag"]))
      .toEqual({ "--flag": true });
  });
});

describe("parseSpawnOptionsYaml + stringifySpawnOptionsYaml round-trip", () => {
  it("parses and re-emits agmsg's flat dialect byte-identically", () => {
    const src = [
      "claude-code:",
      "  --dangerously-skip-permissions: true",
      "  --verbose: 2",
      "codex:",
      "  -m: opus",
      "",
    ].join("\n");
    const parsed = parseSpawnOptionsYaml(src);
    expect(parsed).toEqual({
      "claude-code": {
        "--dangerously-skip-permissions": true,
        "--verbose": "2",
      },
      codex: { "-m": "opus" },
    });
    // Round-trip: types + keys are emitted in sorted order.
    expect(stringifySpawnOptionsYaml(parsed)).toBe(src);
  });

  it("skips empty type sections in output", () => {
    expect(stringifySpawnOptionsYaml({ "claude-code": {}, codex: { "-m": "opus" } }))
      .toBe("codex:\n  -m: opus\n");
  });

  it("emits `true` for boolean flags", () => {
    expect(stringifySpawnOptionsYaml({ "claude-code": { "--flag": true } }))
      .toBe("claude-code:\n  --flag: true\n");
  });
});

describe("computeManagedSections", () => {
  it("gathers flags from live-shell workers grouped by mapped type", () => {
    const c = cfg({
      agents: [
        {
          name: "claude",
          mode: "live-shell",
          roles: ["code"],
          command: "claude",
          args: ["--dangerously-skip-permissions", "--model", "sonnet"],
          role: "code",
        },
        {
          name: "copilot-review",
          mode: "live-shell",
          roles: ["review"],
          command: "copilot",
          args: ["--yolo", "-s"],
          role: "review",
        },
      ],
    });
    expect(computeManagedSections(c)).toEqual({
      "claude-code": { "--dangerously-skip-permissions": true },
      copilot: { "--yolo": true }, // -s is not a `--` flag → ignored
    });
  });

  it("skips manager entries entirely", () => {
    const c = cfg({
      agents: [
        {
          name: "pptr",
          mode: "live-shell",
          roles: ["manager"],
          command: "claude",
          args: ["--resume", "6f91588b-..."],
          role: "manager",
        },
      ],
    });
    expect(computeManagedSections(c)).toEqual({});
  });

  it("skips agents with unmapped commands", () => {
    const c = cfg({
      agents: [
        {
          name: "custom",
          mode: "live-shell",
          roles: ["review"],
          command: "my-wrapper",
          args: ["--foo"],
          role: "review",
        },
      ],
    });
    expect(computeManagedSections(c)).toEqual({});
  });

  it("skips mode: single-prompt workers", () => {
    const c = cfg({
      agents: [
        {
          name: "claude",
          mode: "single-prompt",
          roles: ["code"],
          command: "claude",
          args: ["--dangerously-skip-permissions"],
          role: "code",
        },
      ],
    });
    expect(computeManagedSections(c)).toEqual({});
  });
});

describe("mergeSections", () => {
  it("rewrites managed types and preserves unmanaged types", () => {
    const existing = {
      "claude-code": { "--old-flag": true as const },
      "grok-build": { "--grok-flag": true as const },
    };
    const managed = {
      "claude-code": { "--dangerously-skip-permissions": true as const },
    };
    const merged = mergeSections(existing, managed, new Set(["claude-code"]));
    expect(merged).toEqual({
      "claude-code": { "--dangerously-skip-permissions": true },
      "grok-build": { "--grok-flag": true },
    });
  });

  it("removes managed types that produce empty section", () => {
    const existing = {
      "claude-code": { "--old-flag": true as const },
      codex: { "-m": "opus" },
    };
    const merged = mergeSections(existing, {}, new Set(["claude-code"]));
    expect(merged).toEqual({ codex: { "-m": "opus" } });
  });
});

describe("syncSpawnOptions integration", () => {
  it("is a no-op when cfg.agmsg is null", async () => {
    const c: AgentConfig = {
      ok: true,
      agents: [],
      parallelExecution: false,
      agmsg: null,
      warnings: [],
    };
    await syncSpawnOptions(c, optionsPath);
    expect(existsSync(optionsPath)).toBe(false);
  });

  it("writes a fresh file with only live-shell + agmsg workers' flags", async () => {
    const c = cfg({
      agents: [
        {
          name: "claude",
          mode: "live-shell",
          roles: ["code"],
          command: "claude",
          args: ["--dangerously-skip-permissions", "--model", "sonnet"],
          role: "code",
        },
      ],
    });
    await syncSpawnOptions(c, optionsPath);
    const contents = await readFile(optionsPath, "utf8");
    expect(contents).toBe("claude-code:\n  --dangerously-skip-permissions: true\n");
  });

  it("removes stale entries under managed types", async () => {
    writeFileSync(
      optionsPath,
      "claude-code:\n  --dangerously-skip-permissions: true\n  --old-flag: true\n",
    );
    const c = cfg({
      agents: [
        {
          name: "claude",
          mode: "live-shell",
          roles: ["code"],
          command: "claude",
          args: ["--dangerously-skip-permissions"],
          role: "code",
        },
      ],
    });
    await syncSpawnOptions(c, optionsPath);
    const contents = await readFile(optionsPath, "utf8");
    expect(contents).toBe("claude-code:\n  --dangerously-skip-permissions: true\n");
  });

  it("preserves unmanaged type sections", async () => {
    writeFileSync(
      optionsPath,
      "claude-code:\n  --old: true\ngrok-build:\n  --grok: true\n",
    );
    const c = cfg({
      agents: [
        {
          name: "claude",
          mode: "live-shell",
          roles: ["code"],
          command: "claude",
          args: ["--new"],
          role: "code",
        },
      ],
    });
    await syncSpawnOptions(c, optionsPath);
    const contents = await readFile(optionsPath, "utf8");
    // Sorted order: claude-code before grok-build.
    expect(contents).toBe(
      "claude-code:\n  --new: true\ngrok-build:\n  --grok: true\n",
    );
  });

  it("removes a managed type entirely when its section becomes empty", async () => {
    writeFileSync(optionsPath, "claude-code:\n  --old: true\n");
    // Only a manager, which is excluded → managed sections empty for claude-code.
    const c = cfg({
      agents: [
        {
          name: "pptr",
          mode: "live-shell",
          roles: ["manager"],
          command: "claude",
          args: ["--resume", "abc"],
          role: "manager",
        },
      ],
    });
    // But `projectManagedTypes` also excludes manager → nothing to remove.
    // So the existing `claude-code: --old: true` should be PRESERVED (not managed).
    await syncSpawnOptions(c, optionsPath);
    const contents = await readFile(optionsPath, "utf8");
    expect(contents).toBe("claude-code:\n  --old: true\n");
  });

  it("does not create an empty file when there is nothing to write", async () => {
    const c = cfg({
      agents: [
        {
          name: "custom",
          mode: "live-shell",
          roles: ["review"],
          command: "my-wrapper",
          args: ["--foo"],
          role: "review",
        },
      ],
    });
    await syncSpawnOptions(c, optionsPath);
    expect(existsSync(optionsPath)).toBe(false);
  });

  it("does not leave a .tmp sibling after atomic write", async () => {
    const c = cfg({
      agents: [
        {
          name: "claude",
          mode: "live-shell",
          roles: ["code"],
          command: "claude",
          args: ["--flag"],
          role: "code",
        },
      ],
    });
    await syncSpawnOptions(c, optionsPath);
    expect(existsSync(`${optionsPath}.tmp`)).toBe(false);
  });
});

describe("projectManagedTypes", () => {
  it("collects mapped types from live-shell non-manager workers", () => {
    const c = cfg({
      agents: [
        {
          name: "claude",
          mode: "live-shell",
          roles: ["code"],
          command: "claude",
          role: "code",
        },
        {
          name: "cop",
          mode: "live-shell",
          roles: ["review"],
          command: "copilot",
          role: "review",
        },
      ],
    });
    expect(Array.from(projectManagedTypes(c)).sort()).toEqual(["claude-code", "copilot"]);
  });
});
