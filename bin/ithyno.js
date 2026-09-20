#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
import { execSync } from "node:child_process";

function loadShellEnv() {
  if (process.platform === "win32") return;
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const output = execSync(`"${shell}" -l -c 'printenv'`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10000,
    });
    for (const line of output.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.slice(0, idx);
        const val = line.slice(idx + 1);
        if (
          key === "PATH" ||
          key === "LANG" ||
          key.startsWith("LC_") ||
          key.startsWith("RBENV") ||
          key.startsWith("NVM_") ||
          key.startsWith("NDENV") ||
          key.startsWith("NODE_")
        ) {
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.warn("[cli] failed to load shell env:", err);
  }
}

loadShellEnv();
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { Command } from "commander";
import { runInit } from "./init.js";

async function loadBridgeApi() {
  try {
    return await import("../server/bridge.ts");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ithyno] bridge runtime failed to load:", message);
    process.exit(EXIT_CODES.unsupported);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const EXIT_CODES = {
  ok: 0,
  unavailable: 10,
  permission: 11,
  validation: 12,
  timeout: 13,
  stale: 14,
  unsupported: 15,
  usage: 2,
};
if (!process.env.ITHYNO_TSX_LOADED && existsSync(resolve(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs"))) {
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, ITHYNO_TSX_LOADED: "1" },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    console.error("[ithyno] failed to relaunch with tsx:", err);
    process.exit(EXIT_CODES.unsupported);
  });
  process.exit(0);
}

async function projectFromArgs(project, defaultDir = process.cwd()) {
  const api = await loadBridgeApi();
  return api.canonicalProjectRoot(project || defaultDir, defaultDir);
}

function resolveCodexConfigPath(projectRoot, globalFlag = false) {
  const base = globalFlag ? join(homedir(), ".codex") : join(projectRoot || process.cwd(), ".codex");
  return join(base, "config.toml");
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlArray(values) {
  return `[${values.map((entry) => JSON.stringify(String(entry))).join(", ")}]`;
}

function codexServerConfigBlock(command, args, env) {
  const lines = [
    "[mcp_servers.ithyno]",
    `command = ${tomlString(command)}`,
    `args = ${tomlArray(args)}`,
  ];
  const envEntries = Object.entries(env ?? {});
  if (envEntries.length > 0) {
    const envText = envEntries.map(([key, value]) => `${key} = ${tomlString(value)}`).join(", ");
    lines.push(`env = { ${envText} }`);
  }
  return `${lines.join("\n")}\n`;
}

function parseTomlScalar(raw) {
  const value = raw.trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const inner = value.slice(1, -1);
    return inner.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value.replace(/'/g, '"'));
    } catch {
      return value;
    }
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return {};
    const out = {};
    for (const pair of inner.split(",")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const key = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1).trim();
      out[key] = parseTomlScalar(val);
    }
    return out;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  return value;
}

async function readCodexConfig(configPath) {
  try {
    const text = await readFile(configPath, "utf8");
    if (!text.trim()) return { mcpServers: {} };
    const lineRegex = /^\s*\[\s*(.+?)\s*\]\s*$/;
    const entries = {};
    let activeSection = null;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = lineRegex.exec(trimmed);
      if (match) {
        activeSection = match[1].trim();
        if (!entries[activeSection]) entries[activeSection] = {};
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0 || !activeSection) continue;
      const key = trimmed.slice(0, eq).trim();
      const rawValue = trimmed.slice(eq + 1).trim();
      entries[activeSection][key] = parseTomlScalar(rawValue);
    }
    const mcpServers = {};
    for (const [section, values] of Object.entries(entries)) {
      if (!section.startsWith("mcp_servers")) continue;
      const suffix = section.replace(/^mcp_servers\.?/u, "").replace(/^\./u, "");
      if (!suffix || suffix === "mcp_servers") {
        if (values && typeof values === "object") Object.assign(mcpServers, values);
        continue;
      }
      mcpServers[suffix] = values;
    }
    return { mcpServers };
  } catch {
    return { mcpServers: {} };
  }
}

async function writeCodexConfig(configPath, servers) {
  const parent = dirname(configPath);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(parent, { recursive: true }));

  let current = "";
  try {
    current = await readFile(configPath, "utf8");
  } catch {
    current = "";
  }

  const existing = await readCodexConfig(configPath);
  const normalized = {
    ...(existing.mcpServers && typeof existing.mcpServers === "object" ? existing.mcpServers : {}),
    ...servers,
  };

  const blocks = [];
  for (const [name, config] of Object.entries(normalized)) {
    if (!config || typeof config !== "object") continue;
    const block = codexServerConfigBlock(config.command ?? "", config.args ?? [], config.env ?? {});
    blocks.push(block);
  }

  const cleaned = current.replace(/\n?\[mcp_servers(?:\.[^\]]+)?\][\s\S]*?(?=\n\[[^\]]+\]|$)/g, "").trim();
  const next = blocks.length > 0 ? blocks.join("\n") : "";
  const merged = [cleaned, next].filter(Boolean).join("\n\n").trim();
  await writeFile(configPath, `${merged}\n`, "utf8");
}

async function printBridgeEnvelope(result, requestKind, projectRoot, operation) {
  const api = await loadBridgeApi();
  const envelope = {
    ok: Boolean(result?.ok ?? false),
    version: "1",
    kind: requestKind,
    command: operation,
    projectRoot,
    projectHash: api.stableProjectHash(projectRoot),
    result: result?.result ?? null,
    error: result?.error ?? null,
    code: result?.code ?? null,
  };
  console.log(JSON.stringify(envelope, null, 2));
}

async function runBridgeCommand(operation, params, opts) {
  const bridgeApi = await loadBridgeApi();
  const projectRoot = await projectFromArgs(opts.project, opts.cwd || process.cwd());
  const response = await bridgeApi.callBridgeOperation(projectRoot, operation, params, opts.cwd || process.cwd());
  const forceJson = !!opts.json;
  if (!forceJson) {
    if (!response.ok) {
      console.error(response.error ?? "bridge request failed");
      process.exit(EXIT_CODES[response.code ?? "unsupported"] ?? EXIT_CODES.unsupported);
    }
    console.log(JSON.stringify(response.result ?? {}, null, 2));
    return;
  }
  await printBridgeEnvelope(response, "bridge", projectRoot, operation);
  process.exit(response.ok ? EXIT_CODES.ok : EXIT_CODES[response.code ?? "unsupported"] ?? EXIT_CODES.unsupported);
}

const program = new Command();
program.name("ithyno").description("ithyno — local dashboard for the OpenSpec workflow");

program
  .command("init [dir]")
  .description("Scaffold the project-side files ithyno expects (CLAUDE.md, skill, agents.yaml.example, docs/, .gitignore)")
  .option("-f, --force", "overwrite existing files instead of skipping them")
  .option("--no-gitignore", "do not modify the target .gitignore")
  .option("-q, --quiet", "minimal output (errors only)")
  .action(async (dir, opts) => {
    const res = await runInit({
      targetDir: dir,
      force: !!opts.force,
      skipGitignore: opts.gitignore === false,
      quiet: !!opts.quiet,
    });
    if (!res.ok) {
      console.error(`✗ ${res.reason}`);
      process.exit(res.exitCode);
    }
    process.exit(0);
  });

program
  .command("doctor")
  .description("Check prerequisite CLIs and tools (agent CLIs, tmux, agmsg)")
  .option("--json", "emit raw DoctorReport JSON instead of a human-readable table")
  .action((opts) => {
    const tsxCli = resolve(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const doctorRunner = resolve(pkgRoot, "bin", "_doctor-runner.ts");
    const args = [tsxCli, doctorRunner];
    if (opts.json) args.push("--json");
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 1));
  });

const bridgeCommand = new Command("bridge");
bridgeCommand.description("Secure local project bridge commands");
["status", "changes", "phase", "activity", "dispatch", "jobs", "cancel", "needs-human"].forEach((name) => {
  bridgeCommand.addCommand(
    new Command(name)
      .description(`${name} via the shared bridge client`)
      .option("-p, --project <path>", "absolute or relative project root")
      .option("--json", "emit a versioned JSON envelope")
      .option("--change-id <id>", "change ID")
      .option("--phase <phase>", "phase to set")
      .option("--activity <activity>", "activity to set")
      .option("--role <role>", "role for a dispatch")
      .option("--agent <name>", "agent name for a dispatch")
      .option("--execution-mode <mode>", "execution mode for a dispatch (worktree or main-tree)")
      .option("--prompt <text>", "prompt text for a dispatch")
      .option("--wait", "wait for completion before returning")
      .option("--timeout <ms>", "wait timeout in milliseconds")
      .option("--job <jobId>", "job ID to cancel")
      .option("--message <message>", "message to attach")
      .option("--answer <answer>", "needs-human answer")
      .action(async (opts) => {
        const projectRoot = await projectFromArgs(opts.project, process.cwd());
        const dispatchTimeoutMs = opts.timeout !== undefined && opts.timeout !== null ? Number(opts.timeout) : undefined;
        const opMap = {
          status: { op: "status", params: {} },
          changes: { op: "changes", params: {} },
          phase: { op: "phase", params: { changeId: opts.changeId, phase: opts.phase, message: opts.message } },
          activity: { op: "activity", params: { changeId: opts.changeId, role: opts.role, activity: opts.activity, detail: opts.message } },
          dispatch: {
            op: "dispatch",
            params: {
              changeId: opts.changeId,
              agentName: opts.agent,
              role: opts.role,
              executionMode: opts.executionMode,
              prompt: opts.prompt,
              wait: !!opts.wait,
              timeoutMs: dispatchTimeoutMs,
            },
          },
          jobs: { op: "jobs", params: {} },
          cancel: { op: "job.cancel", params: { jobId: opts.job } },
          "needs-human": { op: opts.answer ? "needs-human.answer" : "needs-human.read", params: { changeId: opts.changeId, answer: opts.answer ?? "" } },
        };
        const selected = opMap[name];
        if (!selected) {
          console.error(`unsupported bridge command: ${name}`);
          process.exit(EXIT_CODES.usage);
        }
        await runBridgeCommand(selected.op, selected.params, { ...opts, project: projectRoot, cwd: process.cwd() });
      }),
  );
});
program.addCommand(bridgeCommand);

const mcpCommand = new Command("mcp");
mcpCommand.description("MCP adapter commands");

mcpCommand
  .command("serve")
  .description("Run the stdio MCP server over the shared bridge client")
  .action(() => {
    const tsxCli = resolve(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const serverEntry = resolve(pkgRoot, "server", "mcp-server.ts");
    const child = spawn(process.execPath, [tsxCli, serverEntry], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

mcpCommand
  .command("install")
  .description("Install the ithyno MCP server into the supported Codex project or user config without storing credentials")
  .option("-p, --project <path>", "project root to update")
  .option("--global", "write to ~/.codex/config.toml instead of the project")
  .action(async (opts) => {
    const projectRoot = opts.project ? await projectFromArgs(opts.project) : process.cwd();
    const configPath = resolveCodexConfigPath(projectRoot, !!opts.global);
    const config = await readCodexConfig(configPath);
    const command = process.execPath;
    const args = [resolve(pkgRoot, "bin", "ithyno.js"), "mcp", "serve"];
    const server = {
      command,
      args,
      env: { ITHYNO_PROJECT_ROOT: projectRoot, ITHYNO_OPEN: "0" },
    };
    const nextConfig = { ...config.mcpServers, ithyno: server };
    await writeCodexConfig(configPath, nextConfig);
    console.log(JSON.stringify({ ok: true, configPath, installed: true, name: "ithyno" }, null, 2));
  });

mcpCommand
  .command("status")
  .description("Check whether ithyno is installed in the active project or user Codex config")
  .option("-p, --project <path>", "project root to inspect")
  .option("--global", "check ~/.codex/config.toml instead of the project")
  .action(async (opts) => {
    const projectRoot = opts.project ? await projectFromArgs(opts.project) : process.cwd();
    const configPath = resolveCodexConfigPath(projectRoot, !!opts.global);
    const config = await readCodexConfig(configPath);
    const installed = Boolean(config.mcpServers?.ithyno);
    console.log(JSON.stringify({ ok: true, configPath, installed, config: config.mcpServers?.ithyno ?? null }, null, 2));
    process.exit(installed ? EXIT_CODES.ok : EXIT_CODES.unavailable);
  });

mcpCommand
  .command("remove")
  .description("Remove the ithyno MCP server from the supported Codex project or user config")
  .option("-p, --project <path>", "project root to update")
  .option("--global", "remove from ~/.codex/config.toml instead of the project")
  .action(async (opts) => {
    const projectRoot = opts.project ? await projectFromArgs(opts.project) : process.cwd();
    const configPath = resolveCodexConfigPath(projectRoot, !!opts.global);
    const config = await readCodexConfig(configPath);
    if (!config.mcpServers?.ithyno) {
      console.log(JSON.stringify({ ok: true, configPath, removed: false }, null, 2));
      process.exit(EXIT_CODES.unavailable);
    }
    const nextMcpServers = { ...config.mcpServers };
    delete nextMcpServers.ithyno;
    await writeCodexConfig(configPath, nextMcpServers);
    console.log(JSON.stringify({ ok: true, configPath, removed: true }, null, 2));
  });

program.addCommand(mcpCommand);

program
  .option("-p, --port <number>", "port to listen on", "4321")
  .option("-d, --dir <path>", "path to the OpenSpec project root (containing openspec/)", process.cwd())
  .option("--no-open", "do not open the browser automatically")
  .action((opts) => {
    const env = {
      ...process.env,
      PORT: String(opts.port),
      ITHYNO_PROJECT_ROOT: resolve(opts.dir),
      ITHYNO_OPEN: opts.open ? "1" : "0",
    };
    const serverEntry = resolve(pkgRoot, "server", "index.ts");
    const tsxCli = resolve(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(process.execPath, [tsxCli, serverEntry], { env, stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

program.parseAsync(process.argv);
