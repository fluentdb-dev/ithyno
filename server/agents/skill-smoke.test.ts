// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, vi } from "vitest";
import type { AgentDef } from "./registry.js";
import {
  expectedProbeSkillPath,
  runAgentSkillSmoke,
  selectProbeAgent,
  validateProbeArtifact,
  type ProbeRunResult,
  type SkillSmokeDeps,
} from "./skill-smoke.js";

function agent(overrides: Partial<AgentDef> = {}): AgentDef {
  return {
    name: "codex-probe",
    command: "codex",
    args: [],
    mode: "single-prompt",
    roles: ["probe"],
    role: "probe",
    prompts: { probe: "Use the probe for ${change_id}." },
    ...overrides,
  };
}

function artifact(agentName = "codex-probe", nonce = "nonce-1"): string {
  return JSON.stringify({
    schemaVersion: 1,
    probe: "ithy-opsx-test-probe",
    agent: agentName,
    nonce,
    status: "recognized",
  });
}

function deps(overrides: Partial<SkillSmokeDeps> = {}): SkillSmokeDeps {
  return {
    createProject: vi.fn(async () => "/tmp/probe-project"),
    initialize: vi.fn(async () => undefined),
    pathExists: vi.fn(async () => true),
    run: vi.fn(async (): Promise<ProbeRunResult> => ({
      exitCode: 0,
      stdout: "diagnostic output",
      stderr: "",
    })),
    readArtifact: vi.fn(async () => artifact()),
    cleanup: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("Agent skill smoke configuration", () => {
  it("selects the first probe Agent or narrows by name", () => {
    const agents = [
      agent({ name: "worker", roles: ["code"], role: "code" }),
      agent({ name: "claude-probe", command: "claude" }),
      agent(),
    ];
    expect(selectProbeAgent(agents).name).toBe("claude-probe");
    expect(selectProbeAgent(agents, "codex-probe").command).toBe("codex");
    expect(() => selectProbeAgent(agents, "worker")).toThrow("role 'probe'");
    expect(() => selectProbeAgent([])).toThrow("No Agent");
  });

  it("maps only supported receiving CLIs to initialized skill paths", () => {
    expect(expectedProbeSkillPath("claude")).toBe(".claude/commands/ithy-opsx/test-probe.md");
    expect(expectedProbeSkillPath("codex")).toBe(".codex/prompts/ithy-opsx-test-probe.md");
    expect(expectedProbeSkillPath("agy")).toBe(".agent/workflows/ithy-opsx-test-probe.md");
    expect(expectedProbeSkillPath("cursor")).toBe(".cursor/commands/ithy-opsx-test-probe.md");
    expect(expectedProbeSkillPath("gemini")).toBe(".gemini/commands/ithy-opsx/test-probe.toml");
    expect(expectedProbeSkillPath("copilot")).toBe(".github/prompts/ithy-opsx-test-probe.prompt.md");
    expect(expectedProbeSkillPath("opencode")).toBe(".opencode/commands/ithy-opsx-test-probe.md");
    expect(() => expectedProbeSkillPath("unknown")).toThrow("no live probe skill-path adapter");
  });

  it("validates every artifact identity field", () => {
    expect(validateProbeArtifact(artifact(), "codex-probe", "nonce-1").status).toBe("recognized");
    expect(() => validateProbeArtifact("not json", "codex-probe", "nonce-1")).toThrow("valid JSON");
    expect(() => validateProbeArtifact("[]", "codex-probe", "nonce-1")).toThrow("JSON object");
    expect(() => validateProbeArtifact(artifact("other"), "codex-probe", "nonce-1")).toThrow("Agent mismatch");
    expect(() => validateProbeArtifact(artifact("codex-probe", "stale"), "codex-probe", "nonce-1")).toThrow("nonce mismatch");
  });
});

describe("runAgentSkillSmoke", () => {
  it("initializes, checks the CLI-specific path, runs, validates, and cleans up", async () => {
    const d = deps();
    const result = await runAgentSkillSmoke({
      agents: [agent()],
      nonce: "nonce-1",
      timeoutMs: 321,
    }, d);

    expect(result.ok).toBe(true);
    expect(d.pathExists).toHaveBeenCalledWith(
      "/tmp/probe-project/.codex/prompts/ithy-opsx-test-probe.md",
    );
    expect(d.run).toHaveBeenCalledWith(expect.objectContaining({
      nonce: "nonce-1",
      timeoutMs: 321,
      prompt: expect.stringContaining("Use the probe for nonce-1."),
    }));
    expect(d.cleanup).toHaveBeenCalledWith("/tmp/probe-project");
  });

  it("reports configuration failures before creating a project", async () => {
    const d = deps();
    const noProbe = await runAgentSkillSmoke({ agents: [] }, d);
    const unsupported = await runAgentSkillSmoke({ agents: [agent({ command: "unknown" })] }, d);
    expect(noProbe).toMatchObject({ ok: false, stage: "configuration" });
    expect(unsupported).toMatchObject({ ok: false, stage: "configuration" });
    expect(d.createProject).not.toHaveBeenCalled();
  });

  it("reports temporary project creation as an initialization failure", async () => {
    const result = await runAgentSkillSmoke({ agents: [agent()] }, deps({
      createProject: vi.fn(async () => { throw new Error("temp failed"); }),
    }));
    expect(result).toMatchObject({ ok: false, stage: "initialization", reason: "temp failed" });
  });

  it.each([
    ["initialization", deps({ initialize: vi.fn(async () => { throw new Error("init failed"); }) })],
    ["skill-path", deps({ pathExists: vi.fn(async () => false) })],
    ["subprocess", deps({ run: vi.fn(async () => { throw new Error("spawn failed"); }) })],
  ] as const)("reports a %s failure and still cleans up", async (stage, d) => {
    const result = await runAgentSkillSmoke({ agents: [agent()], nonce: "nonce-1" }, d);
    expect(result).toMatchObject({ ok: false, stage });
    expect(d.cleanup).toHaveBeenCalledOnce();
  });

  it("distinguishes timeout and non-zero subprocess failures with diagnostics", async () => {
    const timedOut = await runAgentSkillSmoke({ agents: [agent()], nonce: "nonce-1" }, deps({
      run: vi.fn(async () => ({ exitCode: null, stdout: "partial", stderr: "slow", timedOut: true })),
    }));
    expect(timedOut).toMatchObject({ ok: false, stage: "timeout", stdout: "partial", stderr: "slow" });

    const nonzero = await runAgentSkillSmoke({ agents: [agent()], nonce: "nonce-1" }, deps({
      run: vi.fn(async () => ({ exitCode: 7, stdout: "out", stderr: "bad" })),
    }));
    expect(nonzero).toMatchObject({ ok: false, stage: "subprocess", stdout: "out", stderr: "bad" });
  });

  it("treats exit zero without an artifact as failure", async () => {
    const result = await runAgentSkillSmoke({ agents: [agent()], nonce: "nonce-1" }, deps({
      readArtifact: vi.fn(async () => { throw new Error("ENOENT"); }),
    }));
    expect(result).toMatchObject({
      ok: false,
      stage: "artifact",
      reason: "Agent exited successfully but wrote no probe artifact",
    });
  });

  it("rejects a stale artifact even when the subprocess exits zero", async () => {
    const result = await runAgentSkillSmoke({ agents: [agent()], nonce: "nonce-1" }, deps({
      readArtifact: vi.fn(async () => artifact("codex-probe", "old-nonce")),
    }));
    expect(result).toMatchObject({ ok: false, stage: "artifact", reason: "probe artifact nonce mismatch" });
  });
});
