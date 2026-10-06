// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Safe parsing and serialization helpers for Agent CLI argument builders.
 *
 * The runtime owns prompt transport (`-p`, `--print`, `--prompt`, Codex `exec`,
 * etc.), so builder code should never persist them as user-owned arguments.
 * Unknown arguments must remain present in their original relative order.
 */

export const DISPATCHER_OWNED_PROMPT_FLAGS = new Set([
  "-p",
  "--print",
  "--prompt",
  "--resume",
  "--continue",
  "--session-id",
  "--conversation",
  "--artifact-contract",
  "--change-id",
  "--worktree",
  "--cwd",
  "exec",
]);

const DISPATCHER_PREFIXES = [
  "/opsx:",
  "/ithy-opsx:",
  "openspec-",
  "ithy-opsx-",
];

export function splitArgv(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (escaped) current += "\\";
  if (current.length > 0) out.push(current);
  return out;
}

export function joinArgv(args: readonly string[]): string {
  return args
    .map((arg) => {
      if (arg.length === 0) return '""';
      return /[\s"'\\]/.test(arg) ? JSON.stringify(arg) : arg;
    })
    .join(" ");
}

function isDispatcherPromptToken(arg: string): boolean {
  return DISPATCHER_PREFIXES.some((prefix) => arg.startsWith(prefix));
}

/** Remove values that are runtime-owned prompt or worktree transport. */
export function sanitizePersistedArgs(args: readonly string[]): string[] {
  const out: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg === "-p" || arg === "--print" || arg === "--prompt") {
      i += 1;
      continue;
    }
    if (
      arg === "--resume"
      || arg === "--continue"
      || arg === "--session-id"
      || arg === "--conversation"
      || arg === "--artifact-contract"
      || arg === "--change-id"
      || arg === "--worktree"
      || arg === "--cwd"
    ) {
      i += 1;
      continue;
    }
    if (arg === "exec") continue;
    if (isDispatcherPromptToken(arg)) continue;
    out.push(arg);
  }

  return out;
}
