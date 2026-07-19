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
  await rm(dir, { recursive: true, force: true });
});

describe("runNewProjectChain — scaffold step", () => {
  it("emits step-start / log / step-done for a fresh dir with autoGitInit", async () => {
    // We use a subdirectory that doesn't exist so autoCreateDir kicks
    // in. We stop the chain by ensuring openspec-init would fail —
    // easier to inspect step 1 in isolation via events only for the
    // scaffold branch.
    // To keep the test fast, we intercept before step 2 runs by
    // observing events; we still want to allow the full chain to
    // complete or fail, so use a target that scaffold succeeds on.
    const target = join(dir, "child");
    const promise = runNewProjectChain(target, (e) => events.push(e));

    // We can't stop the chain here — it will proceed to openspec-init.
    // Since openspec-init needs network, the test would be slow; wait
    // and just assert on the scaffold portion.
    // Timeout protects against hanging tests when network is available.
    await Promise.race([
      promise,
      new Promise((r) => setTimeout(r, 5000)),
    ]);

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
  }, 15000);
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

describe("runNewProjectChain — event shape", () => {
  it("each log event carries a step, line, and stream field", async () => {
    // Same as first test — inspect log event shape, not completion.
    const target = join(dir, "shape-check");
    const promise = runNewProjectChain(target, (e) => events.push(e));
    await Promise.race([
      promise,
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    for (const e of events) {
      if (e.type === "log") {
        expect(typeof e.step).toBe("string");
        expect(typeof e.line).toBe("string");
        expect(e.stream === "stdout" || e.stream === "stderr").toBe(true);
      }
    }
  }, 15000);
});

describe("runNewProjectChain — target file existence check", () => {
  it("creates the target dir when autoCreateDir applies", async () => {
    const target = join(dir, "nested", "created");
    const promise = runNewProjectChain(target, (e) => events.push(e));
    await Promise.race([
      promise,
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    expect(existsSync(target)).toBe(true);
  }, 15000);
});
