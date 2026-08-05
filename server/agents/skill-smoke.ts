// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { AgentDef } from "./registry.js";

export type SkillSmokeStage =
  | "configuration"
  | "initialization"
  | "skill-path"
  | "subprocess"
  | "timeout"
  | "artifact";

export type ProbeArtifact = {
  schemaVersion: 1;
  probe: "ithy-opsx-test-probe";
  agent: string;
  nonce: string;
  status: "recognized";
};

export type ProbeRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export type SkillSmokeResult =
  | { ok: true; agent: string; nonce: string; artifact: ProbeArtifact }
  | { ok: false; stage: SkillSmokeStage; reason: string; stdout?: string; stderr?: string };

export type SkillSmokeDeps = {
  createProject(): Promise<string>;
  initialize(projectRoot: string, agent: AgentDef): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  run(input: {
    projectRoot: string;
    artifactPath: string;
    agent: AgentDef;
    nonce: string;
    prompt: string;
    timeoutMs: number;
  }): Promise<ProbeRunResult>;
  readArtifact(path: string): Promise<string>;
  cleanup(projectRoot: string): Promise<void>;
};

export function selectProbeAgent(agents: readonly AgentDef[], requestedName?: string): AgentDef {
  const candidates = agents.filter((agent) => agent.roles.includes("probe"));
  const selected = requestedName
    ? candidates.find((agent) => agent.name === requestedName)
    : candidates[0];
  if (!selected) {
    throw new Error(requestedName
      ? `Agent '${requestedName}' is not configured with role 'probe' in agents.yaml`
      : "No Agent with role 'probe' is configured in agents.yaml");
  }
  return selected;
}

export function expectedProbeSkillPath(command: string | undefined): string {
  if (command === "claude") return ".claude/skills/ithy-opsx-test-probe/SKILL.md";
  if (command === "codex") return ".codex/skills/ithy-opsx-test-probe/SKILL.md";
  if (command === "agy" || command === "antigravity") {
    return ".agents/workflows/ithy-opsx/test-probe.md";
  }
  if (command === "cursor") return ".cursor/commands/ithy-opsx-test-probe.md";
  if (command === "gemini") return ".gemini/commands/ithy-opsx/test-probe.toml";
  if (command === "copilot") return ".github/prompts/ithy-opsx-test-probe.prompt.md";
  if (command === "opencode") return ".opencode/commands/ithy-opsx-test-probe.md";
  throw new Error(`Agent command '${command ?? "<missing>"}' has no live probe skill-path adapter`);
}

export function validateProbeArtifact(raw: string, agent: string, nonce: string): ProbeArtifact {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("probe artifact is not valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("probe artifact must be a JSON object");
  }
  const artifact = value as Record<string, unknown>;
  if (artifact.schemaVersion !== 1) throw new Error("probe artifact schemaVersion must be 1");
  if (artifact.probe !== "ithy-opsx-test-probe") throw new Error("probe artifact has the wrong probe name");
  if (artifact.agent !== agent) throw new Error(`probe artifact Agent mismatch: expected '${agent}'`);
  if (artifact.nonce !== nonce) throw new Error("probe artifact nonce mismatch");
  if (artifact.status !== "recognized") throw new Error("probe artifact status must be 'recognized'");
  return artifact as ProbeArtifact;
}

export async function runAgentSkillSmoke(input: {
  agents: readonly AgentDef[];
  agentName?: string;
  timeoutMs?: number;
  nonce?: string;
}, deps: SkillSmokeDeps): Promise<SkillSmokeResult> {
  let agent: AgentDef;
  try { agent = selectProbeAgent(input.agents, input.agentName); }
  catch (err) { return { ok: false, stage: "configuration", reason: String((err as Error).message) }; }

  let expectedRelativePath: string;
  try { expectedRelativePath = expectedProbeSkillPath(agent.command); }
  catch (err) { return { ok: false, stage: "configuration", reason: String((err as Error).message) }; }

  const nonce = input.nonce ?? randomUUID();
  const timeoutMs = input.timeoutMs ?? 120_000;
  let projectRoot: string;
  try { projectRoot = await deps.createProject(); }
  catch (err) { return { ok: false, stage: "initialization", reason: String((err as Error).message) }; }
  try {
    try { await deps.initialize(projectRoot, agent); }
    catch (err) { return { ok: false, stage: "initialization", reason: String((err as Error).message) }; }

    const skillPath = join(projectRoot, expectedRelativePath);
    if (!(await deps.pathExists(skillPath))) {
      return { ok: false, stage: "skill-path", reason: `Expected initialized skill at ${expectedRelativePath}` };
    }

    const artifactPath = join(projectRoot, ".ithyno", "test-artifacts", "skill-probe.json");
    const configured = agent.prompts?.probe?.replaceAll("${change_id}", nonce) ??
      "Use the ithy-opsx-test-probe skill.";
    const prompt = `${configured}\nAgent name: ${agent.name}\nNonce: ${nonce}\nArtifact path: ${artifactPath}\nDo not perform any other work.`;
    let run: ProbeRunResult;
    try { run = await deps.run({ projectRoot, artifactPath, agent, nonce, prompt, timeoutMs }); }
    catch (err) { return { ok: false, stage: "subprocess", reason: String((err as Error).message) }; }
    if (run.timedOut) {
      return { ok: false, stage: "timeout", reason: `Agent '${agent.name}' timed out after ${timeoutMs}ms`, stdout: run.stdout, stderr: run.stderr };
    }
    if (run.exitCode !== 0) {
      return { ok: false, stage: "subprocess", reason: `Agent '${agent.name}' exited with code ${run.exitCode}`, stdout: run.stdout, stderr: run.stderr };
    }
    let raw: string;
    try { raw = await deps.readArtifact(artifactPath); }
    catch { return { ok: false, stage: "artifact", reason: "Agent exited successfully but wrote no probe artifact", stdout: run.stdout, stderr: run.stderr }; }
    try {
      return { ok: true, agent: agent.name, nonce, artifact: validateProbeArtifact(raw, agent.name, nonce) };
    } catch (err) {
      return { ok: false, stage: "artifact", reason: String((err as Error).message), stdout: run.stdout, stderr: run.stderr };
    }
  } finally {
    await deps.cleanup(projectRoot);
  }
}
