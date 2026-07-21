// SPDX-License-Identifier: GPL-3.0-or-later
// PTY bridge: spawns a real shell in a pseudo-terminal and pipes bytes
// to/from a browser xterm.js session over a dedicated WebSocket.
//
// Loaded lazily so the dashboard still starts if the native module fails to
// build/install (feature detection — see /api/health).

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { WebSocket } from "ws";
import type { AgentRegistry } from "../agents/registry.js";

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
 */
function existsOnWindowsPath(cmd: string): boolean {
  try {
    return spawnSync("where", [cmd], { stdio: "ignore" }).status === 0;
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
    const cmd = existsOnWindowsPath("pwsh.exe") ? "pwsh.exe" : "powershell.exe";
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
  try {
    const r = spawnSync("which", ["tmux"], { encoding: "utf8" });
    tmuxCache = r.status === 0;
  } catch {
    tmuxCache = false;
  }
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
 * When `registry.agmsg()` is non-null (workspace opted into the
 * PTY→tmux→agmsg flavor via `add-agmsg-config-block`), the resolved
 * manager command is further wrapped in
 * `tmux new-session -A -s <name> -- <cmd> <args…>` where `<name>` is
 * `$ITHYNO_TMUX_SESSION` when set (non-empty) else `ithyno`. When
 * `tmux` is not on `PATH` the wrap is skipped and the startup line
 * becomes a `printf`-based fallback banner; `initialInput` is
 * suppressed in the fallback since the manager isn't running.
 * See wrap-embedded-pty-in-tmux.
 */
/**
 * Read `<projectRoot>/.ithyno/session-id` and pick the corresponding
 * `claude` startup. Mints a fresh UUID (and writes the file) on first
 * launch or when the file is missing / empty. Returns plain `claude`
 * when no `projectRoot` is available (older callers, tests).
 *
 * Landed by pty-startup-uses-project-session-id.
 */
function resolveSessionIdStartup(projectRoot: string | undefined): string {
  if (!projectRoot) return "claude";
  const idPath = join(projectRoot, ".ithyno", "session-id");
  let uuid = "";
  if (existsSync(idPath)) {
    try {
      uuid = readFileSync(idPath, "utf8").trim();
    } catch {
      /* fall through to mint */
    }
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

export function ptyStartup(
  registry: AgentRegistry | null,
  projectRoot?: string,
): {
  startup: string;
  initialInput?: string;
} {
  const manager = registry?.managerAgent() ?? null;
  const agmsg = registry?.agmsg() ?? null;

  let baseStartup: string;
  let initialInput: string | undefined;
  if (manager && manager.command) {
    const args = manager.args ?? [];
    baseStartup = [manager.command, ...args.map(shellQuote)].join(" ");
    initialInput = manager.initialInput;
  } else {
    const v = process.env.ITHYNO_TERMINAL_STARTUP;
    if (v !== undefined) {
      baseStartup = v;
    } else {
      // Priority 3: per-project session UUID at .ithyno/session-id.
      // See doc comment above.
      baseStartup = resolveSessionIdStartup(projectRoot);
    }
    initialInput = undefined;
  }

  if (agmsg === null) {
    return initialInput === undefined
      ? { startup: baseStartup }
      : { startup: baseStartup, initialInput };
  }

  // agmsg configured — wrap in tmux (or fall back with a banner).
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
  const session = process.env.ITHYNO_TMUX_SESSION || "ithyno";
  const startup = `tmux new-session -A -s ${shellQuote(session)} -- ${baseStartup}`;
  return initialInput === undefined
    ? { startup }
    : { startup, initialInput };
}

function tmuxMissingFallback(): string {
  const line1 = "\\n\\u26a0\\ufe0f  agmsg is configured in agents.yaml but tmux was not found on PATH.";
  const line2 = "Install tmux (brew install tmux on macOS, apt/pacman/dnf on Linux) and reopen";
  const line3 = "the Terminal panel, or remove the agmsg: block to fall back to direct spawn.\\n";
  return `printf '${line1}\\n${line2}\\n${line3}\\n'`;
}

/** Wrap `s` in single quotes when it contains characters a shell would
 *  interpret. Kept intentionally minimal — the manager agent's args
 *  are usually clean flags like `--continue`. */
function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9._\-/:@=]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

type ClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

// Registry of live PTY sessions. The last entry is the most recently active
// terminal — that's what /api/pty/inject writes to.
type LiveTerminal = { term: any; ws: WebSocket };
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
    entry.term.write(terminate ? data + "\r" : data);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export function activeTerminalCount(): number {
  return live.length;
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
  const pty = await loadPty();
  if (!pty.available) return { ok: false, reason: pty.reason };

  const { cmd, args } = defaultShell();
  const term = pty.module.spawn(cmd, args, {
    name: "xterm-256color",
    cols: opts.cols ?? 80,
    rows: opts.rows ?? 24,
    cwd: opts.cwd,
    env: { ...process.env, TERM: "xterm-256color" },
  });

  const entry: LiveTerminal = { term, ws };
  live.push(entry);

  // Auto-launch the resolved startup command so the Terminal panel has
  // a receiver from the moment it opens. The 300 ms delay lets the shell
  // finish printing its prompt so the typed line appears at the prompt,
  // not before it. If the manager entry declared an `initialInput`,
  // inject it 300 ms after the startup command so the Manager has time
  // to boot and render its own prompt.
  const { startup, initialInput } = ptyStartup(opts.registry ?? null, opts.cwd);
  if (startup) {
    setTimeout(() => {
      try {
        console.log(`[pty] auto-launching: ${startup}`);
        term.write(`${startup}\r`);
      } catch {
        /* term already dead */
      }
      if (initialInput) {
        setTimeout(() => {
          try {
            console.log(`[pty] auto-injecting initialInput: ${initialInput}`);
            term.write(`${initialInput}\r`);
          } catch {
            /* term already dead */
          }
        }, 300);
      }
    }, 300);
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
