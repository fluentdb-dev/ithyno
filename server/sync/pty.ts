// SPDX-License-Identifier: GPL-3.0-or-later
// PTY bridge: spawns a real shell in a pseudo-terminal and pipes bytes
// to/from a browser xterm.js session over a dedicated WebSocket.
//
// Loaded lazily so the dashboard still starts if the native module fails to
// build/install (feature detection — see /api/health).

import type { WebSocket } from "ws";

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

/** Pick a sensible default shell + args per platform. */
export function defaultShell(): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    // Prefer pwsh.exe (PowerShell 7+) when on PATH; fall back to powershell.exe.
    return { cmd: process.env.ITHYNO_SHELL ?? "pwsh.exe", args: [] };
  }
  const sh = process.env.ITHYNO_SHELL ?? process.env.SHELL ?? "/bin/bash";
  return { cmd: sh, args: [] };
}

/**
 * Command auto-launched inside a freshly-spawned PTY. Defaults to
 * `claude --continue` so the embedded terminal resumes the last session
 * for this project — matches the mental model of "same terminal, same
 * conversation". Users can force a fresh session from inside Claude via
 * `/clear`.
 *
 * Override with `ITHYNO_TERMINAL_STARTUP=<cmd>` for a different agent
 * (e.g. `claude` for always-new, `aider` for a different CLI), or set it
 * to an empty string to disable auto-launch (raw shell).
 */
export function ptyStartupCommand(): string {
  const v = process.env.ITHYNO_TERMINAL_STARTUP;
  return v ?? "claude --continue";
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
  opts: { cwd: string; cols?: number; rows?: number },
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

  // Auto-launch the configured startup command (default: `claude`) so
  // Terminal execution has a receiver from the moment the terminal opens.
  // The small delay lets the shell finish printing its prompt so the injected
  // line appears at the prompt, not before it.
  const startup = ptyStartupCommand();
  if (startup) {
    setTimeout(() => {
      try {
        console.log(`[pty] auto-launching: ${startup}`);
        term.write(`${startup}\r`);
      } catch {
        /* term already dead */
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
