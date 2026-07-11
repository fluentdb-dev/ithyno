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
 *
 * Two agent shapes are accepted (add-runtime-abstraction):
 *   1. Legacy: `command + args` — direct CLI invocation
 *   2. Runtime-backed: `runtime + prompt` — references a `runtimes:` entry
 *      that declares command, baseArgs, promptStyle, promptFlag, supports
 *
 * Each agent MUST pick exactly one shape. Both cohabit in the same
 * registry so migrations can proceed one agent at a time.
 */

export type PromptStyle = "cli-arg" | "stdin" | "file";
export type DiffStrategy = "git" | "aider-native" | "none";

export type RuntimeSupports = {
  interactive: boolean;
  artifactOutput: boolean;
  diff: DiffStrategy;
};

export type RuntimeDef = {
  name: string;
  command: string;
  baseArgs: string[];
  promptStyle: PromptStyle;
  /** Optional CLI flag placed immediately before the prompt when
   *  promptStyle is `cli-arg`. Ignored for other prompt styles. */
  promptFlag?: string;
  supports: RuntimeSupports;
};

export type AgentDef = {
  name: string;
  description?: string;
  /** Legacy shape: the raw CLI command to spawn. Mutually exclusive
   *  with `runtime`. */
  command?: string;
  /** Legacy shape: raw CLI args. Mutually exclusive with `prompt`. */
  args?: string[];
  env?: Record<string, string>;
  /** Optional initial prompt written to the child's stdin at spawn time.
   *  Supports the same `${change_id}` / `${worktree_path}` / `${branch}`
   *  template variables as `args` and `env`. See add-agent-initial-input. */
  initialInput?: string;
  /** Runtime-backed shape: name of an entry in `runtimes:`. Mutually
   *  exclusive with `command`. See add-runtime-abstraction. */
  runtime?: string;
  /** Runtime-backed shape: prompt template resolved and injected per the
   *  runtime's promptStyle. Mutually exclusive with `args`. */
  prompt?: string;
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
  | { ok: true; agents: AgentDef[]; runtimes: Record<string, RuntimeDef>; worktreePool: WorktreePoolConfig }
  | {
      ok: false;
      agents: AgentDef[]; // last-known-good
      runtimes: Record<string, RuntimeDef>; // last-known-good
      worktreePool: WorktreePoolConfig;
      error: string;
    };

const PROMPT_STYLES: readonly PromptStyle[] = ["cli-arg", "stdin", "file"];
const DIFF_STRATEGIES: readonly DiffStrategy[] = ["git", "aider-native", "none"];
const KNOWN_RUNTIME_KEYS = new Set(["command", "baseArgs", "promptStyle", "promptFlag", "supports"]);
const KNOWN_SUPPORTS_KEYS = new Set(["interactive", "artifactOutput", "diff"]);

function validateRuntimes(raw: unknown): Record<string, RuntimeDef> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("runtimes must be an object");
  }
  const out: Record<string, RuntimeDef> = {};
  for (const [name, rawEntry] of Object.entries(raw as Record<string, unknown>)) {
    if (!name) throw new Error("runtimes: entry name must be non-empty");
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      throw new Error(`runtimes.${name}: must be an object`);
    }
    const o = rawEntry as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      if (!KNOWN_RUNTIME_KEYS.has(key)) {
        throw new Error(`runtimes.${name}.${key}: unknown key`);
      }
    }
    if (typeof o.command !== "string" || !o.command) {
      throw new Error(`runtimes.${name}.command is required`);
    }
    if (o.baseArgs !== undefined && !Array.isArray(o.baseArgs)) {
      throw new Error(`runtimes.${name}.baseArgs must be an array of strings`);
    }
    const baseArgs = Array.isArray(o.baseArgs) ? o.baseArgs.map(String) : [];
    if (typeof o.promptStyle !== "string" || !PROMPT_STYLES.includes(o.promptStyle as PromptStyle)) {
      throw new Error(
        `runtimes.${name}.promptStyle must be one of ${PROMPT_STYLES.join(", ")}`,
      );
    }
    const promptStyle = o.promptStyle as PromptStyle;
    let promptFlag: string | undefined;
    if (o.promptFlag !== undefined) {
      if (typeof o.promptFlag !== "string" || !o.promptFlag) {
        throw new Error(`runtimes.${name}.promptFlag must be a non-empty string`);
      }
      promptFlag = o.promptFlag;
    }
    if (!o.supports || typeof o.supports !== "object" || Array.isArray(o.supports)) {
      throw new Error(`runtimes.${name}.supports must be an object`);
    }
    const sup = o.supports as Record<string, unknown>;
    for (const key of Object.keys(sup)) {
      if (!KNOWN_SUPPORTS_KEYS.has(key)) {
        throw new Error(`runtimes.${name}.supports.${key}: unknown key`);
      }
    }
    if (typeof sup.interactive !== "boolean") {
      throw new Error(`runtimes.${name}.supports.interactive must be a boolean`);
    }
    if (typeof sup.artifactOutput !== "boolean") {
      throw new Error(`runtimes.${name}.supports.artifactOutput must be a boolean`);
    }
    if (typeof sup.diff !== "string" || !DIFF_STRATEGIES.includes(sup.diff as DiffStrategy)) {
      throw new Error(
        `runtimes.${name}.supports.diff must be one of ${DIFF_STRATEGIES.join(", ")}`,
      );
    }
    out[name] = {
      name,
      command: o.command,
      baseArgs,
      promptStyle,
      promptFlag,
      supports: {
        interactive: sup.interactive,
        artifactOutput: sup.artifactOutput,
        diff: sup.diff as DiffStrategy,
      },
    };
  }
  return out;
}

function validateAgents(raw: unknown): AgentDef[] {
  if (!raw || typeof raw !== "object") throw new Error("agents.yaml must be an object");
  const list = (raw as { agents?: unknown }).agents;
  if (!Array.isArray(list)) throw new Error("agents.yaml: `agents` must be a list");
  return list.map((a, i) => {
    if (!a || typeof a !== "object") throw new Error(`agents[${i}] must be an object`);
    const o = a as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.name) throw new Error(`agents[${i}].name is required`);

    // Runtime-backed vs. legacy shape: exactly one is required.
    const hasLegacyCommand = o.command !== undefined;
    const hasLegacyArgs = o.args !== undefined;
    const hasRuntime = o.runtime !== undefined;
    const hasPrompt = o.prompt !== undefined;

    const legacyShape = hasLegacyCommand || hasLegacyArgs;
    const runtimeShape = hasRuntime || hasPrompt;

    if (legacyShape && runtimeShape) {
      throw new Error(
        `agents[${i}]: cannot mix legacy (command/args) and runtime-backed (runtime/prompt) fields`,
      );
    }
    if (!legacyShape && !runtimeShape) {
      throw new Error(
        `agents[${i}]: must declare either (command + args) or (runtime + prompt)`,
      );
    }

    let command: string | undefined;
    let args: string[] | undefined;
    let runtime: string | undefined;
    let prompt: string | undefined;

    if (legacyShape) {
      if (typeof o.command !== "string" || !o.command) {
        throw new Error(`agents[${i}].command is required (legacy shape)`);
      }
      command = o.command;
      args = Array.isArray(o.args) ? o.args.map(String) : [];
    } else {
      if (typeof o.runtime !== "string" || !o.runtime) {
        throw new Error(`agents[${i}].runtime must be a non-empty string`);
      }
      runtime = o.runtime;
      if (typeof o.prompt !== "string" || o.prompt.length === 0) {
        throw new Error(`agents[${i}].prompt is required when runtime is set`);
      }
      prompt = o.prompt;
    }

    const env =
      o.env && typeof o.env === "object"
        ? Object.fromEntries(Object.entries(o.env as object).map(([k, v]) => [k, String(v)]))
        : undefined;
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

    return {
      name: o.name,
      command,
      args,
      runtime,
      prompt,
      env,
      description,
      initialInput,
      role,
      specialties,
      concurrency,
      dedicated,
    };
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
  private cache: AgentConfig = {
    ok: true,
    agents: [],
    runtimes: {},
    worktreePool: { ...DEFAULT_WORKTREE_POOL },
  };
  private projectRoot: string;
  private watcher: any = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async load(): Promise<void> {
    const path = join(this.projectRoot, "agents.yaml");
    if (!existsSync(path)) {
      this.cache = {
        ok: true,
        agents: [],
        runtimes: {},
        worktreePool: { ...DEFAULT_WORKTREE_POOL },
      };
      return;
    }
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseYaml(raw);
      const runtimes = validateRuntimes(
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).runtimes : undefined,
      );
      const agents = validateAgents(parsed);
      const worktreePool = validateWorktreePool(
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).worktreePool : undefined,
      );
      this.cache = { ok: true, agents, runtimes, worktreePool };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.cache = {
        ok: false,
        agents: this.cache.agents,
        runtimes: this.cache.runtimes,
        worktreePool: this.cache.worktreePool,
        error: msg,
      };
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
    runtimes: Record<string, RuntimeDef>;
  } {
    const sanitized = this.cache.agents.map(({ env, ...rest }) => ({
      ...rest,
      hasEnv: !!env && Object.keys(env).length > 0,
    }));
    if (!this.cache.ok) {
      return { ok: false, error: this.cache.error, agents: sanitized, runtimes: this.cache.runtimes };
    }
    return { ok: true, agents: sanitized, runtimes: this.cache.runtimes };
  }

  find(name: string): AgentDef | null {
    return this.cache.agents.find((a) => a.name === name) ?? null;
  }

  /** All configured runtimes (name → def). Empty when no runtimes: section
   *  is declared. */
  runtimes(): Record<string, RuntimeDef> {
    return this.cache.runtimes;
  }

  /** Resolved worktree pool config (with defaults applied). Present whether
   *  or not any agent has opted in via `dedicated: false`. */
  worktreePoolConfig(): WorktreePoolConfig {
    return this.cache.worktreePool;
  }

  /**
   * Resolve template variables and, for runtime-backed agents, expand
   * the runtime lookup into a concrete command + args. Legacy agents
   * (command + args) pass through with their fields intact.
   */
  resolve(
    def: AgentDef,
    vars: { change_id: string; worktree_path: string; branch: string },
  ): {
    command: string;
    args: string[];
    env: Record<string, string>;
    initialInput?: string;
    /** Where the runtime expects initialInput. For legacy agents this is
     *  `"cli-arg"` (retain the historical Claude-Code `-p <prompt>`
     *  promotion). Runtime-backed agents surface their declared prompt
     *  style so the runner routes the prompt to the right channel. */
    initialInputMode: "cli-arg" | "stdin";
  } {
    const replace = (s: string): string =>
      s
        .replace(/\$\{change_id\}/g, vars.change_id)
        .replace(/\$\{worktree_path\}/g, vars.worktree_path)
        .replace(/\$\{branch\}/g, vars.branch);

    const env: Record<string, string> = {};
    if (def.env) for (const [k, v] of Object.entries(def.env)) env[k] = replace(v);
    let initialInput = def.initialInput === undefined ? undefined : replace(def.initialInput);

    let command: string;
    let args: string[];
    let initialInputMode: "cli-arg" | "stdin" = "cli-arg";

    if (def.runtime !== undefined) {
      // Runtime-backed shape.
      const runtime = this.cache.runtimes[def.runtime];
      if (!runtime) {
        throw new Error(
          `agent '${def.name}' references unknown runtime '${def.runtime}'; declared runtimes: ${Object.keys(this.cache.runtimes).join(", ") || "(none)"}`,
        );
      }
      const resolvedPrompt = replace(def.prompt ?? "");
      const baseArgs = runtime.baseArgs.map(replace);
      command = runtime.command;
      if (runtime.promptStyle === "cli-arg") {
        args = runtime.promptFlag
          ? [...baseArgs, runtime.promptFlag, resolvedPrompt]
          : [...baseArgs, resolvedPrompt];
      } else if (runtime.promptStyle === "stdin") {
        args = baseArgs;
        // Runtime prompt takes over initialInput when the runtime is
        // stdin-styled AND the agent hasn't explicitly set one. If both
        // are present, the explicit initialInput wins (backward-compat
        // for agents authored before this change).
        if (initialInput === undefined) initialInput = resolvedPrompt;
        initialInputMode = "stdin";
      } else if (runtime.promptStyle === "file") {
        throw new Error(
          `runtime '${def.runtime}' uses promptStyle: file which is not yet supported`,
        );
      } else {
        // Exhaustiveness guard; validateRuntimes already rejects unknowns.
        throw new Error(
          `runtime '${def.runtime}' uses unsupported promptStyle: ${String(runtime.promptStyle)}`,
        );
      }
    } else {
      // Legacy shape.
      command = def.command ?? "";
      args = (def.args ?? []).map(replace);
    }

    return { command, args, env, initialInput, initialInputMode };
  }
}

/**
 * Human-readable runtime label for an agent. Runtime-backed agents carry
 * the runtime name; legacy `command + args` agents get the literal
 * "legacy". Used by the Job model (`add-agent-role-field` extension in
 * `extend-agent-job-model`) so downstream UIs can display the runtime
 * without a null-check.
 */
export function runtimeLabel(agent: AgentDef): string {
  return agent.runtime ?? "legacy";
}

