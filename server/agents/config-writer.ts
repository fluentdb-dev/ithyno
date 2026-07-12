// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateAgents } from "./registry.js";

/**
 * Server-side writer for `agents.yaml` mutations invoked by the
 * Agents tab (Phase 5.3: add-agents-config-write).
 *
 * The client sends an upsert or delete payload; this module:
 *   1. Reads the current agents.yaml (or starts with `{ agents: [] }`
 *      when the file is missing).
 *   2. Applies the mutation on the `agents:` list.
 *   3. Validates the resulting shape via the loader's own validator,
 *      so a bad payload throws BEFORE the write hits disk.
 *   4. Atomically writes via a sibling `.tmp` file + rename — a crash
 *      mid-write leaves either the old file or the new file, never
 *      partial YAML.
 *   5. Preserves unrelated top-level keys (`runtimes:`,
 *      `worktreePool:`, unknown keys) byte-intent via a
 *      parse → merge → serialize round-trip.
 */

const KEBAB_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

export type UpsertPayload = {
  action: "upsert";
  name: string;
  role: string;
  command?: string;
  args?: string[];
  runtime?: string;
  prompt?: string;
  specialties: string[];
  concurrency: number;
  dedicated: boolean;
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
  const role = typeof o.role === "string" ? o.role : "";
  if (!role) return { error: "role is required" };
  const specialties = coerceStringArray(o.specialties);
  if (specialties === null) return { error: "specialties must be an array of strings" };
  const concurrency = Number(o.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    return { error: "concurrency must be an integer ≥ 1" };
  }
  const dedicated = typeof o.dedicated === "boolean" ? o.dedicated : true;

  const hasCommand = o.command !== undefined;
  const hasArgs = o.args !== undefined;
  const hasRuntime = o.runtime !== undefined;
  const hasPrompt = o.prompt !== undefined;
  const legacy = hasCommand || hasArgs;
  const runtimeBacked = hasRuntime || hasPrompt;
  if (legacy && runtimeBacked) {
    return {
      error: "cannot mix legacy (command/args) and runtime-backed (runtime/prompt) fields",
    };
  }
  if (!legacy && !runtimeBacked) {
    return { error: "must declare either (command + args) or (runtime + prompt)" };
  }

  const payload: UpsertPayload = {
    action: "upsert",
    name,
    role,
    specialties,
    concurrency,
    dedicated,
  };
  if (typeof o.description === "string" && o.description.length > 0) {
    payload.description = o.description;
  }
  if (legacy) {
    if (typeof o.command !== "string" || !o.command) {
      return { error: "command is required for legacy shape" };
    }
    const args = coerceStringArray(o.args ?? []);
    if (args === null) return { error: "args must be an array of strings" };
    payload.command = o.command;
    payload.args = args;
  } else {
    if (typeof o.runtime !== "string" || !o.runtime) {
      return { error: "runtime is required for runtime-backed shape" };
    }
    payload.runtime = o.runtime;
    if (o.prompt !== undefined) {
      if (typeof o.prompt !== "string") return { error: "prompt must be a string" };
      if (o.prompt.length > 0) payload.prompt = o.prompt;
    }
  }
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
 *  atomically write. Returns a discriminated result so the handler
 *  can translate 404 vs 400 cleanly. */
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
    list.splice(idx, 1);
  } else {
    // upsert
    const idx = findAgentIndex(list, payload.name);
    const entry = renderAgentYamlEntry(payload);
    if (idx === -1) {
      list.push(entry);
    } else {
      list[idx] = entry;
    }
  }

  const next: Record<string, unknown> = { ...doc, agents: list };

  // Loader-level shape check on the whole result. This rejects e.g. an
  // upsert that produces a legacy+runtime mix or a missing required
  // field even if the coerce step let it through.
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

/** Build the raw YAML-mapping-compatible object for an upsert payload.
 *  Only sets fields that were provided; the loader supplies its own
 *  defaults on read. */
function renderAgentYamlEntry(p: UpsertPayload): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: p.name,
    role: p.role,
    specialties: p.specialties,
    concurrency: p.concurrency,
    dedicated: p.dedicated,
  };
  if (p.description !== undefined) entry.description = p.description;
  if (p.command !== undefined) {
    entry.command = p.command;
    entry.args = p.args ?? [];
  }
  if (p.runtime !== undefined) {
    entry.runtime = p.runtime;
    if (p.prompt !== undefined) entry.prompt = p.prompt;
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
