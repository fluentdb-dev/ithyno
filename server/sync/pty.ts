// SPDX-License-Identifier: GPL-3.0-or-later
// PTY bridge: spawns a real shell in a pseudo-terminal and pipes bytes
// to/from a browser xterm.js session over a dedicated WebSocket.
//
// Loaded lazily so the dashboard still starts if the native module fails to
// build/install (feature detection — see /api/health).

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { WebSocket } from "ws";
import type { AgentRegistry } from "../agents/registry.js";
import { hasAgentsYaml } from "../agents/registry.js";
import { SESSION_TOKEN } from "../util/auth.js";

export type PtyAvailability =
  | { available: true; module: any }
  | { available: false; reason: string };

let cached: PtyAvailability | null = null;

export async function loadPty(): Promise<PtyAvailability> {
  if (cached) return cached;
  try {
    const mod = await import("@homebridge/node-pty-prebuilt-multiarch");
    cached = { available: true, module: mod };
  } catch (err) {
    cached = {
      available: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  return cached;
}

/**
 * Windows resolves a bare filename like "pwsh.exe" only via `CreateProcess`'s
 * own PATH search, which ConPTY does not perform ahead of time — spawning a
 * shell that isn't actually on PATH throws "File not found" from node-pty's
 * native binding instead of falling back. `where` mirrors that PATH search
 * without spawning anything, so we can check first and fall back in JS.
 * POSIX has no `where` — use `which` there, same idea. Neither tool is
 * guaranteed on PATH itself (e.g. a plain PowerShell session has no `which`
 * even with Git for Windows installed, since only `Git\cmd` is added to
 * PATH, not `Git\usr\bin`), so a spawn failure just means "not found".
 */
export function commandExistsOnPath(cmd: string): boolean {
  try {
    const probe = process.platform === "win32" ? "where" : "which";
    // timeout: spawnSync has none by default; bound it so a stalled probe
    // degrades to "not found" instead of hanging the caller (this is now
    // also called from doctor.ts / the doctor install endpoint, not just
    // PTY startup).
    return spawnSync(probe, [cmd], { stdio: "ignore", timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

/** Pick a sensible default shell + args per platform. */
export function defaultShell(): { cmd: string; args: string[] } {
  if (process.env.ITHYNO_SHELL) {
    return { cmd: process.env.ITHYNO_SHELL, args: [] };
  }
  if (process.platform === "win32") {
    // Prefer pwsh.exe (PowerShell 7+) when on PATH; fall back to powershell.exe.
    const cmd = commandExistsOnPath("pwsh.exe") ? "pwsh.exe" : "powershell.exe";
    return { cmd, args: [] };
  }
  const sh = process.env.SHELL ?? "/bin/bash";
  return { cmd: sh, args: [] };
}

/**
 * Cache for `hasTmux()`. `null` = uncached; boolean = last probe result.
 * Reset only via `_setTmuxCacheForTest()` (test-only override).
 */
let tmuxCache: boolean | null = null;

/** Is the `tmux` binary on `PATH`? Probes once, caches. Consulted by
 *  `ptyStartup()` when the workspace has an `agmsg:` block configured.
 *  Landed by wrap-embedded-pty-in-tmux. */
export function hasTmux(): boolean {
  if (tmuxCache !== null) return tmuxCache;
  tmuxCache = commandExistsOnPath("tmux");
  return tmuxCache;
}

/** Test-only: override `hasTmux()`'s cached value. Pass `null` to reset
 *  and re-probe on next call. Not part of the public API. */
export function _setTmuxCacheForTest(v: boolean | null): void {
  tmuxCache = v;
}

/**
 * Command auto-launched inside a freshly-spawned PTY, plus an optional
 * `initialInput` line the caller writes after the command settles.
 *
 * Priority (add-manager-agent-config):
 *   1. `registry.managerAgent()` — the first `role: manager` entry
 *      from agents.yaml. Its command / args form the startup line;
 *      its `initialInput` (if set) is auto-injected after.
 *   2. `ITHYNO_TERMINAL_STARTUP` env var — treated as a single shell
 *      string. Backward compat with the pre-manager-config setup.
 *   3. Per-project Claude Code session id fallback. When neither
 *      priority 1 nor 2 supplies a command AND a `projectRoot` is
 *      known (typical: `attachPtyToSocket` was called with cwd =
 *      project root), ithyno reads / mints a UUID at
 *      `<projectRoot>/.ithyno/session-id` and picks:
 *        - `claude --session-id <uuid>` on first launch (file
 *          missing or empty — mints a fresh UUID and writes it),
 *          which tells Claude Code to create a fresh conversation
 *          with that specific id.
 *        - `claude --resume <uuid>` on subsequent launches (file
 *          present, non-empty), resuming the previously-minted
 *          session.
 *      MUST NOT emit `--continue` — its opaque "most recent" pick
 *      errors on a truly fresh project. When no `projectRoot` is
 *      known (older callers), falls back to plain `claude`.
 *      Landed by pty-startup-uses-project-session-id (2026-07-19).
 *
 * An empty `startup` string disables auto-launch (raw shell).
 *
 * When tmux is *enabled* — `registry.tmux()` is `true`, OR
 * `registry.agmsg()` is non-null (workspace opted into the
 * PTY→tmux→agmsg flavor via `add-agmsg-config-block`) — the resolved
 * manager command is further wrapped in
 * `tmux new-session -A -s <name> -- <cmd> <args…>` where `<name>` is
 * `$ITHYNO_TMUX_SESSION` when set (non-empty) else `ithyno`. `agmsg`
 * being configured implies tmux unconditionally (there is no way to
 * configure agmsg without tmux); the `tmux` toggle is independent and
 * lets a project use tmux without agmsg. When `tmux` is not on `PATH`
 * the wrap is skipped and the startup line becomes a `printf`-based
 * fallback banner; `initialInput` is suppressed in the fallback since
 * the manager isn't running. See wrap-embedded-pty-in-tmux and
 * decouple-tmux-from-agmsg.
 */
/**
 * Read `<projectRoot>/.ithyno/session-claude` and pick the
 * corresponding Claude startup line. Mints a fresh UUID (and writes
 * the file) on first launch or when the file is missing / empty.
 * Returns plain `claude` when no `projectRoot` is available (older
 * callers, tests).
 *
 * Landed by pty-startup-uses-project-session-id (2026-07-19).
 * Renamed + per-CLI split by the Manager-args cleanup that removed the
 * bogus `args: [--continue]` template default: session-id semantics
 * are Claude-only (Codex/Copilot/etc have their own resume flags), so
 * naming and storage now say "claude" explicitly. The legacy
 * `.ithyno/session-id` file (Claude-only from day one) is still read
 * as fallback for existing dev environments.
 */
function resolveClaudeSessionStartup(projectRoot: string | undefined): string {
  if (!projectRoot) return "claude";
  const idPath = join(projectRoot, ".ithyno", "session-claude");
  const legacyPath = join(projectRoot, ".ithyno", "session-id");
  let uuid = "";
  for (const p of [idPath, legacyPath]) {
    if (!existsSync(p)) continue;
    try {
      uuid = readFileSync(p, "utf8").trim();
    } catch {
      /* fall through */
    }
    if (uuid) break;
  }
  if (uuid) {
    return `claude --resume ${shellQuote(uuid)}`;
  }
  // First launch (or empty/corrupt file): mint + write + create.
  const fresh = randomUUID();
  try {
    mkdirSync(dirname(idPath), { recursive: true });
    writeFileSync(idPath, `${fresh}\n`);
  } catch {
    /* if the write fails we still return the session-id line — Claude
     * will create the conversation, we just won't be able to resume
     * next time. Better than a broken shell. */
  }
  return `claude --session-id ${shellQuote(fresh)}`;
}

/**
 * Per-CLI startup strategy for Manager PTY spawn.
 *
 * Each strategy takes an optional `projectRoot` and returns the exact
 * shell line to launch that CLI as Manager. Missing entries fall back
 * to plain `<cli>` (safe first-launch default for any CLI, no
 * session resume).
 *
 * Adding session persistence for a new CLI = add its strategy here.
 * The picker's "(unverified)" label in InitDialog SHALL be dropped for a
 * CLI once its strategy is landed AND the dispatch skill resolves in
 * that CLI's command surface.
 */
type ManagerStartupStrategy = (projectRoot: string | undefined) => string;

const MANAGER_STARTUP_STRATEGIES: Readonly<Record<string, ManagerStartupStrategy>> = {
  claude: resolveClaudeSessionStartup,
  // codex/copilot/gemini/agy/opencode/cursor: no strategy yet — plain
  // command via resolveManagerStartup fallback. Each CLI's session
  // resume mechanism is a separate follow-up (research per CLI).
};

/** Resolve the startup line for a Manager CLI. Uses the CLI's registered
 *  strategy when available, otherwise plain command (safe first-launch
 *  default). Exported for tests. */
export function resolveManagerStartup(
  command: string,
  projectRoot: string | undefined,
): string {
  const strategy = MANAGER_STARTUP_STRATEGIES[command];
  if (strategy) return strategy(projectRoot);
  return command;
}

export function ptyStartup(
  registry: AgentRegistry | null,
  projectRoot?: string,
): {
  startup: string;
  initialInput?: string;
} {
  const manager = registry?.managerAgent() ?? null;
  const agmsg = registry?.agmsg() ?? null;
  const tmuxConfig = registry?.tmux();
  // Explicit tmux boolean (true/false) takes precedence over agmsg.
  // Omitted (undefined) defaults to agmsg !== null.
  const tmuxEnabled = tmuxConfig !== undefined ? tmuxConfig : agmsg !== null;

  let baseStartup: string;
  let initialInput: string | undefined;
  if (manager && manager.command) {
    const args = manager.args ?? [];
    if (args.length === 0) {
      // Empty args → defer to per-CLI Manager startup strategy
      // (Claude gets --session-id mint / --resume; other CLIs get
      // plain command as safe first-launch default). Explicit args in
      // agents.yaml override this smart resolver.
      baseStartup = resolveManagerStartup(manager.command, projectRoot);
    } else {
      baseStartup = [manager.command, ...args.map(shellQuote)].join(" ");
    }
    initialInput = manager.initialInput;
  } else {
    const v = process.env.ITHYNO_TERMINAL_STARTUP;
    if (v !== undefined) {
      baseStartup = v;
    } else {
      // Priority 3: per-project Claude session UUID (legacy no-manager path).
      // See doc comment above.
      baseStartup = resolveClaudeSessionStartup(projectRoot);
    }
    initialInput = undefined;
  }

  if (!tmuxEnabled) {
    return initialInput === undefined
      ? { startup: baseStartup }
      : { startup: baseStartup, initialInput };
  }

  // tmux enabled (via agmsg or the tmux toggle) — wrap in tmux (or fall back with a banner).
  if (!hasTmux()) {
    return { startup: tmuxMissingFallback() };
  }
  if (!baseStartup) {
    // Empty startup means "raw shell" — nothing to hand to tmux;
    // keep the raw-shell behavior even under agmsg configuration.
    return initialInput === undefined
      ? { startup: baseStartup }
      : { startup: baseStartup, initialInput };
  }
  const session = process.env.ITHYNO_TMUX_SESSION || tmuxSessionName(projectRoot);
  const startup = `tmux new-session -A -s ${shellQuote(session)} -- ${baseStartup}`;
  return initialInput === undefined
    ? { startup }
    : { startup, initialInput };
}

/**
 * Derive the default tmux session name for a project root.
 *
 * Per-project (rather than global "ithyno") so that opening ithyno for
 * two different projects — sequentially or concurrently — creates two
 * distinct tmux sessions. With the `-A` flag on
 * `tmux new-session -A -s <name>`, a global name causes the second
 * instance to attach to the first's pane instead of creating a fresh
 * one, contaminating the second dashboard with the first's cwd.
 * See scope-tmux-session-name-per-project (2026-07-30).
 *
 * Falls back to the legacy literal `"ithyno"` when no `projectRoot`
 * is supplied (test callers, older invocations without a resolved
 * root) so behavior does not change out from under such callers.
 * `ITHYNO_TMUX_SESSION` env var override takes precedence at the
 * call site.
 */
export function tmuxSessionName(projectRoot?: string): string {
  if (!projectRoot) return "ithyno";
  const hash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
  return `ithyno-${hash}`;
}

function tmuxMissingFallback(): string {
  const line1 = "\\n\\u26a0\\ufe0f  tmux is enabled (agmsg or tmux: true in agents.yaml) but tmux was not found on PATH.";
  const line2 = "Install tmux (brew install tmux on macOS, apt/pacman/dnf on Linux) and reopen";
  const line3 = "the Terminal panel, or remove the agmsg: block / tmux: true to fall back to direct spawn.\\n";
  return `printf '${line1}\\n${line2}\\n${line3}\\n'`;
}

/** Wrap `s` in single quotes when it contains characters a shell would
 *  interpret. Kept intentionally minimal — the manager agent's args
 *  are usually clean flags like `--continue`. */
function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9._\-/:@=]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Append the platform's "submit this line" sequence to a string being
 *  written into a PTY. A bare `\r` reliably submits on macOS/Linux, but
 *  on Windows the shells this project targets (PowerShell's PSReadLine,
 *  and Claude Code's own input handling when running under ConPTY /
 *  psmux-wrapped tmux) don't reliably treat a lone `\r` as Enter — the
 *  text appears at the prompt but the line is never submitted. `\r\n`
 *  works in both cases, so it's only worth branching to avoid changing
 *  already-verified POSIX behavior. Used by every auto-launch / inject
 *  site below — keep them all going through this helper rather than
 *  re-adding a bare `"\r"` at a new call site later.*/
function withEnter(s: string): string {
  return process.platform === "win32" ? `${s}\r\n` : `${s}\r`;
}

type ClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

// Registry of live PTY sessions. The last entry is the most recently active
// terminal — that's what /api/pty/inject writes to.
type LiveTerminal = { term: any; ws: WebSocket; cwd: string };
const live: LiveTerminal[] = [];

function bump(entry: LiveTerminal): void {
  const i = live.indexOf(entry);
  if (i >= 0 && i !== live.length - 1) {
    live.splice(i, 1);
    live.push(entry);
  }
}

export function injectIntoActive(data: string, terminate: boolean):
  | { ok: true }
  | { ok: false; reason: string } {
  const entry = live[live.length - 1];
  if (!entry) return { ok: false, reason: "No embedded terminal is open. Open a change view to start one." };
  try {
    entry.term.write(terminate ? withEnter(data) : data);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Inject `data` into the Manager PTY — the PTY whose `cwd` matches the given
 * `managerCwd` (typically the ithyno project root). Unlike `injectIntoActive`,
 * this does not depend on which terminal the user last interacted with, so it
 * is safe to call from server-side logic (e.g. the Import endpoint) where the
 * user may have opened a second terminal (a worktree terminal) since the
 * Manager was last active.
 *
 * Returns 503 when no PTY with a matching cwd exists — the Manager is not
 * running or has not been opened in the Terminal panel yet.
 */
export function injectIntoManager(
  managerCwd: string,
  data: string,
  terminate: boolean,
): { ok: true } | { ok: false; reason: string } {
  // Walk from most-recently-active backwards so we pick the most recently
  // used Manager terminal when (hypothetically) multiple are open.
  for (let i = live.length - 1; i >= 0; i--) {
    const entry = live[i];
    if (entry.cwd === managerCwd) {
      try {
        entry.term.write(terminate ? withEnter(data) : data);
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  // Diagnostic: log the cwds that were actually present so operators can
  // diagnose mismatches (e.g. the PTY was spawned with a different cwd than
  // PROJECT_ROOT, or the terminal was never opened). (NF2)
  const liveCwds = live.map((e) => e.cwd);
  console.warn(
    `[pty] injectIntoManager: no terminal found for cwd "${managerCwd}". ` +
    `Live terminal cwds: ${liveCwds.length > 0 ? liveCwds.map((c) => `"${c}"`).join(", ") : "(none)"}`,
  );
  return {
    ok: false,
    reason: `No Manager terminal is open (expected cwd: ${managerCwd}). Open the Terminal panel and ensure the Manager is running.`,
  };
}

export function activeTerminalCount(): number {
  return live.length;
}

/**
 * Kill every live PTY and close its attached WebSocket. Used by
 * `POST /api/project/switch` (respawn-manager-pty-on-project-switch)
 * to force clients to reconnect after the server has re-targeted its
 * project root. Safe to call with an empty `live` array (no-op).
 *
 * The per-entry `ws.on("close")` handler (in `attachPtyToSocket`)
 * removes each entry from `live` when the socket finishes closing, so
 * a subsequent call to `activeTerminalCount()` reflects the drained
 * state after the sockets flush.
 */
export function terminateAllLivePtys(oldProjectRoot?: string): void {
  // Snapshot before iterating — the ws.on("close") handler mutates
  // `live` as each socket finishes closing, and we don't want the
  // iteration to skip entries due to concurrent splice().
  const snapshot = live.slice();
  for (const entry of snapshot) {
    try { entry.term.kill(); } catch { /* already dead */ }
    try { entry.ws.close(1000, "project switch"); } catch { /* already closing */ }
  }

  // Also kill the tmux session for the outgoing project root, so a
  // future `tmux new-session -A -s <name>` for a different project
  // does not attach to a lingering pane with the wrong cwd. Best
  // effort — swallow errors (session not found, tmux missing, env
  // override that we cannot mirror here, etc.).
  // See scope-tmux-session-name-per-project.
  if (oldProjectRoot) {
    const sessionName = process.env.ITHYNO_TMUX_SESSION || tmuxSessionName(oldProjectRoot);
    try {
      spawnSync("tmux", ["kill-session", "-t", sessionName], { stdio: "ignore", timeout: 3000 });
    } catch {
      /* tmux missing or permission denied — nothing to clean */
    }
  }
}

/**
 * Attach a WebSocket to a freshly-spawned PTY. The socket sends raw stdout
 * bytes as text frames and accepts a small JSON control protocol for input
 * and resize. The PTY dies when the socket closes.
 */
export async function attachPtyToSocket(
  ws: WebSocket,
  opts: {
    cwd: string;
    cols?: number;
    rows?: number;
    /** When present, ptyStartup() derives the startup command + auto-inject
     *  line from `registry.managerAgent()`. Pass null to use the env-var /
     *  hardcoded fallback chain. See add-manager-agent-config. */
    registry?: AgentRegistry | null;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Guard (guard-terminal-autolaunch-on-agents-yaml round 2): refuse to
  // spawn a PTY at all when the project has no `agents.yaml`. The client
  // dashboard already gates the aside render on `hasAgentsYaml`, so this
  // branch normally does not fire — it is a defense-in-depth against
  // direct `/pty` WebSocket clients.
  if (!hasAgentsYaml(opts.cwd)) {
    console.log(`[pty] spawn skipped — no agents.yaml at ${opts.cwd}`);
    return { ok: false, reason: "no-agents-yaml" };
  }

  const pty = await loadPty();
  if (!pty.available) return { ok: false, reason: pty.reason };

  const { cmd, args } = defaultShell();
  const term = pty.module.spawn(cmd, args, {
    name: "xterm-256color",
    cols: opts.cols ?? 80,
    rows: opts.rows ?? 24,
    cwd: opts.cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      // The Manager (and any CLI it launches from this shell) needs the
      // session token to reach token-gated endpoints such as
      // POST /api/manager/activity. The PTY is local-only and already
      // origin/token gated at the WebSocket upgrade, so exporting it into
      // the shell environment adds no new exposure surface.
      // Landed by expose-manager-activity-per-change.
      ITHYNO_SESSION_TOKEN: SESSION_TOKEN,
      // The Electron shell (server-spawner.ts) and the VSCode extension
      // both spawn the server on an ephemeral per-project port. Without
      // these two vars the Manager's dispatch skill has no way to reach
      // /api/changes/<id>/phase — it would fall back to the hardcoded
      // 4321 and hit connection-refused. Set here so any subshell that
      // needs to curl the server picks up the actual port:
      //   ITHYNO_PORT — bare port number, e.g. "57703".
      //   ITHYNO_BASE — full base URL, e.g. "http://localhost:57703".
      // Falls back to 4321 when PORT isn't set (CLI dev workflow).
      ITHYNO_PORT: process.env.PORT ?? "4321",
      ITHYNO_BASE: `http://localhost:${process.env.PORT ?? "4321"}`,
    },
  });

  const entry: LiveTerminal = { term, ws, cwd: opts.cwd };
  live.push(entry);

  // Auto-launch the resolved startup command so the Terminal panel has
  // a receiver from the moment it opens. The 300 ms delay lets the shell
  // finish printing its prompt so the typed line appears at the prompt,
  // not before it. If the manager entry declared an `initialInput`,
  // inject it 300 ms after the startup command so the Manager has time
  // to boot and render its own prompt.
  //
  // Guard (guard-terminal-autolaunch-on-agents-yaml): skip the Claude
  // injection when the project has no agents.yaml. The PTY still spawns
  // a plain shell — manual use is never blocked.
  const { startup, initialInput } = ptyStartup(opts.registry ?? null, opts.cwd);
  if (startup) {
    if (!hasAgentsYaml(opts.cwd)) {
      console.log(
        `[pty] auto-launch skipped — no agents.yaml at ${opts.cwd}`,
      );
    } else {
      setTimeout(() => {
        try {
          console.log(`[pty] auto-launching: ${startup}`);
          term.write(withEnter(startup));
        } catch {
          /* term already dead */
        }
        if (initialInput) {
          setTimeout(() => {
            try {
              console.log(`[pty] auto-injecting initialInput: ${initialInput}`);
              term.write(withEnter(initialInput));
            } catch {
              /* term already dead */
            }
          }, 300);
        }
      }, 300);
    }
  }

  term.onData((data: string) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  term.onExit(() => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  });

  ws.on("message", (raw: Buffer | string) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
    } catch {
      return;
    }
    if (msg.type === "input") {
      bump(entry);
      term.write(msg.data);
    } else if (msg.type === "resize") {
      const cols = Math.max(1, Math.floor(msg.cols));
      const rows = Math.max(1, Math.floor(msg.rows));
      try {
        term.resize(cols, rows);
      } catch {
        /* ignore transient resize errors */
      }
    }
  });

  ws.on("close", () => {
    const i = live.indexOf(entry);
    if (i >= 0) live.splice(i, 1);
    try {
      term.kill();
    } catch {
      /* already dead */
    }
  });

  return { ok: true };
}
