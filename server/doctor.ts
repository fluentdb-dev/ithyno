// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Stub implementation of server/doctor.ts for expand-init-to-scaffold-agents.
 *
 * The real implementation is landed by `add-doctor-and-installer`. This stub
 * exports the same interface so the init endpoint compiles and tests pass
 * against realistic fixture data. When `add-doctor-and-installer` lands and
 * is merged, this file will be replaced by the real implementation.
 *
 * Interface contract (matches add-doctor-and-installer's design):
 *   Cli         — union of known agent CLI identifiers
 *   CliStatus   — { installed: boolean; version?: string }
 *   DoctorReport — { agents: Record<Cli, CliStatus>; readyForManager: boolean }
 *   runDoctor() — async function that returns DoctorReport
 */

export type Cli =
  | "claude"
  | "codex"
  | "agy"
  | "copilot"
  | "gemini"
  | "opencode"
  | "cursor";

export type CliStatus = {
  installed: boolean;
  version?: string;
};

export type DoctorReport = {
  agents: Record<Cli, CliStatus>;
  readyForManager: boolean;
};

/** Priority order for choosing the default manager when none is specified. */
export const CLI_PRIORITY: Cli[] = [
  "claude",
  "codex",
  "agy",
  "copilot",
  "gemini",
  "opencode",
  "cursor",
];

/**
 * Stub implementation: checks whether each agent CLI binary is available
 * in PATH. Returns a DoctorReport with the installed status of each CLI.
 *
 * readyForManager is true when at least one CLI is installed.
 *
 * NOTE: This is a stub. The real implementation (add-doctor-and-installer)
 * will also check tmux, agmsg, and other prerequisites, and will report
 * install hints. Replace this file when that change lands.
 */
export async function runDoctor(): Promise<DoctorReport> {
  const { promisify } = await import("node:util");
  const { execFile } = await import("node:child_process");
  const execFileAsync = promisify(execFile);

  async function checkCli(cli: Cli): Promise<CliStatus> {
    try {
      const { stdout } = await execFileAsync(cli, ["--version"], {
        timeout: 3000,
      });
      const version = stdout.trim().split(/\s+/).pop() ?? undefined;
      return { installed: true, version };
    } catch {
      return { installed: false };
    }
  }

  const entries = await Promise.all(
    CLI_PRIORITY.map(async (cli) => [cli, await checkCli(cli)] as const),
  );

  const agents = Object.fromEntries(entries) as Record<Cli, CliStatus>;
  const readyForManager = CLI_PRIORITY.some((cli) => agents[cli].installed);

  return { agents, readyForManager };
}
