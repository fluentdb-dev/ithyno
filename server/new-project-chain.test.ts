// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeCodexPromptNames, runNewProjectChain } from "../bin/new-project-chain.js";
import type { ChainEvent } from "../bin/new-project-chain.js";

let dir: string;
let events: ChainEvent[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ithyno-chain-"));
  events = [];
});

afterEach(async () => {
  // maxRetries/retryDelay: cheap insurance against a transient Windows
  // EBUSY right after a spawned child (openspec init / npm install)
  // exits but hasn't fully released its file handles yet.
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}, 30000);

describe("runNewProjectChain — full run against a fresh dir", () => {
  // Subprocesses are injected here so the default test suite is deterministic
  // and offline. The opt-in prompt smoke owns real npm/OpenSpec/Codex coverage.
  it("scaffolds, streams well-shaped events, and completes for a fresh nested dir with autoGitInit", async () => {
    const target = join(dir, "nested", "child");
    await runNewProjectChain(target, (e) => events.push(e), {
      spawnImpl: async (_cmd, _args, _cwd, step, onEvent) => {
        onEvent({ type: "log", step, line: "fake subprocess completed", stream: "stdout" });
        return { ok: true, code: 0, message: "" };
      },
    });

    const scaffoldStart = events.find(
      (e) => e.type === "step-start" && e.step === "scaffold",
    );
    const scaffoldLogs = events.filter(
      (e) => e.type === "log" && e.step === "scaffold",
    );
    const scaffoldDone = events.find(
      (e) => e.type === "step-done" && e.step === "scaffold",
    );

    expect(scaffoldStart).toBeDefined();
    expect(scaffoldLogs.length).toBeGreaterThan(0);
    expect(scaffoldDone).toBeDefined();
    expect(existsSync(join(target, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(target, ".git"))).toBe(true);

    // autoCreateDir: the nested target dir didn't exist beforehand.
    expect(existsSync(target)).toBe(true);

    // Event shape: every log event carries a step, line, and stream.
    for (const e of events) {
      if (e.type === "log") {
        expect(typeof e.step).toBe("string");
        expect(typeof e.line).toBe("string");
        expect(e.stream === "stdout" || e.stream === "stderr").toBe(true);
      }
    }
  });
});

describe("runNewProjectChain — scaffold failure", () => {
  it("emits error and stops when runInit fails preflight (no autoCreate on missing dir)", async () => {
    // Missing target + autoCreateDir DEFAULT (false) — but the chain
    // always sets autoCreateDir true internally, so we simulate a
    // different failure: pass a target that IS a file (not a dir).
    const filePath = join(dir, "not-a-dir");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(filePath, "x"),
    );

    const result = await runNewProjectChain(filePath, (e) =>
      events.push(e),
    );

    expect(result.ok).toBe(false);
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    if (errorEvent && errorEvent.type === "error") {
      expect(errorEvent.step).toBe("scaffold");
      expect(errorEvent.message.length).toBeGreaterThan(0);
    }
    // openspec-init should NEVER have started.
    expect(
      events.some((e) => e.type === "step-start" && e.step === "openspec-init"),
    ).toBe(false);
  });
});

describe("runNewProjectChain — Codex project-local initialization", () => {
  it("restores AGENTS.md and normalizes prompts without using global CODEX_HOME", async () => {
    const target = join(dir, "codex-project");
    const seenEnvs: Array<Record<string, string>> = [];
    const result = await runNewProjectChain(target, (e) => events.push(e), {
      managerCli: "codex",
      spawnImpl: async (_cmd, args, cwd, _step, _onEvent, extraEnv = {}) => {
        seenEnvs.push(extraEnv);
        if (args[0] === "openspec") {
          await writeFile(join(cwd, "AGENTS.md"), "upstream replacement\n");
          await mkdir(join(cwd, ".codex", "prompts"), { recursive: true });
          await writeFile(join(cwd, ".codex", "prompts", "opsx-propose.md"), "propose\n");
        }
        return { ok: true, code: 0, message: "" };
      },
    });

    expect(result.ok).toBe(true);
    expect(await readFile(join(target, "AGENTS.md"), "utf8")).toBe(
      await readFile(join(process.cwd(), "templates", "AGENTS.md"), "utf8"),
    );
    expect(existsSync(join(target, ".codex/prompts/openspec-propose.md"))).toBe(true);
    expect(existsSync(join(target, ".codex/prompts/opsx-propose.md"))).toBe(false);
    expect(seenEnvs[0]).toEqual({});
    expect(seenEnvs[1]).toEqual({ CODEX_HOME: join(target, ".codex") });
  });

  it("keeps an existing native prompt and removes a regenerated legacy alias", async () => {
    const prompts = join(dir, ".codex", "prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "openspec-propose.md"), "user-owned\n");
    await writeFile(join(prompts, "opsx-propose.md"), "generated\n");

    await normalizeCodexPromptNames(dir);
    await normalizeCodexPromptNames(dir);

    expect(await readFile(join(prompts, "openspec-propose.md"), "utf8")).toBe("user-owned\n");
    expect(existsSync(join(prompts, "opsx-propose.md"))).toBe(false);
  });
});
