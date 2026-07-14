// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "./registry.js";
import { dispatch } from "./dispatch.js";
import type { AgentRunner, JobSummary } from "./runner.js";
import { getSessionId } from "./session-store.js";

/**
 * Integration tests for dispatch's session correlation
 * (add-session-id-template-var). Uses a stub AgentRunner that captures
 * the arguments passed to `run()` without actually spawning anything.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-dispatch-session-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function setup(): Promise<{ registry: AgentRegistry }> {
  writeFileSync(
    join(dir, "agents.yaml"),
    `agents:
  - name: coder
    command: claude
    args: []
    role: code
    specialties: [any]
`,
  );
  const registry = new AgentRegistry(dir);
  await registry.load();
  return { registry };
}

function writeChange(changeId: string): void {
  mkdirSync(join(dir, "openspec", "changes", changeId), { recursive: true });
  writeFileSync(
    join(dir, "openspec", "changes", changeId, "proposal.md"),
    "---\ntags: [any]\n---\n",
  );
}

/**
 * Minimal stub — capture the run() invocation and return a synthetic
 * finished job. Enough surface for dispatch()'s wait-false path.
 */
function stubRunner(): {
  runner: AgentRunner;
  runCalls: Array<{ changeId: string; agentName: string; role?: string; sessionId?: string }>;
} {
  const runCalls: Array<{ changeId: string; agentName: string; role?: string; sessionId?: string }> = [];
  const runner = {
    run: async (
      changeId: string,
      agentName: string,
      role?: string,
      sessionId?: string,
    ) => {
      runCalls.push({ changeId, agentName, role, sessionId });
      const job: JobSummary = {
        id: `job-stub-${runCalls.length}`,
        changeId,
        agentName,
        branch: `agent/${changeId}`,
        worktreePath: `/tmp/${changeId}`,
        status: "running",
        startedAt: Date.now(),
        role: role ?? "code",
        runtime: "legacy",
        sessionId,
      };
      return { ok: true as const, job };
    },
    getJob: () => null,
    cancel: () => ({ ok: false as const, reason: "stub" }),
  } as unknown as AgentRunner;
  return { runner, runCalls };
}

describe("dispatch — session correlation", () => {
  it("body sessionId wins over the store", async () => {
    const { registry } = await setup();
    writeChange("add-foo");
    const { runner, runCalls } = stubRunner();
    const outcome = await dispatch(runner, registry, dir, {
      role: "code",
      changeId: "add-foo",
      wait: false,
      sessionId: "explicit-9",
    });
    expect(outcome.ok).toBe(true);
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0].sessionId).toBe("explicit-9");
    // sessions.json should NOT be touched by the explicit-override path.
    expect(existsSync(join(dir, ".ithyno", "sessions.json"))).toBe(false);
  });

  it("missing sessionId falls back to the change-scoped store (mints on first call)", async () => {
    const { registry } = await setup();
    writeChange("add-foo");
    const { runner, runCalls } = stubRunner();
    const outcome = await dispatch(runner, registry, dir, {
      role: "code",
      changeId: "add-foo",
      wait: false,
    });
    expect(outcome.ok).toBe(true);
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0].sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    // sessions.json should now contain the minted entry.
    const stored = await getSessionId(dir, "add-foo");
    expect(stored).toBe(runCalls[0].sessionId);
  });

  it("second dispatch on the same change reuses the stored sessionId", async () => {
    const { registry } = await setup();
    writeChange("add-foo");
    const { runner, runCalls } = stubRunner();
    const first = await dispatch(runner, registry, dir, {
      role: "code",
      changeId: "add-foo",
      wait: false,
    });
    expect(first.ok).toBe(true);
    const before = readFileSync(join(dir, ".ithyno", "sessions.json"), "utf8");
    const second = await dispatch(runner, registry, dir, {
      role: "code",
      changeId: "add-foo",
      wait: false,
    });
    expect(second.ok).toBe(true);
    expect(runCalls[1].sessionId).toBe(runCalls[0].sessionId);
    const after = readFileSync(join(dir, ".ithyno", "sessions.json"), "utf8");
    expect(after).toBe(before);
  });

  it("non-existent changeId still mints a session (then dispatch returns 404)", async () => {
    const { registry } = await setup();
    // No writeChange call — the change directory does not exist.
    const { runner } = stubRunner();
    const outcome = await dispatch(runner, registry, dir, {
      role: "code",
      changeId: "does-not-exist",
      wait: false,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.status).toBe(404);
    // sessions.json gains the orphan entry per spec.
    const stored = await getSessionId(dir, "does-not-exist");
    expect(stored).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
