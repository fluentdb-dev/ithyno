// SPDX-License-Identifier: GPL-3.0-or-later
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { RuntimeDef } from "./registry.js";

/**
 * Runtime installation detection. Runs `which <cmd>` in a child process
 * and reports whether the command is on PATH plus the resolved absolute
 * path. Used by `GET /api/agents/runtimes` to help users see which of
 * their declared runtimes are actually installed on this host.
 *
 * Windows is out of scope for Phase 3.3 — `which` is a POSIX contract
 * and PowerShell's `Get-Command` returns a different shape. On Windows
 * every runtime is reported as `{ installed: false, error: "windows
 * detection not supported" }`.
 */

const execFileP = promisify(execFile);

export type DetectionResult = {
  installed: boolean;
  path?: string;
  error?: string;
};

const WINDOWS_UNSUPPORTED: DetectionResult = {
  installed: false,
  error: "windows detection not supported",
};

/** Simple environment probe. Extracted for override in tests. */
export function isWindows(): boolean {
  return process.platform === "win32";
}

/**
 * Detect whether `command` is on PATH. Runs `which <cmd>` and treats
 * exit-code 0 as installed. The resolved path is trimmed of trailing
 * newlines; when `which` prints multiple candidates the first one is
 * used (matches `which -a` first-hit behavior in shells).
 */
export async function detectRuntime(command: string): Promise<DetectionResult> {
  if (isWindows()) return WINDOWS_UNSUPPORTED;
  try {
    const { stdout } = await execFileP("which", [command]);
    const path = stdout.split("\n")[0]?.trim();
    if (!path) {
      return { installed: false, error: "which returned no output" };
    }
    return { installed: true, path };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { installed: false, error: msg };
  }
}

/**
 * Detect every unique command across the given runtimes map (multiple
 * runtimes sharing a `command` reuse the same result). Returns a map
 * keyed by runtime name.
 */
export async function detectAllRuntimes(
  runtimes: Record<string, RuntimeDef>,
): Promise<Record<string, DetectionResult>> {
  const entries = Object.entries(runtimes);
  if (entries.length === 0) return {};
  if (isWindows()) {
    const out: Record<string, DetectionResult> = {};
    for (const [name] of entries) out[name] = WINDOWS_UNSUPPORTED;
    return out;
  }

  const uniqueCommands = new Set(entries.map(([, def]) => def.command));
  const results = new Map<string, DetectionResult>();
  await Promise.all(
    Array.from(uniqueCommands).map(async (cmd) => {
      const r = await detectRuntime(cmd);
      results.set(cmd, r);
    }),
  );

  const out: Record<string, DetectionResult> = {};
  for (const [name, def] of entries) {
    // Non-null assertion is safe because we populated results for every
    // command in uniqueCommands, which is exactly the set of def.command
    // values.
    out[name] = results.get(def.command)!;
  }
  return out;
}
