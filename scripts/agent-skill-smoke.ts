// SPDX-License-Identifier: GPL-3.0-or-later
import { execFile as execFileCb, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";
import { runInit } from "../bin/init.js";
import { openspecToolForCli } from "../bin/new-project-chain.js";
import { AgentRegistry, validateAgents, type AgentDef } from "../server/agents/registry.js";
import { installSkills, mapDoctorCliToRendererCli } from "../server/skill-renderer/index.js";
import { runAgentSkillSmoke, type ProbeRunResult } from "../server/agents/skill-smoke.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFile = promisify(execFileCb);
const optionValue = (name: string): string | undefined => {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const requestedAgent = process.argv.find((arg) => arg.startsWith("--agent="))?.slice("--agent=".length)
  ?? (process.argv.includes("--agent") ? process.argv[process.argv.indexOf("--agent") + 1] : undefined);
const configPath = optionValue("--config");

if (process.env.RUN_AGENT_SKILL_E2E !== "1") {
  console.error("Agent skill live smoke is disabled. Set RUN_AGENT_SKILL_E2E=1 to run it.");
  process.exitCode = 2;
} else {
  let agents: AgentDef[];
  if (configPath) {
    agents = validateAgents(parseYaml(await readFile(resolve(configPath), "utf8")));
  } else {
    const registry = new AgentRegistry(repoRoot);
    await registry.load();
    const config = registry.publicConfig();
    if (!config.ok) throw new Error(config.error);
    agents = config.agents as AgentDef[];
  }

  const runCli = (agent: AgentDef, cwd: string, prompt: string, timeoutMs: number): Promise<ProbeRunResult> =>
    new Promise((resolveRun, reject) => {
      const baseArgs = [...(agent.args ?? [])].filter((arg) => !arg.includes("${change_id}"));
      const args = agent.command === "codex"
        ? [...baseArgs, "exec", prompt]
        : [...baseArgs.filter((arg) => arg !== "-p"), "-p", prompt];
      const child = spawn(agent.command!, args, {
        cwd,
        env: {
          ...process.env,
          ...agent.env,
          PATH: `${join(repoRoot, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
      child.on("error", reject);
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolveRun({ exitCode: code, stdout, stderr, timedOut });
      });
    });

  const result = await runAgentSkillSmoke({
    agents,
    agentName: requestedAgent,
  }, {
    createProject: () => mkdtemp(join(tmpdir(), "ithyno-agent-skill-smoke-")),
    initialize: async (projectRoot, agent) => {
      const initialized = await runInit({ targetDir: projectRoot, autoGitInit: true, quiet: true });
      if (!initialized.ok) throw new Error(initialized.reason);
      const binDir = join(repoRoot, "node_modules", ".bin");
      await execFile(join(binDir, "openspec"), [
        "init",
        projectRoot,
        "--tools",
        openspecToolForCli(agent.command),
      ], {
        cwd: projectRoot,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
        timeout: 60_000,
      });
      const cli = mapDoctorCliToRendererCli(agent.command ?? "");
      if (!cli) throw new Error(`No skill renderer for Agent command '${agent.command}'`);
      const installed = await installSkills({ projectRoot, selectedClis: [cli], sourcesDir: join(repoRoot, "ithyno", "skills") });
      if (installed.errors.length > 0) throw new Error(installed.errors.map((error) => error.message).join("; "));
    },
    pathExists: async (path) => existsSync(path),
    run: ({ agent, projectRoot, prompt, timeoutMs }) => runCli(agent, projectRoot, prompt, timeoutMs),
    readArtifact: (path) => readFile(path, "utf8"),
    cleanup: (projectRoot) => rm(projectRoot, { recursive: true, force: true, maxRetries: 3 }),
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
