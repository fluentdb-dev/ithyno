// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile, watch } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Agent registry — loads `agents.yaml` at the project root, validates the
 * shape, resolves template variables before each spawn, and reloads on file
 * change. Holds the last-known-good registry so a malformed edit only
 * surfaces as an error banner without taking the dashboard down.
 */
export type AgentDef = {
  name: string;
  description?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** Optional initial prompt written to the child's stdin at spawn time.
   *  Supports the same `${change_id}` / `${worktree_path}` / `${branch}`
   *  template variables as `args` and `env`. See add-agent-initial-input. */
  initialInput?: string;
  /** Agent role, defaulted to "coder". Open set — later phases add
   *  "reviewer", "proposer", etc. Not consumed yet (Phase 1 metadata only). */
  role: string;
  /** Tag prefixes this agent claims expertise in (e.g. `area/web`). Empty
   *  array means "accepts any tag". Not consumed yet (Phase 1 metadata only). */
  specialties: string[];
  /** Declared job-parallelism capacity, defaulted to 1. Integer ≥ 1.
   *  Not enforced by the runner — recorded for a later dispatcher. */
  concurrency: number;
  /** When true (the default), each job gets a dedicated
   *  `.worktrees/<change-id>/` worktree — the pre-pool behavior. When
   *  false, jobs are leased from the shared pool per the top-level
   *  `worktreePool` block. See add-worktree-pool. */
  dedicated: boolean;
};

/** Resolved `worktreePool` config with defaults applied. Present in the
 *  loaded registry whether or not any agent has opted in, so consumers can
 *  read it without null-checking. */
export type WorktreePoolConfig = {
  max: number;
  namePrefix: string;
  cleanupBetweenJobs: "git-clean";
};

export const DEFAULT_WORKTREE_POOL: WorktreePoolConfig = {
  max: 5,
  namePrefix: "pool",
  cleanupBetweenJobs: "git-clean",
};

export type AgentConfig =
  | { ok: true; agents: AgentDef[]; worktreePool: WorktreePoolConfig }
  | { ok: false; agents: AgentDef[]; worktreePool: WorktreePoolConfig; error: string }; // agents = last-known-good

function validateAgents(raw: unknown): AgentDef[] {
  if (!raw || typeof raw !== "object") throw new Error("agents.yaml must be an object");
  const list = (raw as { agents?: unknown }).agents;
  if (!Array.isArray(list)) throw new Error("agents.yaml: `agents` must be a list");
  return list.map((a, i) => {
    if (!a || typeof a !== "object") throw new Error(`agents[${i}] must be an object`);
    const o = a as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.name) throw new Error(`agents[${i}].name is required`);
    if (typeof o.command !== "string" || !o.command) throw new Error(`agents[${i}].command is required`);
    const args = Array.isArray(o.args) ? o.args.map(String) : [];
    const env = o.env && typeof o.env === "object" ? Object.fromEntries(Object.entries(o.env as object).map(([k, v]) => [k, String(v)])) : undefined;
    const description = typeof o.description === "string" ? o.description : undefined;
    let initialInput: string | undefined;
    if (o.initialInput !== undefined) {
      if (typeof o.initialInput !== "string") {
        throw new Error(`agents[${i}].initialInput must be a string`);
      }
      initialInput = o.initialInput;
    }

    let role = "coder";
    if (o.role !== undefined) {
      if (typeof o.role !== "string" || !o.role) {
        throw new Error(`agents[${i}].role must be a non-empty string`);
      }
      role = o.role;
    }

    let specialties: string[] = [];
    if (o.specialties !== undefined) {
      if (!Array.isArray(o.specialties)) {
        throw new Error(`agents[${i}].specialties must be an array of non-empty strings`);
      }
      specialties = o.specialties.map((v, j) => {
        if (typeof v !== "string" || !v) {
          throw new Error(`agents[${i}].specialties[${j}] must be a non-empty string`);
        }
        return v;
      });
    }

    let concurrency = 1;
    if (o.concurrency !== undefined) {
      if (typeof o.concurrency !== "number" || !Number.isInteger(o.concurrency) || o.concurrency < 1) {
        throw new Error(`agents[${i}].concurrency must be an integer >= 1`);
      }
      concurrency = o.concurrency;
    }

    let dedicated = true;
    if (o.dedicated !== undefined) {
      if (typeof o.dedicated !== "boolean") {
        throw new Error(`agents[${i}].dedicated must be a boolean`);
      }
      dedicated = o.dedicated;
    }

    return { name: o.name, command: o.command, args, env, description, initialInput, role, specialties, concurrency, dedicated };
  });
}

const KNOWN_POOL_KEYS = new Set(["max", "namePrefix", "cleanupBetweenJobs"]);

function validateWorktreePool(raw: unknown): WorktreePoolConfig {
  if (raw === undefined || raw === null) return { ...DEFAULT_WORKTREE_POOL };
  if (typeof raw !== "object") throw new Error("worktreePool must be an object");
  const o = raw as Record<string, unknown>;

  for (const key of Object.keys(o)) {
    if (!KNOWN_POOL_KEYS.has(key)) {
      throw new Error(`worktreePool.${key}: unknown key`);
    }
  }

  const cfg: WorktreePoolConfig = { ...DEFAULT_WORKTREE_POOL };

  if (o.max !== undefined) {
    if (typeof o.max !== "number" || !Number.isInteger(o.max) || o.max < 1) {
      throw new Error("worktreePool.max must be an integer >= 1");
    }
    cfg.max = o.max;
  }

  if (o.namePrefix !== undefined) {
    if (typeof o.namePrefix !== "string" || !o.namePrefix) {
      throw new Error("worktreePool.namePrefix must be a non-empty string");
    }
    cfg.namePrefix = o.namePrefix;
  }

  if (o.cleanupBetweenJobs !== undefined) {
    if (o.cleanupBetweenJobs !== "git-clean") {
      throw new Error(
        `worktreePool.cleanupBetweenJobs: "${String(o.cleanupBetweenJobs)}" is not yet supported (Phase 1 accepts only "git-clean")`,
      );
    }
    cfg.cleanupBetweenJobs = "git-clean";
  }

  return cfg;
}

export class AgentRegistry {
  private cache: AgentConfig = { ok: true, agents: [], worktreePool: { ...DEFAULT_WORKTREE_POOL } };
  private projectRoot: string;
  private watcher: any = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async load(): Promise<void> {
    const path = join(this.projectRoot, "agents.yaml");
    if (!existsSync(path)) {
      this.cache = { ok: true, agents: [], worktreePool: { ...DEFAULT_WORKTREE_POOL } };
      return;
    }
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseYaml(raw);
      const agents = validateAgents(parsed);
      const worktreePool = validateWorktreePool(
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).worktreePool : undefined,
      );
      this.cache = { ok: true, agents, worktreePool };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.cache = { ok: false, agents: this.cache.agents, worktreePool: this.cache.worktreePool, error: msg };
    }
  }

  async startWatching(onChange?: () => void): Promise<void> {
    const path = join(this.projectRoot, "agents.yaml");
    if (!existsSync(path)) return;
    try {
      this.watcher = watch(path);
      void (async () => {
        for await (const _ of this.watcher) {
          await this.load();
          onChange?.();
        }
      })();
    } catch {
      // best-effort; the dashboard still works without auto-reload
    }
  }

  /** Public config (env values are redacted before going on the wire). */
  publicConfig(): {
    ok: boolean;
    error?: string;
    agents: Array<Omit<AgentDef, "env"> & { hasEnv: boolean }>;
  } {
    const sanitized = this.cache.agents.map(({ env, ...rest }) => ({
      ...rest,
      hasEnv: !!env && Object.keys(env).length > 0,
    }));
    if (!this.cache.ok) {
      return { ok: false, error: this.cache.error, agents: sanitized };
    }
    return { ok: true, agents: sanitized };
  }

  find(name: string): AgentDef | null {
    return this.cache.agents.find((a) => a.name === name) ?? null;
  }

  /** Resolved worktree pool config (with defaults applied). Present whether
   *  or not any agent has opted in via `dedicated: false`. */
  worktreePoolConfig(): WorktreePoolConfig {
    return this.cache.worktreePool;
  }

  /** Resolve `${change_id}` etc. in args, env, and initialInput strings. */
  resolve(
    def: AgentDef,
    vars: { change_id: string; worktree_path: string; branch: string },
  ): { args: string[]; env: Record<string, string>; initialInput?: string } {
    const replace = (s: string): string =>
      s
        .replace(/\$\{change_id\}/g, vars.change_id)
        .replace(/\$\{worktree_path\}/g, vars.worktree_path)
        .replace(/\$\{branch\}/g, vars.branch);
    const args = def.args.map(replace);
    const env: Record<string, string> = {};
    if (def.env) for (const [k, v] of Object.entries(def.env)) env[k] = replace(v);
    const initialInput = def.initialInput === undefined ? undefined : replace(def.initialInput);
    return { args, env, initialInput };
  }
}
