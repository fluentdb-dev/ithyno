// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { AgentRegistry, validateAgents } from "./registry.js";
import type { AgentMode } from "./registry.js";
import { syncSpawnOptions } from "./spawn-options-writer.js";

/**
 * Server-side writer for `agents.yaml` mutations invoked by the Agents tab.
 *
 * Post-reshape (openspec/changes/reshape-agents-yaml-mode-roles): the
 * upsert payload speaks the new schema (`mode`, `roles`, `prompts`) but
 * the writer still round-trips legacy top-level keys and any existing
 * old-shape entries untouched. The loader's normalizer handles reading
 * the mixed file back.
 */

const KEBAB_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;
const AGENT_MODES: readonly AgentMode[] = ["single-prompt", "live-shell"];

export type UpsertPayload = {
  action: "upsert";
  name: string;
  /** New schema: dispatch labels. Must be non-empty. */
  roles: string[];
  /** New schema: spawn mode. */
  mode: AgentMode;
  /** New schema: per-role prompt overrides. Runtime-inherited defaults
   *  and built-in defaults kick in when a role's entry is absent. */
  prompts?: Record<string, string>;
  command?: string;
  args?: string[];
  description?: string;
};

export type DeletePayload = {
  action: "delete";
  name: string;
};

export type AgentConfigPayload = UpsertPayload | DeletePayload;

/** Structured result so the Fastify handler can distinguish "malformed
 *  payload" (400) from "agent to delete not found" (404). */
export type ApplyResult =
  | { ok: true }
  | { ok: false; status: 400 | 404; error: string };

export function coercePayload(raw: unknown): AgentConfigPayload | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body must be a JSON object" };
  const o = raw as Record<string, unknown>;
  const action = o.action;
  if (action === "upsert") return coerceUpsert(o);
  if (action === "delete") return coerceDelete(o);
  return { error: "action must be 'upsert' or 'delete'" };
}

function coerceUpsert(o: Record<string, unknown>): UpsertPayload | { error: string } {
  const name = typeof o.name === "string" ? o.name : "";
  if (!KEBAB_RE.test(name)) {
    return { error: "name must be kebab-case (letters, digits, hyphens; no leading digit or hyphen)" };
  }

  // roles[] — required, non-empty. Also accept a scalar `role` for a
  // grace period so intermediate versions of the client don't 400.
  let roles: string[] | null = null;
  if (Array.isArray(o.roles)) {
    const out: string[] = [];
    for (const r of o.roles) {
      if (typeof r !== "string" || !r) return { error: "roles must be non-empty strings" };
      out.push(r);
    }
    if (out.length === 0) return { error: "roles must contain at least one role" };
    roles = out;
  } else if (typeof o.role === "string" && o.role) {
    roles = [o.role];
  }
  if (!roles) return { error: "roles is required (non-empty array of strings)" };

  // mode — required.
  const mode = typeof o.mode === "string" ? o.mode : "";
  if (!AGENT_MODES.includes(mode as AgentMode)) {
    return { error: `mode must be one of ${AGENT_MODES.join(", ")}` };
  }
  if (roles.includes("manager") && mode !== "live-shell") {
    return { error: "roles containing 'manager' require mode: live-shell" };
  }

  // command required.
  const hasCommand = typeof o.command === "string" && o.command.length > 0;
  if (!hasCommand) {
    return { error: "must declare 'command'" };
  }

  // prompts — optional map<role, string>.
  let prompts: Record<string, string> | undefined;
  if (o.prompts !== undefined && o.prompts !== null) {
    if (typeof o.prompts !== "object" || Array.isArray(o.prompts)) {
      return { error: "prompts must be an object mapping role → template" };
    }
    const out: Record<string, string> = {};
    for (const [role, val] of Object.entries(o.prompts as Record<string, unknown>)) {
      if (!role) return { error: "prompts: role name must be non-empty" };
      if (typeof val !== "string") return { error: `prompts.${role} must be a string` };
      if (val.length > 0) out[role] = val;
    }
    if (Object.keys(out).length > 0) prompts = out;
  }

  const payload: UpsertPayload = {
    action: "upsert",
    name,
    roles,
    mode: mode as AgentMode,
    prompts,
  };
  if (typeof o.description === "string" && o.description.length > 0) {
    payload.description = o.description;
  }
  payload.command = o.command as string;
  const args = coerceStringArray(o.args ?? []);
  if (args === null) return { error: "args must be an array of strings" };
  payload.args = args;
  return payload;
}

function coerceDelete(o: Record<string, unknown>): DeletePayload | { error: string } {
  const name = typeof o.name === "string" ? o.name : "";
  if (!name) return { error: "name is required" };
  return { action: "delete", name };
}

function coerceStringArray(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return null;
    out.push(item);
  }
  return out;
}

/** Read the current agents.yaml as a raw object, apply the mutation,
 *  validate the result via the loader's own agent-shape rules, and
 *  atomically write. */
export async function applyAgentConfigPayload(
  projectRoot: string,
  payload: AgentConfigPayload,
): Promise<ApplyResult> {
  const path = join(projectRoot, "agents.yaml");
  let doc: Record<string, unknown>;
  if (existsSync(path)) {
    const raw = await readFile(path, "utf8");
    try {
      const parsed = parseYaml(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        doc = parsed as Record<string, unknown>;
      } else {
        return { ok: false, status: 400, error: "agents.yaml is not a mapping — refusing to overwrite" };
      }
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: `agents.yaml is not valid YAML — refusing to overwrite: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else {
    doc = { agents: [] };
  }

  const list = Array.isArray(doc.agents) ? [...(doc.agents as unknown[])] : [];

  if (payload.action === "delete") {
    const idx = findAgentIndex(list, payload.name);
    if (idx === -1) {
      return { ok: false, status: 404, error: `agent '${payload.name}' not found` };
    }
    // Manager row is edit-only. Deleting the Manager from the UI silently
    // disables the Terminal panel's auto-launch — a footgun. Users who
    // really want to remove it can hand-edit agents.yaml.
    const target = list[idx] as Record<string, unknown> | undefined;
    if (target && isManagerEntry(target)) {
      return {
        ok: false,
        status: 400,
        error:
          "manager agents cannot be deleted from the UI; edit agents.yaml directly to remove",
      };
    }
    list.splice(idx, 1);
  } else {
    // upsert
    const idx = findAgentIndex(list, payload.name);
    // Manager singleton — reject a second manager upsert (name differs).
    if (payload.roles.includes("manager")) {
      const existingManagerIdx = list.findIndex((e) => {
        if (!e || typeof e !== "object") return false;
        return isManagerEntry(e as Record<string, unknown>);
      });
      if (existingManagerIdx !== -1 && existingManagerIdx !== idx) {
        return {
          ok: false,
          status: 400,
          error: "only one agent may include 'manager' in roles",
        };
      }
    }
    const entry = renderAgentYamlEntry(payload);
    if (idx === -1) {
      list.push(entry);
    } else {
      list[idx] = entry;
    }
  }

  const next: Record<string, unknown> = { ...doc, agents: list };

  // Loader-level shape check on the whole result. This rejects e.g. an
  // upsert that produces a Manager mode conflict, or a runtime reference
  // to an undeclared runtime.
  try {
    validateAgents(next);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const yaml = stringifyYaml(next);
  await atomicWrite(path, yaml);

  // auto-sync-agmsg-spawn-options: mirror non-`--model` args of live-shell
  // workers into ~/.agmsg/config/spawn_options.yaml. Reload the registry
  // so `cfg.agmsg` reflects the just-written file rather than the caller's
  // stale in-memory copy. Failures are logged but do not fail the UI Save
  // (the user's agents.yaml write already succeeded).
  try {
    const freshRegistry = new AgentRegistry(projectRoot);
    await freshRegistry.load();
    const publicCfg = freshRegistry.publicConfig();
    // publicConfig() returns AgentPublic (env redacted) which is a
    // structural superset of what syncSpawnOptions reads (mode/roles/
    // command/args on agents, agmsg/parallelExecution top-level), so the
    // cast is safe.
    await syncSpawnOptions(publicCfg as unknown as import("./registry.js").AgentConfig);
  } catch (err) {
    console.warn(
      `[config-writer] spawn_options.yaml sync failed after agents.yaml write: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { ok: true };
}

function findAgentIndex(list: unknown[], name: string): number {
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (entry && typeof entry === "object" && (entry as Record<string, unknown>).name === name) {
      return i;
    }
  }
  return -1;
}

/** True if the entry is a manager under either the new (`roles: [...]`
 *  contains "manager") or old (`role: "manager"` scalar) shape. */
function isManagerEntry(entry: Record<string, unknown>): boolean {
  if (entry.role === "manager") return true;
  if (Array.isArray(entry.roles) && entry.roles.includes("manager")) return true;
  return false;
}

/** Build the YAML-mapping-compatible object for an upsert. Emits the
 *  new-schema fields (mode / roles / prompts); does not preserve any
 *  legacy fields that may have been on the prior entry. */
function renderAgentYamlEntry(p: UpsertPayload): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: p.name,
    mode: p.mode,
    roles: p.roles,
  };
  if (p.description !== undefined) entry.description = p.description;
  if (p.command !== undefined) {
    entry.command = p.command;
    entry.args = p.args ?? [];
  }
  if (p.prompts !== undefined && Object.keys(p.prompts).length > 0) {
    entry.prompts = p.prompts;
  }
  return entry;
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, contents, "utf8");
  try {
    await rename(tmp, path);
  } catch (err) {
    // Best-effort cleanup so we don't leave a `.tmp` sibling behind.
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/**
 * Set the top-level `parallelExecution` boolean in agents.yaml.
 * Preserves other keys (agents list, runtimes if any legacy, unknown keys).
 * Landed by add-parallel-execution-config.
 */
export async function writeParallelExecution(
  projectRoot: string,
  value: boolean,
): Promise<ApplyResult> {
  const path = join(projectRoot, "agents.yaml");
  let doc: Record<string, unknown>;
  if (existsSync(path)) {
    const raw = await readFile(path, "utf8");
    try {
      const parsed = parseYaml(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        doc = parsed as Record<string, unknown>;
      } else {
        return { ok: false, status: 400, error: "agents.yaml is not a mapping — refusing to overwrite" };
      }
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: `agents.yaml is not valid YAML — refusing to overwrite: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else {
    doc = { agents: [] };
  }
  doc.parallelExecution = value;
  await atomicWrite(path, stringifyYaml(doc));
  return { ok: true };
}
