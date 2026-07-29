// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Doctor module — enumerates prerequisite CLIs and infrastructure tools.
 *
 * Exported types are stable; sibling changes (expand-init-to-scaffold-agents,
 * enable-import-both-patterns) import { runDoctor } from "./doctor.js".
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveGitBash } from "./util/resolve-git-bash.js";
import { commandExistsOnPath } from "./sync/pty.js";

// ---------------------------------------------------------------------------
// Types (exported — used by server/index.ts and external callers)
// ---------------------------------------------------------------------------

export type Cli =
  | "claude"
  | "codex"
  | "agy"
  | "copilot"
  | "gemini"
  | "opencode"
  | "cursor"
  | "antigravity";

/** Priority order for default-Manager selection (highest priority first).
 *  Mirrors web/src/types.ts. Excludes antigravity — same policy as the
 *  server's readyForManager gate. Consumed by init-handler.ts's
 *  resolveManagerFromDoctor(). */
export const CLI_PRIORITY: Cli[] = [
  "claude",
  "codex",
  "agy",
  "copilot",
  "gemini",
  "opencode",
  "cursor",
];

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
  /** Windows only — distinguishes a real Git Bash install from the
   *  platform's WSL launcher stubs (System32 / WindowsApps bash.exe),
   *  both of which satisfy a bare PATH check without being Git Bash.
   *  Omitted on macOS/Linux (no equivalent ambiguity there). See
   *  add-doctor-and-installer §8 / add-windows-agmsg-support. */
  gitBash?: CliStatus;
  /** true when at least one agent CLI has installed === true */
  readyForManager: boolean;
  /** ISO timestamp of when the check was performed */
  checkedAt: string;
};

// ---------------------------------------------------------------------------
// Agent CLI definitions (priority order as specified in proposal)
// ---------------------------------------------------------------------------

type CliDef = {
  key: Cli;
  cmd: string;
  versionArg: string;
};

const AGENT_CLIS: CliDef[] = [
  { key: "claude", cmd: "claude", versionArg: "--version" },
  { key: "codex", cmd: "codex", versionArg: "--version" },
  { key: "agy", cmd: "agy", versionArg: "--version" },
  { key: "copilot", cmd: "copilot", versionArg: "--version" },
  { key: "gemini", cmd: "gemini", versionArg: "--version" },
  { key: "opencode", cmd: "opencode", versionArg: "--version" },
  { key: "cursor", cmd: "cursor", versionArg: "--version" },
  // antigravity is an alias — agy is the primary command
  { key: "antigravity", cmd: "agy", versionArg: "version" },
];

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Run `<cmd> <versionArg>` in a bounded subprocess (2 s timeout).
 * Parses the first version-like token from stdout. Resolves the absolute
 * path via `which <cmd>`.
 */
export async function checkCommand(
  cmd: string,
  versionArg: string,
): Promise<CliStatus> {
  return new Promise((resolve) => {
    const timeout = 2000;

    // Resolve the path first (via `which`), then run the version command.
    // Both operations share the same 2 s budget.
    let settled = false;
    // whichProc is assigned just below; settle() references it via closure.
    // Calling kill() after the process has already exited is a safe no-op.
    let whichProc: ReturnType<typeof spawn> | undefined;
    const settle = (result: CliStatus) => {
      if (settled) return;
      settled = true;
      // Kill the still-running `which` subprocess so it does not write to
      // resolvedPath after this Promise has resolved (F1 fix).
      try { whichProc?.kill(); } catch { /* ignore */ }
      resolve(result);
    };

    // Spawn `which <cmd>` to get the path
    let resolvedPath: string | undefined;

    // Note: `which` is not available on Windows (the equivalent is `where`).
    // The error handler below silently ignores ENOENT, so resolvedPath remains
    // undefined on Windows — only the path field in the report is affected (F4).
    whichProc = spawn("which", [cmd], { stdio: ["ignore", "pipe", "ignore"] });
    let whichOut = "";
    whichProc.stdout?.on("data", (d: Buffer) => {
      whichOut += d.toString();
    });
    whichProc.on("error", () => {
      // `which` not available (e.g., Windows) — skip path resolution
    });
    whichProc.on("close", (code) => {
      if (code === 0 && whichOut.trim()) {
        resolvedPath = whichOut.trim();
      }
    });

    // Spawn the actual version command
    const child = spawn(cmd, [versionArg], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      settle({ installed: false, error: "timeout" });
    }, timeout);

    child.on("error", (err) => {
      clearTimeout(timer);
      // ENOENT = not found on PATH
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        settle({ installed: false });
      } else {
        settle({ installed: false, error: err.message });
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        // Some CLIs (like `cursor`) exit non-zero for --version. If there's
        // stdout content we still treat it as installed.
        const combined = stdout.trim() || stderr.trim();
        if (!combined) {
          settle({ installed: false, error: `exit code ${code}` });
          return;
        }
      }
      const combined = stdout.trim() || stderr.trim();
      const version = parseVersion(combined);
      settle({ installed: true, version, path: resolvedPath });
    });
  });
}

/** Extract the first semver-like token from a string. */
function parseVersion(output: string): string | undefined {
  // Match patterns like: v1.2.3, 1.2.3, 1.2.3-beta.1
  const match = output.match(/v?(\d+\.\d+[\w.-]*)/);
  return match ? match[0] : (output.split(/\s+/)[0] || undefined);
}

/**
 * Windows only — distinguishes a real Git Bash install from the
 * platform's WSL launcher stubs. See DoctorReport.gitBash doc comment.
 */
function checkGitBash(): CliStatus {
  const path = resolveGitBash();
  if (path) return { installed: true, path };
  return {
    installed: false,
    error:
      "Only a WSL launcher stub was found on PATH (or git itself is missing) — install Git for Windows to get a real Git Bash.",
  };
}

/**
 * Check agmsg presence via file existence (not a CLI). Looks for
 * `~/.agents/skills/agmsg/scripts/send.sh`.
 *
 * On Windows, file presence alone isn't enough — agmsg also needs a
 * real Git Bash and `sqlite3` on PATH to actually run (see
 * add-windows-agmsg-support). A prior copy that "succeeded" at the
 * file level is still reported as unavailable when either dependency
 * is missing, so the report reflects runtime readiness, not just
 * whether bytes were once copied.
 */
function checkAgmsg(gitBash: CliStatus | undefined): CliStatus {
  const marker = join(homedir(), ".agents", "skills", "agmsg", "scripts", "send.sh");
  const markerExists = existsSync(marker);

  if (process.platform === "win32") {
    const missing: string[] = [];
    if (!gitBash?.installed) missing.push("Git Bash");
    if (!commandExistsOnPath("sqlite3")) missing.push("sqlite3");
    if (missing.length > 0) {
      return {
        installed: false,
        error: markerExists
          ? `agmsg files are present but cannot run — missing: ${missing.join(", ")}`
          : `missing: ${missing.join(", ")}`,
      };
    }
  }

  if (markerExists) {
    return { installed: true, path: join(homedir(), ".agents", "skills", "agmsg") };
  }
  return { installed: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all checks in parallel and return a DoctorReport.
 * This is the main export consumed by the HTTP endpoint, CLI subcommand,
 * and sibling changes (expand-init-to-scaffold-agents, enable-import-both-patterns).
 */
export async function runDoctor(): Promise<DoctorReport> {
  const agentDefs = AGENT_CLIS;

  // Run all agent CLI checks + tmux in parallel
  const [agentResults, tmuxResult] = await Promise.all([
    Promise.all(agentDefs.map((def) => checkCommand(def.cmd, def.versionArg))),
    checkCommand("tmux", "-V"),
  ]);

  const agents: Record<Cli, CliStatus> = {} as Record<Cli, CliStatus>;
  for (let i = 0; i < agentDefs.length; i++) {
    agents[agentDefs[i].key] = agentResults[i];
  }

  const gitBashResult = process.platform === "win32" ? checkGitBash() : undefined;
  const agmsgResult = checkAgmsg(gitBashResult);

  // readyForManager: at least one NAMED agent CLI is installed.
  // "antigravity" is excluded because it is an alias for "agy" (same binary);
  // including it would double-count the same installation (F3 fix).
  const AGENT_KEYS: Cli[] = ["claude", "codex", "agy", "copilot", "gemini", "opencode", "cursor"];
  const readyForManager = AGENT_KEYS.some((k) => agents[k]?.installed === true);

  return {
    agents,
    tmux: tmuxResult,
    agmsg: agmsgResult,
    ...(gitBashResult ? { gitBash: gitBashResult } : {}),
    readyForManager,
    checkedAt: new Date().toISOString(),
  };
}
