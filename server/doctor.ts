// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Doctor module — STUB for enable-import-both-patterns.
 *
 * The real implementation is provided by the `add-doctor-and-installer`
 * change running in parallel. This stub exposes the same interface so the
 * Import endpoint can call `runDoctor()` without a hard dependency on the
 * other worktree. When the two branches are merged this file should be
 * replaced by the real `server/doctor.ts` from `add-doctor-and-installer`.
 *
 * See outcome.md for the stub rationale.
 */

export type Cli =
  | "claude"
  | "codex"
  | "agy"
  | "copilot"
  | "gemini"
  | "opencode"
  | "cursor"
  | "antigravity";

export type CliStatus = {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
};

export type DoctorReport = {
  agents: Record<Cli, CliStatus>;
  tmux: CliStatus;
  agmsg: CliStatus;
  /** true when at least one agent CLI has installed === true */
  readyForManager: boolean;
  /** ISO timestamp of when the check was performed */
  checkedAt: string;
};

/**
 * Stub implementation: checks only whether `claude` is available on PATH.
 * Sufficient for the 409 gate on the Import endpoint. The real implementation
 * from `add-doctor-and-installer` checks all known agent CLIs in parallel.
 */
export async function runDoctor(): Promise<DoctorReport> {
  const { spawn } = await import("node:child_process");

  const claudeStatus = await new Promise<CliStatus>((resolve) => {
    const child = spawn("claude", ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 2000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      resolve({ installed: false, error: "timeout" });
    }, 2000);
    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        resolve({ installed: false });
      } else {
        resolve({ installed: false, error: (err as Error).message });
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const combined = stdout.trim() || stderr.trim();
      if (!combined && code !== 0) {
        resolve({ installed: false, error: `exit code ${code}` });
      } else {
        resolve({ installed: true });
      }
    });
  });

  const notInstalled: CliStatus = { installed: false };
  const agents: Record<Cli, CliStatus> = {
    claude: claudeStatus,
    codex: notInstalled,
    agy: notInstalled,
    copilot: notInstalled,
    gemini: notInstalled,
    opencode: notInstalled,
    cursor: notInstalled,
    antigravity: notInstalled,
  };

  return {
    agents,
    tmux: notInstalled,
    agmsg: notInstalled,
    readyForManager: claudeStatus.installed,
    checkedAt: new Date().toISOString(),
  };
}
