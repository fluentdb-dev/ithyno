import { describe, it, expect, beforeEach } from "vitest";
import { AgentRunner } from "./runner.js";
import type { AgentRegistry } from "./registry.js";

/**
 * Unit tests for AgentRunner.writeInput. We reach into the internal maps to
 * install a fake job + a fake IPty stub so we don't need a real spawn. The
 * fake pty captures writes for assertion; the runner treats it identically
 * to a real IPty because we only depend on `write` / `kill` / `onData` /
 * `onExit`.
 */

class FakePty {
  public writes: string[] = [];
  public killed: string | undefined;
  write(chunk: string) {
    this.writes.push(chunk);
  }
  kill(sig?: string) {
    this.killed = sig ?? "SIGTERM";
  }
  onData() {
    /* noop */
  }
  onExit() {
    /* noop */
  }
}

function stubRunner() {
  const events: unknown[] = [];
  const registry = { find: () => null, resolve: () => ({ args: [], env: {} }) } as unknown as AgentRegistry;
  const runner = new AgentRunner("/tmp", registry, (ev) => events.push(ev));
  return { runner, events };
}

function installFakeJob(
  runner: AgentRunner,
  jobId: string,
  status: "running" | "completed" | "crashed" | "cancelled" = "running",
) {
  const fakePty = new FakePty();
  const jobs = (runner as unknown as { jobs: Map<string, unknown> }).jobs;
  const processes = (runner as unknown as { processes: Map<string, unknown> }).processes;
  jobs.set(jobId, {
    id: jobId,
    changeId: "c",
    agentName: "a",
    branch: "b",
    worktreePath: "/w",
    status,
    startedAt: 0,
    output: [] as unknown[],
  });
  processes.set(jobId, fakePty);
  return { fakePty };
}

describe("AgentRunner.writeInput (pty)", () => {
  let runner: AgentRunner;
  let events: unknown[];

  beforeEach(() => {
    const r = stubRunner();
    runner = r.runner;
    events = r.events;
  });

  it("returns 404 for unknown job", () => {
    const res = runner.writeInput("nope", "data");
    expect(res).toEqual({ ok: false, status: 404, reason: "Unknown job id" });
  });

  it("returns 409 when job is not running", () => {
    installFakeJob(runner, "j1", "completed");
    const res = runner.writeInput("j1", "y");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.reason).toMatch(/not accepting input/);
    }
  });

  it("appends carriage return by default (terminal Enter)", () => {
    const { fakePty } = installFakeJob(runner, "j2");
    const res = runner.writeInput("j2", "Option A");
    expect(res.ok).toBe(true);
    expect(fakePty.writes).toEqual(["Option A\r"]);
  });

  it("respects appendNewline=false", () => {
    const { fakePty } = installFakeJob(runner, "j3");
    const res = runner.writeInput("j3", "y", false);
    expect(res.ok).toBe(true);
    expect(fakePty.writes).toEqual(["y"]);
  });

  it("pushes a stdin echo to the ring buffer + emits WS event", () => {
    installFakeJob(runner, "j4");
    runner.writeInput("j4", "hello");
    const jobs = (runner as unknown as { jobs: Map<string, { output: { stream: string; chunk: string }[] }> }).jobs;
    const out = jobs.get("j4")!.output;
    expect(out).toHaveLength(1);
    expect(out[0].stream).toBe("stdin");
    expect(out[0].chunk).toBe("hello\r");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "agent-job-output",
      jobId: "j4",
      stream: "stdin",
      chunk: "hello\r",
    });
  });

  it("cancel() kills the pty with SIGTERM", () => {
    const { fakePty } = installFakeJob(runner, "j5");
    const res = runner.cancel("j5");
    expect(res.ok).toBe(true);
    expect(fakePty.killed).toBe("SIGTERM");
  });
});
