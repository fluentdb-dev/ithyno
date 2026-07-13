// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile, watch } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Agent registry — loads `agents.yaml`, validates+normalizes shapes, and
 * resolves per-role prompts at spawn time. Reloads on file change. Holds a
 * last-known-good cache so a malformed edit only surfaces as an error
 * banner without taking the dashboard down.
 *
 * See openspec/changes/reshape-agents-yaml-mode-roles for the schema:
 *
 *   - `mode: single-prompt | live-shell` — controls spawn behavior
 *   - `roles: string[]` — dispatch labels (single-role and multi-role OK)
 *   - `prompts: { <role>: string }` — per-role prompt override
 *   - `runtime?: string` — shared-defaults reference (command/args/prompts)
 *
 * Old shapes (scalar `role`, `initialInput`, `runtime + prompt` without
 * `mode`/`roles`) are normalized into the new schema at load time with a
 * warning. See {@link normalizeAgent} below.
 */

export type PromptStyle = "cli-arg" | "stdin" | "file";
export type DiffStrategy = "git" | "aider-native" | "none";
export type AgentMode = "single-prompt" | "live-shell";

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
  /** Optional shared per-role prompt defaults inherited by agents that
   *  reference this runtime. Resolution order at dispatch is
   *  agent.prompts → runtime.prompts → built-in defaults. */
  prompts?: Record<string, string>;
  supports: RuntimeSupports;
};

export type AgentDef = {
  name: string;
  description?: string;
  /** Direct command (mutually exclusive with inheriting from runtime).
   *  When `runtime` is also set, the local value wins. */
  command?: string;
  /** Direct args. When `runtime` is also set, the local value wins over
   *  `runtime.baseArgs`. */
  args?: string[];
  env?: Record<string, string>;
  /** Shared-defaults reference (see `Runtime-Backed Agents`). Optional. */
  runtime?: string;
  /** Spawn mode (required). single-prompt → headless with `-p`; live-shell
   *  → PTY session, prompt typed into stdin after boot. */
  mode: AgentMode;
  /** Dispatch labels this agent can receive (non-empty). At most one
   *  agent may include `manager`. Manager agents must be `live-shell`. */
  roles: string[];
  /** Per-role prompt overrides. Resolution: agent.prompts → runtime.prompts
   *  → built-in default (`/opsx:apply|review|verify|manage ${change_id}`).
   *  See {@link resolvePromptForRole} and {@link BUILT_IN_ROLE_PROMPTS}. */
  prompts?: Record<string, string>;
  /** Tag prefixes this agent claims expertise in (e.g. `area/web`). Empty
   *  array or `["any"]` means wildcard. */
  specialties: string[];
  /** Declared job-parallelism capacity, defaulted to 1. Integer ≥ 1. */
  concurrency: number;
  /** When true (default), each job gets a dedicated `.worktrees/<change-id>/`
   *  worktree. When false, jobs are leased from the shared pool. */
  dedicated: boolean;

  // ---- deprecated read aliases (kept for downstream consumers that
  // predate the mode+roles reshape; populated from the normalized fields) ----

  /** Deprecated. Equals `roles[0]` after normalization. Downstream code
   *  reading `agent.role` should migrate to `roles[]`. */
  role: string;
  /** Deprecated. Populated from `prompts[roles[0]]` for the single-role
   *  legacy consumers (Manager PTY startup, existing runner path). */
  initialInput?: string;
  /** Deprecated. Populated from `prompts[roles[0]]` for the single-role
   *  runtime-backed consumers. */
  prompt?: string;
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
  | { ok: true; agents: AgentDef[]; runtimes: Record<string, RuntimeDef>; worktreePool: WorktreePoolConfig; warnings: string[] }
  | {
      ok: false;
      agents: AgentDef[]; // last-known-good
      runtimes: Record<string, RuntimeDef>; // last-known-good
      worktreePool: WorktreePoolConfig;
      warnings: string[];
      error: string;
    };

const PROMPT_STYLES: readonly PromptStyle[] = ["cli-arg", "stdin", "file"];
const DIFF_STRATEGIES: readonly DiffStrategy[] = ["git", "aider-native", "none"];
const AGENT_MODES: readonly AgentMode[] = ["single-prompt", "live-shell"];
const KNOWN_RUNTIME_KEYS = new Set([
  "command",
  "baseArgs",
  "promptStyle",
  "promptFlag",
  "prompts",
  "supports",
]);
const KNOWN_SUPPORTS_KEYS = new Set(["interactive", "artifactOutput", "diff"]);
const KNOWN_AGENT_KEYS = new Set([
  "name",
  "description",
  "command",
  "args",
  "env",
  "runtime",
  "prompt",
  "prompts",
  "mode",
  "role",
  "roles",
  "specialties",
  "concurrency",
  "dedicated",
  "initialInput",
]);

/** Built-in per-role prompt defaults. When neither the agent nor its
 *  runtime declares `prompts.<role>`, dispatch falls back to these. */
export const BUILT_IN_ROLE_PROMPTS: Readonly<Record<string, string>> = {
  code: "/opsx:apply ${change_id}",
  coder: "/opsx:apply ${change_id}", // deprecated alias for "code"
  review: "/opsx:review ${change_id}",
  verify: "/opsx:verify ${change_id}",
  manager: "/opsx:manage",
};

function validatePromptsMap(
  raw: unknown,
  context: string,
): Record<string, string> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${context}.prompts must be an object mapping role → template`);
  }
  const out: Record<string, string> = {};
  for (const [role, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!role) throw new Error(`${context}.prompts: role name must be non-empty`);
    if (typeof val !== "string") {
      throw new Error(`${context}.prompts.${role} must be a string`);
    }
    out[role] = val;
  }
  return out;
}

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
    const prompts = validatePromptsMap(o.prompts, `runtimes.${name}`);
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
      prompts,
      supports: {
        interactive: sup.interactive,
        artifactOutput: sup.artifactOutput,
        diff: sup.diff as DiffStrategy,
      },
    };
  }
  return out;
}

/**
 * Normalize a single raw agent entry into the internal AgentDef shape.
 * Accepts both the new `mode + roles + prompts` schema and the pre-Phase-5
 * shapes (`role` scalar, `initialInput`, `runtime + prompt` without mode).
 *
 * Pushes human-readable notes into `warnings` when any normalization fires
 * so the load surface can flag the entry as using a deprecated shape.
 * Warnings are non-fatal — the agent still loads.
 *
 * Throws when the entry cannot be normalized (structural error, unknown
 * key, ambiguous multi-role legacy combination).
 */
function normalizeAgent(
  raw: unknown,
  index: number,
  warnings: string[],
): AgentDef {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`agents[${index}] must be an object`);
  }
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    if (!KNOWN_AGENT_KEYS.has(key)) {
      throw new Error(`agents[${index}].${key}: unknown key`);
    }
  }
  if (typeof o.name !== "string" || !o.name) {
    throw new Error(`agents[${index}].name is required`);
  }
  const label = `agents[${index}]`;

  // ---- roles[] normalization (scalar `role` → `[role]`) ----
  let roles: string[];
  const rawRoles = o.roles;
  const rawScalarRole = o.role;
  if (rawRoles !== undefined) {
    if (!Array.isArray(rawRoles) || rawRoles.length === 0) {
      throw new Error(`${label}.roles must be a non-empty array of strings`);
    }
    roles = rawRoles.map((r, j) => {
      if (typeof r !== "string" || !r) {
        throw new Error(`${label}.roles[${j}] must be a non-empty string`);
      }
      return r === "coder" ? "code" : r;
    });
    if (rawScalarRole !== undefined) {
      throw new Error(`${label}: cannot declare both 'role' (scalar) and 'roles' (array); use 'roles' only`);
    }
  } else if (rawScalarRole !== undefined) {
    if (typeof rawScalarRole !== "string" || !rawScalarRole) {
      throw new Error(`${label}.role must be a non-empty string`);
    }
    const normalized = rawScalarRole === "coder" ? "code" : rawScalarRole;
    if (rawScalarRole !== normalized) {
      warnings.push(
        `${label}: 'role: ${rawScalarRole}' normalized to 'roles: [${normalized}]' (coder→code alias)`,
      );
    } else {
      warnings.push(
        `${label}: 'role: ${rawScalarRole}' normalized to 'roles: [${rawScalarRole}]' (scalar → array, deprecated shape)`,
      );
    }
    roles = [normalized];
  } else {
    // No role AND no roles — default to code (matches pre-existing coder default).
    roles = ["code"];
    warnings.push(`${label}: no 'role' or 'roles' declared; defaulted to roles: [code]`);
  }

  // ---- runtime/command/args ----
  let runtime: string | undefined;
  if (o.runtime !== undefined) {
    if (typeof o.runtime !== "string" || !o.runtime) {
      throw new Error(`${label}.runtime must be a non-empty string`);
    }
    runtime = o.runtime;
  }

  let command: string | undefined;
  if (o.command !== undefined) {
    if (typeof o.command !== "string" || !o.command) {
      throw new Error(`${label}.command must be a non-empty string`);
    }
    command = o.command;
  }

  let args: string[] | undefined;
  if (o.args !== undefined) {
    if (!Array.isArray(o.args)) {
      throw new Error(`${label}.args must be an array of strings`);
    }
    args = o.args.map(String);
  }

  if (!runtime && !command) {
    throw new Error(`${label}: must declare either 'command' or 'runtime'`);
  }

  // ---- prompts + legacy prompt/initialInput folding ----
  const promptsFromField = validatePromptsMap(o.prompts, label);
  const prompts: Record<string, string> = { ...(promptsFromField ?? {}) };

  const rawLegacyPrompt = o.prompt;
  if (rawLegacyPrompt !== undefined) {
    if (typeof rawLegacyPrompt !== "string") {
      throw new Error(`${label}.prompt must be a string`);
    }
    if (roles.length > 1) {
      throw new Error(
        `${label}: legacy 'prompt' cannot be used on a multi-role agent (roles: [${roles.join(", ")}]); use 'prompts:' map instead`,
      );
    }
    if (prompts[roles[0]] === undefined) {
      prompts[roles[0]] = rawLegacyPrompt;
    }
    warnings.push(
      `${label}: legacy 'prompt' folded into 'prompts.${roles[0]}' (deprecated shape)`,
    );
  }

  const rawInitialInput = o.initialInput;
  if (rawInitialInput !== undefined) {
    if (typeof rawInitialInput !== "string") {
      throw new Error(`${label}.initialInput must be a string`);
    }
    if (roles.length > 1) {
      throw new Error(
        `${label}: legacy 'initialInput' cannot be used on a multi-role agent (roles: [${roles.join(", ")}]); use 'prompts:' map instead`,
      );
    }
    if (prompts[roles[0]] === undefined) {
      prompts[roles[0]] = rawInitialInput;
    }
    warnings.push(
      `${label}: legacy 'initialInput' folded into 'prompts.${roles[0]}' (deprecated shape)`,
    );
  }

  // ---- mode (required after normalization) ----
  let mode: AgentMode;
  if (o.mode !== undefined) {
    if (typeof o.mode !== "string" || !AGENT_MODES.includes(o.mode as AgentMode)) {
      throw new Error(`${label}.mode must be one of ${AGENT_MODES.join(", ")}`);
    }
    mode = o.mode as AgentMode;
  } else {
    // Synthesize: manager → live-shell, everything else → single-prompt.
    mode = roles.includes("manager") ? "live-shell" : "single-prompt";
    warnings.push(
      `${label}: no 'mode' declared; synthesized ${mode} from roles (deprecated shape)`,
    );
  }

  // ---- Manager-mode gate: manager MUST be live-shell ----
  if (roles.includes("manager") && mode !== "live-shell") {
    throw new Error(
      `${label}: role 'manager' requires mode: live-shell (got '${mode}')`,
    );
  }

  // ---- env ----
  const env =
    o.env && typeof o.env === "object"
      ? Object.fromEntries(
          Object.entries(o.env as object).map(([k, v]) => [k, String(v)]),
        )
      : undefined;

  const description = typeof o.description === "string" ? o.description : undefined;

  // ---- specialties / concurrency / dedicated ----
  let specialties: string[] = [];
  if (o.specialties !== undefined) {
    if (!Array.isArray(o.specialties)) {
      throw new Error(`${label}.specialties must be an array of non-empty strings`);
    }
    specialties = o.specialties.map((v, j) => {
      if (typeof v !== "string" || !v) {
        throw new Error(`${label}.specialties[${j}] must be a non-empty string`);
      }
      return v;
    });
  }

  let concurrency = 1;
  if (o.concurrency !== undefined) {
    if (typeof o.concurrency !== "number" || !Number.isInteger(o.concurrency) || o.concurrency < 1) {
      throw new Error(`${label}.concurrency must be an integer >= 1`);
    }
    concurrency = o.concurrency;
  }

  let dedicated = true;
  if (o.dedicated !== undefined) {
    if (typeof o.dedicated !== "boolean") {
      throw new Error(`${label}.dedicated must be a boolean`);
    }
    dedicated = o.dedicated;
  }

  const primaryRole = roles[0];
  return {
    name: o.name,
    description,
    command,
    args,
    env,
    runtime,
    mode,
    roles,
    prompts: Object.keys(prompts).length > 0 ? prompts : undefined,
    specialties,
    concurrency,
    dedicated,
    // deprecated read aliases
    role: primaryRole,
    initialInput: prompts[primaryRole],
    prompt: prompts[primaryRole],
  };
}

/**
 * Validate the `agents:` list. Exported so config-writer can reject bad
 * payloads against the same rules the loader enforces.
 *
 * When `warningsOut` is provided, load-time normalization warnings are
 * pushed into it (one per deprecated-shape rewrite). When omitted,
 * warnings are silently dropped (the write path doesn't care).
 */
export function validateAgents(raw: unknown, warningsOut?: string[]): AgentDef[] {
  if (!raw || typeof raw !== "object") throw new Error("agents.yaml must be an object");
  const list = (raw as { agents?: unknown }).agents;
  if (!Array.isArray(list)) throw new Error("agents.yaml: `agents` must be a list");
  const warnings = warningsOut ?? [];
  const agents = list.map((a, i) => normalizeAgent(a, i, warnings));

  // Manager singleton — at most one agent may include 'manager' in roles.
  const managerIndexes: number[] = [];
  agents.forEach((a, i) => {
    if (a.roles.includes("manager")) managerIndexes.push(i);
  });
  if (managerIndexes.length > 1) {
    throw new Error(
      `agents[${managerIndexes[1]}]: only one agent may include 'manager' in roles (first at agents[${managerIndexes[0]}])`,
    );
  }
  return agents;
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

/**
 * Resolve a prompt for a given (agent, role) pair using the 3-tier chain:
 * agent.prompts[role] → runtime.prompts[role] → built-in default.
 * Returns undefined only for unknown roles with no override at any level
 * (e.g., `role: other` without an explicit `prompts.other`).
 *
 * Does NOT apply template substitution — that happens in `resolve()`.
 */
export function resolvePromptForRole(
  agent: AgentDef,
  runtimes: Record<string, RuntimeDef>,
  role: string,
): string | undefined {
  const agentPrompt = agent.prompts?.[role];
  if (agentPrompt !== undefined) return agentPrompt;
  if (agent.runtime) {
    const runtimePrompt = runtimes[agent.runtime]?.prompts?.[role];
    if (runtimePrompt !== undefined) return runtimePrompt;
  }
  return BUILT_IN_ROLE_PROMPTS[role];
}

export class AgentRegistry {
  private cache: AgentConfig = {
    ok: true,
    agents: [],
    runtimes: {},
    worktreePool: { ...DEFAULT_WORKTREE_POOL },
    warnings: [],
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
        warnings: [],
      };
      return;
    }
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseYaml(raw);
      const runtimes = validateRuntimes(
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).runtimes : undefined,
      );
      const warnings: string[] = [];
      const agents = validateAgents(parsed, warnings);
      const worktreePool = validateWorktreePool(
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).worktreePool : undefined,
      );
      if (warnings.length > 0) {
        for (const w of warnings) console.warn(`[registry] ${w}`);
      }
      this.cache = { ok: true, agents, runtimes, worktreePool, warnings };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.cache = {
        ok: false,
        agents: this.cache.agents,
        runtimes: this.cache.runtimes,
        worktreePool: this.cache.worktreePool,
        warnings: this.cache.warnings,
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
    warnings: string[];
  } {
    const sanitized = this.cache.agents.map(({ env, ...rest }) => ({
      ...rest,
      hasEnv: !!env && Object.keys(env).length > 0,
    }));
    if (!this.cache.ok) {
      return {
        ok: false,
        error: this.cache.error,
        agents: sanitized,
        runtimes: this.cache.runtimes,
        warnings: this.cache.warnings,
      };
    }
    return {
      ok: true,
      agents: sanitized,
      runtimes: this.cache.runtimes,
      warnings: this.cache.warnings,
    };
  }

  find(name: string): AgentDef | null {
    return this.cache.agents.find((a) => a.name === name) ?? null;
  }

  /**
   * The first agent whose `roles` include `manager`, or `null` if none.
   * The embedded Terminal panel uses this to pick its PTY startup command.
   */
  managerAgent(): AgentDef | null {
    return this.cache.agents.find((a) => a.roles.includes("manager")) ?? null;
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
   * Resolve template variables, apply per-role prompt resolution, and
   * expand the runtime lookup into a concrete command + args tuple.
   *
   * `role` is the dispatched role — the specific role that was requested
   * (not the agent's whole `roles` array). When omitted, defaults to
   * `agent.roles[0]` (Manager PTY startup / single-role legacy path).
   *
   * @throws when `agent.runtime` references an unknown runtime, when the
   *   agent has no command and no runtime, when the resolved runtime
   *   uses `promptStyle: file`, or when the dispatched role has no
   *   prompt at any resolution tier.
   */
  resolve(
    def: AgentDef,
    vars: {
      change_id: string;
      worktree_path: string;
      branch: string;
      /** Optional per-dispatch session ID substituted for `${session_id}`
       *  in args, env, and per-role prompts. When absent or empty, the
       *  token is replaced with the literal empty string (matches the
       *  always-defined convention of the other vars).
       *  See add-session-id-template-var. */
      session_id?: string;
    },
    role?: string,
  ): {
    command: string;
    args: string[];
    env: Record<string, string>;
    initialInput?: string;
    /** How the resolved initialInput should be delivered to the child.
     *  `"cli-arg"` — runner unshifts `[promptFlag, initialInput]` before
     *  `args`. `"stdin"` — runner writes `initialInput` to child.stdin.
     *  `"pty"` — live-shell mode; runner types `initialInput` into the
     *  PTY after boot. */
    initialInputMode: "cli-arg" | "stdin" | "pty";
  } {
    const sessionId = vars.session_id ?? "";
    const replace = (s: string): string =>
      s
        .replace(/\$\{change_id\}/g, vars.change_id)
        .replace(/\$\{worktree_path\}/g, vars.worktree_path)
        .replace(/\$\{branch\}/g, vars.branch)
        .replace(/\$\{session_id\}/g, sessionId);

    const dispatchedRole = role ?? def.roles[0];
    const env: Record<string, string> = {};
    if (def.env) for (const [k, v] of Object.entries(def.env)) env[k] = replace(v);

    // Resolve command + args + prompt-delivery style.
    let command: string;
    let args: string[];
    let promptStyle: PromptStyle = "cli-arg";
    let promptFlag: string | undefined = "-p";
    /** When true, the agent OWNS its full args — no auto-appending of the
     *  resolved prompt. Set for command-only agents whose args are hand-
     *  authored (`command + args` legacy shape without a runtime). */
    let userAuthoredArgs = false;

    if (def.runtime !== undefined) {
      const runtime = this.cache.runtimes[def.runtime];
      if (!runtime) {
        throw new Error(
          `agent '${def.name}' references unknown runtime '${def.runtime}'; declared runtimes: ${Object.keys(this.cache.runtimes).join(", ") || "(none)"}`,
        );
      }
      command = def.command ?? runtime.command;
      // Local args override runtime.baseArgs — user opt-in to hand-authored args.
      if (def.args !== undefined) {
        args = def.args.map(replace);
        userAuthoredArgs = true;
      } else {
        args = runtime.baseArgs.map(replace);
      }
      promptStyle = runtime.promptStyle;
      promptFlag = runtime.promptFlag; // may be undefined — matches pre-reshape "flag optional" semantics
      if (promptStyle === "file") {
        throw new Error(
          `runtime '${def.runtime}' uses promptStyle: file which is not yet supported`,
        );
      }
    } else {
      command = def.command ?? "";
      args = (def.args ?? []).map(replace);
      // Command-only agents: the user hand-authored args (likely including
      // their own `-p` and prompt template). Skip auto-append.
      userAuthoredArgs = true;
    }

    // Resolve the prompt for the dispatched role.
    const promptTemplate = resolvePromptForRole(def, this.cache.runtimes, dispatchedRole);
    const resolvedPrompt = promptTemplate === undefined ? undefined : replace(promptTemplate);

    // Wire the prompt into the runner. Behavior by mode:
    //
    //   - `live-shell` — runner types resolvedPrompt into the PTY after
    //     boot. `initialInputMode: "pty"`.
    //   - `single-prompt` + `promptStyle: stdin` — runner writes
    //     resolvedPrompt to child.stdin. `initialInputMode: "stdin"`.
    //   - `single-prompt` + `promptStyle: cli-arg` — resolve() appends
    //     `[promptFlag, resolvedPrompt]` to args (preserving the pre-
    //     reshape ordering). `initialInputMode: "cli-arg"` + `initialInput`
    //     left undefined so the runner doesn't double-add.
    //
    // For command-only agents whose args are hand-authored, we do NOT
    // auto-append. Users own their full argv.
    let initialInputMode: "cli-arg" | "stdin" | "pty";
    let initialInput: string | undefined;
    let effectiveArgs = args;

    if (def.mode === "live-shell") {
      if (resolvedPrompt === undefined) {
        throw new Error(
          `agent '${def.name}': no prompt configured for role '${dispatchedRole}' (agent.prompts, runtime.prompts, and built-in defaults are all empty)`,
        );
      }
      initialInputMode = "pty";
      initialInput = resolvedPrompt;
    } else if (promptStyle === "stdin") {
      if (resolvedPrompt === undefined) {
        throw new Error(
          `agent '${def.name}': no prompt configured for role '${dispatchedRole}'`,
        );
      }
      initialInputMode = "stdin";
      initialInput = resolvedPrompt;
    } else {
      // cli-arg
      initialInputMode = "cli-arg";
      initialInput = undefined;
      if (!userAuthoredArgs && resolvedPrompt !== undefined) {
        effectiveArgs = promptFlag
          ? [...args, promptFlag, resolvedPrompt]
          : [...args, resolvedPrompt];
      }
    }

    return { command, args: effectiveArgs, env, initialInput, initialInputMode };
  }
}

/**
 * Human-readable runtime label for an agent. Runtime-referenced agents
 * carry the runtime name; agents that declare `command` locally without a
 * runtime get the literal "legacy". Used by the Job model so downstream
 * UIs can display the runtime without a null-check.
 */
export function runtimeLabel(agent: AgentDef): string {
  return agent.runtime ?? "legacy";
}
