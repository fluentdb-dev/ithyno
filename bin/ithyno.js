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
      timeout: 2000,
    });
    for (const line of output.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.slice(0, idx);
        const val = line.slice(idx + 1);
        if (
          key === "PATH" ||
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
// CLI entry. Two modes:
//   - default (no subcommand): start the dashboard server via tsx
//   - `init [dir]`           : scaffold a target project (pure JS handler)
//   - `doctor`               : check prerequisites (add-doctor-and-installer)
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { runInit } from "./init.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

const program = new Command();
program.name("ithyno").description("ithyno — local dashboard for the OpenSpec workflow");

// `init` subcommand: scaffold a target project.
program
  .command("init [dir]")
  .description(
    "Scaffold the project-side files ithyno expects (CLAUDE.md, skill, agents.yaml.example, docs/, .gitignore)",
  )
  .option("-f, --force", "overwrite existing files instead of skipping them")
  .option("--no-gitignore", "do not modify the target .gitignore")
  .option("-q, --quiet", "minimal output (errors only)")
  .action(async (dir, opts) => {
    const res = await runInit({
      targetDir: dir,
      force: !!opts.force,
      // commander negates `--no-gitignore` to `opts.gitignore === false`
      skipGitignore: opts.gitignore === false,
      quiet: !!opts.quiet,
    });
    if (!res.ok) {
      console.error(`✗ ${res.reason}`);
      process.exit(res.exitCode);
    }
    process.exit(0);
  });

// `doctor` subcommand: check prerequisites (add-doctor-and-installer).
// Runs runDoctor() via tsx (so the TS module is available without a build step)
// and prints a human-readable table. Exit 0 when readyForManager, 1 otherwise.
program
  .command("doctor")
  .description("Check prerequisite CLIs and tools (agent CLIs, tmux, agmsg)")
  .option("--json", "emit raw DoctorReport JSON instead of a human-readable table")
  .action((opts) => {
    const tsxCli = resolve(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs");
    // _doctor-runner.ts lives next to ithyno.js in bin/
    const doctorRunner = resolve(pkgRoot, "bin", "_doctor-runner.ts");
    const args = [tsxCli, doctorRunner];
    if (opts.json) args.push("--json");
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 1));
  });

// Default action: start the dashboard.
program
  .option("-p, --port <number>", "port to listen on", "4321")
  .option(
    "-d, --dir <path>",
    "path to the OpenSpec project root (containing openspec/)",
    process.cwd(),
  )
  .option("--no-open", "do not open the browser automatically")
  .action((opts) => {
    const env = {
      ...process.env,
      PORT: String(opts.port),
      ITHYNO_PROJECT_ROOT: resolve(opts.dir),
      ITHYNO_OPEN: opts.open ? "1" : "0",
    };
    const serverEntry = resolve(pkgRoot, "server", "index.ts");
    // Spawn tsx via its cli.mjs directly rather than `.bin/tsx`: vsce/pkg
    // packaging tools replace `.bin` symlinks with copies, which breaks the
    // relative sibling imports inside cli.mjs when it's copied outside its
    // dist/. cli.mjs itself resolves its neighbors correctly, so pointing at
    // it works both in dev and in packaged distributions.
    const tsxCli = resolve(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(process.execPath, [tsxCli, serverEntry], { env, stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

program.parseAsync(process.argv);
