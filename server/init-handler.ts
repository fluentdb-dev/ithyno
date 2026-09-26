// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Extracted business logic for POST /api/init
 * (expand-init-to-scaffold-agents).
 *
 * Separating the doctor-gate + manager-pick + agents.yaml write logic from the
 * Fastify handler makes it unit-testable without spinning up the full server.
 */
import { join } from "node:path";
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import type { DoctorReport, Cli } from "./doctor.js";
import { CLI_PRIORITY } from "./doctor.js";
import { gitInit } from "./git/init.js";
import { getGitStatus } from "./git/status.js";

export type InitHandlerInput = {
  dir: string;
  /** Explicit manager command from the request body. */
  managerCommand?: string;
  /** User's saved default (from client-side localStorage, forwarded in body). */
  defaultManager?: string;
  /** Absolute path to the package root (where templates/ lives). */
  pkgRoot: string;
};

export type InitHandlerGateResult =
  | { ok: false; status: 409; error: string; hint: string }
  | { ok: false; status: 400; error: string; installed: Cli[] }
  | { ok: true; chosenCli: Cli };

/**
 * Ensure the lightweight `agentsYamlOnly` preflight has somewhere valid to
 * write. New Project calls this before the streamed initialization chain, so
 * the selected subdirectory may not exist and cannot be assumed to be a Git
 * repository yet.
 */
export async function prepareAgentsYamlTarget(
  dir: string,
  options: { autoCreateDir?: boolean; autoGitInit?: boolean } = {},
): Promise<{ created: boolean; gitInitialized: boolean }> {
  let created = false;
  try {
    const target = await stat(dir);
    if (!target.isDirectory()) throw new Error(`Target is not a directory: ${dir}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Target is not a directory:")) {
      throw err;
    }
    if (!(err instanceof Error) || (err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    if (!options.autoCreateDir) {
      throw new Error(`Target directory does not exist: ${dir}`);
    }
    await mkdir(dir, { recursive: true });
    created = true;
  }

  let gitInitialized = false;
  if (options.autoGitInit) {
    const before = await getGitStatus(dir);
    const after = await gitInit(dir);
    if (!after.isRepo) {
      throw new Error(
        after.reason === "git-missing"
          ? "git binary not found in PATH"
          : `git init did not create a repository at ${dir}`,
      );
    }
    gitInitialized = !before.isRepo;
  }

  return { created, gitInitialized };
}

/**
 * Run the doctor gate and manager resolution. Returns the chosen CLI or an
 * error descriptor (status + body). Does NOT perform the filesystem writes.
 */
export function resolveManagerFromDoctor(
  report: DoctorReport,
  input: Pick<InitHandlerInput, "managerCommand" | "defaultManager">,
): InitHandlerGateResult {
  if (!report.readyForManager) {
    return {
      ok: false,
      status: 409,
      error:
        "No agent CLI is installed. At least one of claude, codex, agy, copilot, gemini, opencode, or cursor must be available.",
      hint: "check ithyno doctor or Settings > Prerequisites",
    };
  }

  const installedClis = CLI_PRIORITY.filter(
    (cli) => report.agents[cli].installed,
  );

  const { managerCommand, defaultManager } = input;

  if (managerCommand !== undefined) {
    if (!installedClis.includes(managerCommand as Cli)) {
      return {
        ok: false,
        status: 400,
        error: `Requested manager CLI '${managerCommand}' is not installed.`,
        installed: installedClis,
      };
    }
    return { ok: true, chosenCli: managerCommand as Cli };
  }

  if (
    defaultManager !== undefined &&
    installedClis.includes(defaultManager as Cli)
  ) {
    return { ok: true, chosenCli: defaultManager as Cli };
  }

  // First installed by priority order
  return { ok: true, chosenCli: installedClis[0] };
}

/**
 * Write `agents.yaml` from the template. On failure, rolls back
 * `<dir>/openspec/` and rethrows.
 */
export async function writeAgentsYaml(
  dir: string,
  managerCommand: Cli,
  pkgRoot: string,
): Promise<void> {
  const tmplPath = join(pkgRoot, "templates", "agents.yaml.tmpl");
  const agentsYamlPath = join(dir, "agents.yaml");
  let tmpl: string;
  try {
    tmpl = await readFile(tmplPath, "utf8");
  } catch (err) {
    // Roll back
    await rm(join(dir, "openspec"), { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `Failed to read agents.yaml template: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const content = tmpl.replaceAll("{{MANAGER_COMMAND}}", managerCommand);
  try {
    await writeFile(agentsYamlPath, content, "utf8");
  } catch (err) {
    // Roll back
    await rm(join(dir, "openspec"), { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `Failed to write agents.yaml: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
