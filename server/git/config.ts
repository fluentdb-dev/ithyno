// SPDX-License-Identifier: GPL-3.0-or-later
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type { GitConfig, GitIdentity } from "../model.js";

const execFile = promisify(execFileCb);

/**
 * Read effective (as-would-commit-now) and local-scoped git identity.
 * `git config --show-scope --get` returns `<scope>\t<value>` in one call
 * per key, so we avoid a second round-trip to distinguish local from global.
 */
export async function readGitConfig(projectRoot: string): Promise<GitConfig> {
  const [nameRow, emailRow] = await Promise.all([
    showScopeGet(projectRoot, "user.name"),
    showScopeGet(projectRoot, "user.email"),
  ]);

  const effective: GitIdentity = {};
  const local: GitIdentity = {};
  if (nameRow) {
    effective.userName = nameRow.value;
    if (nameRow.scope === "local") local.userName = nameRow.value;
  }
  if (emailRow) {
    effective.userEmail = emailRow.value;
    if (emailRow.scope === "local") local.userEmail = emailRow.value;
  }
  return { effective, local };
}

/**
 * Overwrite the local scope of the given identity fields. Empty string clears
 * the field (via `--unset`); undefined leaves it untouched.
 */
export async function writeLocalConfig(
  projectRoot: string,
  next: GitIdentity,
): Promise<void> {
  // git config takes a per-file lock on .git/config; parallel writes race and
  // one fails with "could not lock config file". Serialize.
  if (next.userName !== undefined) await setOrUnset(projectRoot, "user.name", next.userName);
  if (next.userEmail !== undefined) await setOrUnset(projectRoot, "user.email", next.userEmail);
}

export type ScopedValue = { scope: "local" | "global" | "system" | "worktree" | "command"; value: string };

/** Parse `git config --show-scope --get <key>` output. */
export function parseShowScope(raw: string): ScopedValue | null {
  const line = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!line) return null;
  // Format is: "<scope>\t<value>" — value may itself contain tabs/spaces.
  const tab = line.indexOf("\t");
  if (tab < 0) return null;
  const scope = line.slice(0, tab).trim();
  const value = line.slice(tab + 1);
  if (!isKnownScope(scope)) return null;
  return { scope, value };
}

function isKnownScope(s: string): s is ScopedValue["scope"] {
  return s === "local" || s === "global" || s === "system" || s === "worktree" || s === "command";
}

async function showScopeGet(root: string, key: string): Promise<ScopedValue | null> {
  try {
    const { stdout } = await execFile("git", ["config", "--show-scope", "--get", key], { cwd: root });
    return parseShowScope(stdout);
  } catch (err) {
    // Exit code 1 means "not set" — return null, do not throw.
    if ((err as { code?: number }).code === 1) return null;
    throw err;
  }
}

async function setOrUnset(root: string, key: string, value: string): Promise<void> {
  if (value === "") {
    try {
      await execFile("git", ["config", "--local", "--unset", key], { cwd: root });
    } catch (err) {
      // Exit code 5 means "no such section or key" — idempotent unset.
      if ((err as { code?: number }).code === 5) return;
      throw err;
    }
    return;
  }
  await execFile("git", ["config", "--local", key, value], { cwd: root });
}
