// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Doctor module — enumerates prerequisite CLIs and infrastructure tools.
 *
 * Exported types are stable; sibling changes (expand-init-to-scaffold-agents,
 * enable-import-both-patterns) import { runDoctor } from "./doctor.js".
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveGitBash } from "./util/resolve-git-bash.js";
import { commandExistsOnPath } from "./sync/pty.js";

/**
 * Kill `pid` and, on Windows, its whole descendant tree. Plain
 * `child.kill()` only signals the immediate process — when that
 * process was spawned with `shell: true` (as checkCommand's version
 * check is, on win32), the immediate process IS cmd.exe, and killing
 * cmd.exe does NOT kill whatever it exec'd (the actual CLI). Confirmed
 * live: checkCommand's 2s-timeout kill only ever killed the cmd.exe
 * wrapper, leaving the real `agy` process running in the background on
 * every check that didn't exit in time — repeated doctor runs across a
 * dev/test session leaked dozens of orphaned processes. `taskkill /t`
 * kills the full process tree; POSIX doesn't have this gap (no shell
 * wrapper involved there) so a plain signal is enough.
 */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", timeout: 3000 });
    } catch {
      /* ignore */
    }
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

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
  /** All platforms. Required for worktree-based dispatch, `git init`,
   *  and every commit the agent runner makes — not installable from
   *  this panel, just surfaced so a missing Git fails loudly here
   *  instead of opaquely deep inside a worktree operation. */
  git: CliStatus;
  /** All platforms. Checked because a packaged Electron build bundles
   *  its OWN internal Node for running ithyno itself, but every
   *  external subprocess ithyno spawns (`git`, `npm`, `npx` for the
   *  New Project flow, etc.) relies on a SEPARATE system-wide Node/npm
   *  install being on PATH — the bundled one isn't exposed for that.
   *  A user who installs the packaged app without also having Node
   *  installed would otherwise hit ENOENT deep inside New Project with
   *  no indication why. */
  node: CliStatus;
  /** macOS-only helper used for clickable desktop notifications. */
  alerter?: CliStatus;
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
/**
 * Resolve `cmd`'s absolute path via `which` (POSIX) / `where` (Windows).
 * Returns undefined if not found or the probe itself isn't on PATH.
 */
function resolveCommandPath(cmd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const proc = spawn(whichCmd, [cmd], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    proc.on("error", () => resolve(undefined));
    proc.on("close", (code) => {
      // `where` can print multiple matches (one per line, e.g. both a
      // .cmd shim and a .exe) — the first is its own preferred match.
      resolve(code === 0 && out.trim() ? out.trim().split(/\r?\n/)[0] : undefined);
    });
  });
}

export async function checkCommand(
  cmd: string,
  versionArg: string,
): Promise<CliStatus> {
  const timeout = 2000;

  // Resolve the path FIRST and only spawn the version command if the
  // probe actually found something. This has to happen sequentially,
  // not just for the `path` field: on Windows the version command runs
  // with shell: true (see below), and cmd.exe does NOT surface a
  // nonexistent command as a spawn-level ENOENT the way a direct spawn
  // does — it starts fine and just prints "... is not recognized as an
  // internal or external command" to stderr with a nonzero exit code.
  // The exit-code handling below treats "nonzero exit + any stderr
  // content" as installed (some real CLIs, e.g. cursor, exit nonzero
  // for --version but still print a version to stderr) — so without
  // this upfront existence check, that same leniency turns cmd.exe's
  // own "not found" message into a false "installed: true" for
  // anything that doesn't exist (caught by this file's own test suite).
  const resolvedPath = await resolveCommandPath(cmd);
  if (!resolvedPath) {
    return { installed: false };
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: CliStatus) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // Spawn the actual version command. shell: true on win32 — these
    // CLIs (claude, agy, codex, etc.) are npm-installed and exposed as
    // .cmd shims on Windows, not .exe; spawn() without a shell doesn't
    // resolve .cmd files and fails with ENOENT, which the error handler
    // below (correctly, in isolation) reports as "not installed" — so
    // an actually-installed CLI silently never showed up in the doctor
    // report on Windows, even though it ran fine from a real prompt.
    //
    // No `timeout` option here (deliberately) — spawn()'s own built-in
    // timeout kills via a plain child.kill(), which has the exact same
    // tree-kill gap as described on killTree() above, and racing it
    // against our own timer below only risks the native one firing
    // first and marking this settled before killTree() ever runs. One
    // timeout mechanism, with the tree-aware kill, below.
    const child = spawn(cmd, [versionArg], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
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
      killTree(child.pid);
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

  // Run all agent CLI checks + tmux + git + node in parallel
  const [agentResults, tmuxResult, gitResult, nodeResult, alerterResult] = await Promise.all([
    Promise.all(agentDefs.map((def) => checkCommand(def.cmd, def.versionArg))),
    checkCommand("tmux", "-V"),
    checkCommand("git", "--version"),
    checkCommand("node", "--version"),
    process.platform === "darwin" ? checkCommand("alerter", "--version") : Promise.resolve(undefined),
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
    git: gitResult,
    node: nodeResult,
    ...(alerterResult ? { alerter: alerterResult } : {}),
    readyForManager,
    checkedAt: new Date().toISOString(),
  };
}
