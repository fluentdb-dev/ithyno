#!/usr/bin/env node
// CLI entry. Two modes:
//   - default (no subcommand): start the dashboard server via tsx
//   - `init [dir]`           : scaffold a target project (pure JS handler)
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { runInit } from "./init.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

const program = new Command();
program.name("openspec-ui").description("Local progress dashboard for OpenSpec");

// `init` subcommand: scaffold a target project.
program
  .command("init [dir]")
  .description(
    "Scaffold the project-side files OpenSpec UI expects (CLAUDE.md, skill, agents.yaml.example, docs/, .gitignore)",
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

// Default action: start the dashboard. Keeps the original flags so existing
// invocations (`openspec-ui --dir ... --port ...`) continue to work.
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
      OPENSPEC_PROJECT_ROOT: resolve(opts.dir),
      OPENSPEC_OPEN: opts.open ? "1" : "0",
    };
    const serverEntry = resolve(pkgRoot, "server", "index.ts");
    const tsxBin = resolve(pkgRoot, "node_modules", ".bin", "tsx");
    const child = spawn(tsxBin, [serverEntry], { env, stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

program.parseAsync(process.argv);
