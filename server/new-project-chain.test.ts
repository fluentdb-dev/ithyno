// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runNewProjectChain } from "../bin/new-project-chain.js";
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
  // Step 2+ (npm install of @fission-ai/openspec, then openspec init —
  // see new-project-chain.js) hits the real network. A single shared
  // run covers scaffold behavior, event shape, and target creation —
  // splitting these into 3 separate tests each running the full real
  // chain independently tripled the network/npm-install cost and
  // caused hookTimeout/testTimeout flakiness under full-suite
  // concurrency. Also: don't race the chain against a timeout and move
  // on — an earlier version did that and left an orphaned background
  // process holding a Windows file lock on `dir`, breaking cleanup.
  it("scaffolds, streams well-shaped events, and completes for a fresh nested dir with autoGitInit", async () => {
    const target = join(dir, "nested", "child");
    await runNewProjectChain(target, (e) => events.push(e));

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
  }, 120000);
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
