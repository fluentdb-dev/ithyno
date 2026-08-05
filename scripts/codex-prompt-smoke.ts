// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runNewProjectChain } from "../bin/new-project-chain.js";
import { installSkills } from "../server/skill-renderer/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const invocation = 'openspec-propose "test function helloworld"';

if (process.env.RUN_CODEX_PROMPT_E2E !== "1") {
  console.error("Codex prompt-discovery smoke is disabled. Set RUN_CODEX_PROMPT_E2E=1 to run it.");
  process.exitCode = 2;
} else {
  const projectRoot = await mkdtemp(join(tmpdir(), "ithyno-codex-prompt-smoke-"));
  try {
    const chainEvents: Array<{ type: string; message?: string; line?: string; stream?: string }> = [];
    const initialized = await runNewProjectChain(projectRoot, (event) => {
      chainEvents.push(event);
    }, {
      managerCli: "codex",
      // Use the repository's declared OpenSpec version. The live contract
      // under test is Codex discovery/invocation, not npm registry access.
      spawnImpl: async (command, args, cwd, _step, _onEvent, extraEnv = {}) => {
        if (command === "npm") return { ok: true, code: 0, message: "" };
        const openspec = join(repoRoot, "node_modules", ".bin", "openspec");
        const result = await new Promise<{ code: number | null; stderr: string }>((resolveRun, reject) => {
          const child = spawn(openspec, args.slice(1), {
            cwd,
            env: { ...process.env, ...extraEnv },
            stdio: ["ignore", "ignore", "pipe"],
          });
          let stderr = "";
          child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
          child.on("error", reject);
          child.on("close", (code) => resolveRun({ code, stderr }));
        });
        return {
          ok: result.code === 0,
          code: result.code ?? -1,
          message: result.code === 0 ? "" : result.stderr,
        };
      },
    });
    if (!initialized.ok) {
      const detail = chainEvents
        .filter((event) => event.type === "error" || event.stream === "stderr")
        .map((event) => event.message ?? event.line)
        .filter(Boolean)
        .join("\n");
      throw new Error(`New Project chain failed${detail ? `:\n${detail}` : ""}`);
    }

    const installed = await installSkills({
      projectRoot,
      selectedClis: ["codex"],
      sourcesDir: join(repoRoot, "ithyno", "skills"),
    });
    if (installed.errors.length > 0) {
      throw new Error(installed.errors.map((error) => error.message).join("; "));
    }
    const promptPath = join(projectRoot, ".codex", "prompts", "openspec-propose.md");
    if (!existsSync(promptPath)) throw new Error("openspec-propose.md was not initialized");

    const before = new Set(await readdir(join(projectRoot, "openspec", "changes")).catch(() => []));
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolveRun, reject) => {
      const child = spawn("codex", ["exec", invocation], {
        cwd: projectRoot,
        env: {
          ...process.env,
          PATH: `${join(repoRoot, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
      child.on("error", reject);
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 180_000);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolveRun({ code, stdout, stderr, timedOut });
      });
    });
    if (result.timedOut) throw new Error(`Codex timed out\n${result.stderr}`);
    if (result.code !== 0) throw new Error(`Codex exited ${result.code}\n${result.stderr}`);

    const after = await readdir(join(projectRoot, "openspec", "changes")).catch(() => []);
    const created = after.filter((name) => !before.has(name) && name !== "archive");
    if (created.length === 0) {
      throw new Error(`Exact invocation produced no OpenSpec change.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
    console.log(JSON.stringify({ ok: true, invocation, created }, null, 2));
  } finally {
    await rm(projectRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
