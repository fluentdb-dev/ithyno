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
};

export type AgentConfig =
  | { ok: true; agents: AgentDef[] }
  | { ok: false; agents: AgentDef[]; error: string }; // agents = last-known-good

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
    return { name: o.name, command: o.command, args, env, description, initialInput };
  });
}

export class AgentRegistry {
  private cache: AgentConfig = { ok: true, agents: [] };
  private projectRoot: string;
  private watcher: any = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async load(): Promise<void> {
    const path = join(this.projectRoot, "agents.yaml");
    if (!existsSync(path)) {
      this.cache = { ok: true, agents: [] };
      return;
    }
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseYaml(raw);
      const agents = validateAgents(parsed);
      this.cache = { ok: true, agents };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.cache = { ok: false, agents: this.cache.agents, error: msg };
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
