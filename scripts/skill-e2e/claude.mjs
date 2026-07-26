// SPDX-License-Identifier: GPL-3.0-or-later
// Claude CLI dispatch helper for skill-e2e.
//
// Wraps `claude -p '<boot-prompt>'` per D5 — deterministic, CI-friendly, no
// PTY. Enforces a per-invocation wall-clock ceiling via AbortController.
// In --dry-run mode, resolves without actually invoking claude — this is the
// path CI / structural verification uses when a real CLI is not desired.

import { spawn } from "node:child_process";
import { info, warn, error } from "./log.mjs";

/**
 * Preflight check — verifies `claude --version` succeeds. Returns the version
 * string on success, throws on failure with a clear message.
 */
export async function preflightClaude() {
  return new Promise((res, rej) => {
    const child = spawn("claude", ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("error", (err) => {
      rej(
        new Error(
          `Claude Code CLI not installed or not on PATH. Install \`claude\` and re-run. Underlying error: ${err.message}`,
        ),
      );
    });
    child.on("exit", (code) => {
      if (code === 0) res(out.trim());
      else rej(new Error(`\`claude --version\` exited with code ${code}: ${out}`));
    });
  });
}

/**
 * Dispatch a Claude CLI invocation.
 *
 * @param {object} opts
 * @param {string} opts.cwd — working directory (usually the scaffolded target)
 * @param {string} opts.prompt — the boot prompt (typically a slash command)
 * @param {number} [opts.ceilingMs=60000] — per-invocation wall-clock ceiling
 * @param {boolean} [opts.dryRun=false] — if true, skip the spawn and return a
 *   canned "dry" result
 * @param {string[]} [opts.extraArgs=[]] — additional flags (e.g. --model)
 * @returns {Promise<{ ok: boolean, exitCode: number|null, stdout: string, stderr: string, timedOut: boolean }>}
 */
export async function dispatchClaude({
  cwd,
  prompt,
  ceilingMs = 60_000,
  dryRun = false,
  extraArgs = [],
}) {
  if (dryRun) {
    info(`claude: [DRY-RUN] would invoke \`claude -p '${trunc(prompt)}'\` (cwd=${cwd})`);
    return { ok: true, exitCode: 0, stdout: "", stderr: "", timedOut: false, dryRun: true };
  }

  info(`claude: invoking \`claude -p '${trunc(prompt)}'\` (cwd=${cwd}, ceiling=${ceilingMs}ms)`);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ceilingMs);

  return new Promise((res) => {
    const child = spawn("claude", [...extraArgs, "-p", prompt], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      signal: ac.signal,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      if (ac.signal.aborted) {
        warn(`claude: aborted after ${ceilingMs}ms`);
        res({
          ok: false,
          exitCode: null,
          stdout,
          stderr,
          timedOut: true,
          error: err.message,
        });
      } else {
        error(`claude: spawn error: ${err.message}`);
        res({
          ok: false,
          exitCode: null,
          stdout,
          stderr,
          timedOut: false,
          error: err.message,
        });
      }
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (ac.signal.aborted) {
        res({
          ok: false,
          exitCode: code,
          stdout,
          stderr,
          timedOut: true,
        });
      } else {
        res({
          ok: code === 0,
          exitCode: code,
          stdout,
          stderr,
          timedOut: false,
        });
      }
    });
  });
}

function trunc(s, max = 80) {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}
