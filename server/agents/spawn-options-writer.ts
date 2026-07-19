// SPDX-License-Identifier: GPL-3.0-or-later
// Auto-syncs non-`--model` CLI flags from live-shell worker `entry.args`
// in `agents.yaml` into `~/.agmsg/config/spawn_options.yaml` so agmsg's
// spawn.sh picks them up without the user hand-editing that file.
//
// Landed by openspec/changes/auto-sync-agmsg-spawn-options.
//
// Triggers:
//   - server boot (after registry.load, in server/index.ts)
//   - POST /api/agents/config Save (after applyAgentConfigPayload, in
//     server/agents/config-writer.ts)
//
// Emits agmsg's flat spawn-options YAML dialect (see
// vendor/agmsg/scripts/lib/spawn-options.sh): `<type>:` header + 2-space-
// indented `<flag>: <value>` lines. No nesting, no quoting.

import { existsSync, mkdirSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentConfig, AgentDef } from "./registry.js";

/** Fixed mapping from `entry.command` to agmsg agent-type — MUST match
 *  the dispatcher skill's mapping in `.claude/commands/ithy-opsx/
 *  dispatch.md`. Unmapped commands are silently skipped by the sync
 *  (dispatch escalates at run-time; the sync itself is non-fatal). */
const COMMAND_TO_AGMSG_TYPE: Readonly<Record<string, string>> = {
  claude: "claude-code",
  codex: "codex",
  copilot: "copilot",
  gemini: "gemini",
  antigravity: "antigravity",
  opencode: "opencode",
  cursor: "cursor",
};

export function mapCommandToAgmsgType(command: string | undefined): string | null {
  if (!command) return null;
  return COMMAND_TO_AGMSG_TYPE[command] ?? null;
}

/** Parse an `entry.args` array into a flat `{ flag: value | true }` map,
 *  skipping `--model <id>` (that's threaded on the CLI by the
 *  dispatcher). Only tokens starting with `--` become keys in the map
 *  (short flags like `-s` are emitted verbatim by the caller loop but
 *  do NOT get their own key here). The next token is treated as the
 *  flag's value iff it exists AND does NOT start with `-` (any dash);
 *  otherwise the flag is boolean. This matches the convention where a
 *  value token never starts with `-`; if it does, use `--flag=value`
 *  syntax in the yaml directly. */
export function parseArgsToFlags(
  args: readonly string[] | undefined,
): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  if (!args) return out;
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (!tok.startsWith("--")) continue;
    const next = i + 1 < args.length ? args[i + 1] : undefined;
    const hasValue = next !== undefined && !next.startsWith("-");
    // Skip --model entirely — dispatcher handles it on the CLI.
    if (tok === "--model") {
      if (hasValue) i++;
      continue;
    }
    if (hasValue) {
      out[tok] = next!;
      i++;
    } else {
      out[tok] = true;
    }
  }
  return out;
}

type SectionMap = Record<string, Record<string, string | true>>;

/** Parse an existing spawn_options.yaml into a flat per-type flag map.
 *  Mirrors the shape agmsg's `spawn-options.sh` (awk-based) reads: flat
 *  `<type>:` header + 2-space-indented `<flag>: <value>` lines.
 *  Uses a hand-rolled parser (not `yaml`) so the write path stays
 *  byte-identical to agmsg's read format. */
export function parseSpawnOptionsYaml(raw: string): SectionMap {
  const sections: SectionMap = {};
  let current: string | null = null;
  for (const rawLine of raw.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    // Section header: `<type>:` at column 0, no leading space.
    const header = /^([^\s#][^:\s]*):\s*$/.exec(rawLine);
    if (header) {
      current = header[1];
      if (!sections[current]) sections[current] = {};
      continue;
    }
    // Flag line: 2-space indent + `--flag: value`.
    const flag = /^ {2}([^:\s]+):\s*(.*?)\s*$/.exec(rawLine);
    if (flag && current !== null) {
      const key = flag[1];
      const val = flag[2] === "" || flag[2] === "true" ? true : flag[2];
      sections[current][key] = val;
      continue;
    }
    // Comment or malformed line — skip.
  }
  return sections;
}

/** Emit a SectionMap back into agmsg's spawn-options YAML dialect. */
export function stringifySpawnOptionsYaml(sections: SectionMap): string {
  const types = Object.keys(sections).sort();
  const out: string[] = [];
  for (const type of types) {
    const flags = sections[type];
    const keys = Object.keys(flags).sort();
    if (keys.length === 0) continue; // empty section → omit entirely
    out.push(`${type}:`);
    for (const flag of keys) {
      const val = flags[flag];
      out.push(`  ${flag}: ${val === true ? "true" : val}`);
    }
  }
  return out.length === 0 ? "" : out.join("\n") + "\n";
}

/** Absolute path to the shared spawn options file agmsg reads. Landing
 *  location is fixed per the spec — an env-var override
 *  (`AGMSG_SPAWN_OPTIONS_FILE`) is a follow-up. */
export function spawnOptionsPath(): string {
  return join(homedir(), ".agmsg", "config", "spawn_options.yaml");
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, contents, "utf8");
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Compute the ithyno-managed section map from `cfg.agents`:
 *  live-shell workers (non-manager) whose command has an agmsg-type
 *  mapping. Types with zero flags AFTER `--model` skip are represented
 *  in the map with an empty object so callers can distinguish "this
 *  type is managed but has nothing to write" from "this type is not
 *  managed at all". Callers preserve unmanaged types verbatim. */
export function computeManagedSections(cfg: AgentConfig): SectionMap {
  const managed: SectionMap = {};
  for (const agent of cfg.agents) {
    if (agent.mode !== "live-shell") continue;
    if (agent.roles.includes("manager")) continue;
    const type = mapCommandToAgmsgType(agent.command);
    if (!type) continue;
    const flags = parseArgsToFlags(agent.args);
    // Merge into the existing type section: multiple entries under the
    // same command all contribute to that type. Last write wins on flag
    // conflicts within a type.
    managed[type] = { ...(managed[type] ?? {}), ...flags };
  }
  return managed;
}

/** Merge the ithyno-managed section map into the existing file's map:
 *  managed types are rewritten authoritatively (empty section = remove
 *  the type entirely); unmanaged types are preserved as-is. */
export function mergeSections(
  existing: SectionMap,
  managed: SectionMap,
  managedTypes: Set<string>,
): SectionMap {
  const merged: SectionMap = { ...existing };
  for (const type of managedTypes) {
    const flags = managed[type] ?? {};
    if (Object.keys(flags).length === 0) {
      delete merged[type];
    } else {
      merged[type] = flags;
    }
  }
  return merged;
}

/** The set of agmsg-types this project claims responsibility for —
 *  every live-shell non-manager worker with a mapped command
 *  contributes its type, whether or not it produced any flags. */
export function projectManagedTypes(cfg: AgentConfig): Set<string> {
  const types = new Set<string>();
  for (const agent of cfg.agents) {
    if (agent.mode !== "live-shell") continue;
    if (agent.roles.includes("manager")) continue;
    const type = mapCommandToAgmsgType(agent.command);
    if (type) types.add(type);
  }
  return types;
}

/**
 * Sync `~/.agmsg/config/spawn_options.yaml` with the ithyno-managed
 * agmsg-types derived from `cfg`. No-op when `cfg.agmsg === null`
 * (agmsg not configured). Safe to call multiple times; idempotent.
 *
 * `spawnOptionsPathOverride` is a test-only injection point — the
 * default resolves via `spawnOptionsPath()`.
 */
export async function syncSpawnOptions(
  cfg: AgentConfig,
  spawnOptionsPathOverride?: string,
): Promise<void> {
  if (cfg.agmsg === null) return;

  const managed = computeManagedSections(cfg);
  const managedTypes = projectManagedTypes(cfg);
  const path = spawnOptionsPathOverride ?? spawnOptionsPath();

  let existing: SectionMap = {};
  if (existsSync(path)) {
    try {
      const raw = await readFile(path, "utf8");
      existing = parseSpawnOptionsYaml(raw);
    } catch (err) {
      // Corrupt or unreadable file — bail out silently rather than
      // clobber. Follow-up: log via the server's warning channel.
      console.warn(
        `[spawn-options-writer] could not read ${path}: ${err instanceof Error ? err.message : String(err)}; skipping sync`,
      );
      return;
    }
  }

  const next = mergeSections(existing, managed, managedTypes);
  const yaml = stringifySpawnOptionsYaml(next);

  // If the resulting map is empty AND the file doesn't exist yet, skip
  // creating an empty file. Otherwise write authoritatively (empty
  // content == truncate an existing file back to nothing).
  if (!yaml && !existsSync(path)) return;

  const dir = join(homedir(), ".agmsg", "config");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await atomicWrite(path, yaml);
}

// Test-only re-exports of internal helpers used by unit tests.
export type { AgentDef, AgentConfig };
