// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import chokidar, { type FSWatcher } from "chokidar";

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

export type AgentMode = "single-prompt" | "live-shell";

export type AgentDef = {
  name: string;
  description?: string;
  /** Command to spawn (required for single-prompt agents; workers only). */
  command?: string;
  /** Args for the spawned command. */
  args?: string[];
  env?: Record<string, string>;
  /** Spawn mode (required). single-prompt → headless with `-p`; live-shell
   *  → PTY session, prompt typed into stdin after boot. */
  mode: AgentMode;
  /** Dispatch labels this agent can receive (non-empty). At most one
   *  agent may include `manager`. Manager agents must be `live-shell`. */
  roles: string[];
  /** Per-role prompt overrides. Resolution: agent.prompts → built-in
   *  default (`/opsx:apply|review|verify|manage ${change_id}`).
   *  See {@link resolvePromptForRole} and {@link BUILT_IN_ROLE_PROMPTS}. */
  prompts?: Record<string, string>;

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

/** Top-level `agmsg` config block. Optional in agents.yaml — absence
 *  means agmsg is not configured, which is the default. Landed by
 *  add-agmsg-config-block. Runtime spawn / dispatcher routing land
 *  in follow-up changes; this type is metadata-only for P1. */
export type AgmsgConfig = {
  team: string;
  storage?: string;
};

export type AgentConfig =
  | {
      ok: true;
      agents: AgentDef[];
      parallelExecution: boolean;
      maxParallel: number;
      maxReworkRounds: number;
      agmsg: AgmsgConfig | null;
      /** Top-level `tmux: boolean` toggle. When explicit (true/false), overrides agmsg.
       *  When absent (undefined), defaults to `agmsg !== null`.
       *  See {@link AgentRegistry.tmux}. */
      tmux?: boolean;
      warnings: string[];
    }
  | {
      ok: false;
      agents: AgentDef[]; // last-known-good
      parallelExecution: boolean; // last-known-good
      maxParallel: number; // last-known-good
      maxReworkRounds: number; // last-known-good
      agmsg: AgmsgConfig | null; // last-known-good
      tmux?: boolean; // last-known-good
      warnings: string[];
      error: string;
    };

/** Default when `agents.yaml` omits `maxParallel`. Chosen with tmux
 *  pane count + spawn worker cost in mind (each concurrent worker
 *  is a full Claude / Copilot process). Landed by
 *  add-multi-dispatch-orchestrator. */
const DEFAULT_MAX_PARALLEL = 3;
const MAX_PARALLEL_MIN = 1;
const MAX_PARALLEL_MAX = 10;

/** Default when `agents.yaml` omits `maxReworkRounds`. Matches the
 *  historic hard-coded MAX_ITERATIONS = 5 in the dispatch skills.
 *  Landed by add-agents-max-rework-rounds-config. */
export const DEFAULT_MAX_REWORK_ROUNDS = 5;
export const MAX_REWORK_ROUNDS_MIN = 1;
export const MAX_REWORK_ROUNDS_MAX = 10;

const AGENT_MODES: readonly AgentMode[] = ["single-prompt", "live-shell"];
const KNOWN_AGENT_KEYS = new Set([
  "name",
  "description",
  "command",
  "args",
  "env",
  "prompt",
  "prompts",
  "mode",
  "role",
  "roles",
  "initialInput",
]);

/** Built-in per-role prompt defaults. When the agent does not declare
 *  `prompts.<role>`, dispatch falls back to these.
 *
 *  Post redesign-skill-namespace-and-dispatch: review / verify / manager
 *  live under the `ithy-opsx:` namespace because they touch ithyno's
 *  worktree convention, `review.md` artifact schema, and phase API.
 *  Only `code` (== `/opsx:apply`) and `propose` stay under `opsx:` as
 *  pure OpenSpec worker prompts. */
export const BUILT_IN_ROLE_PROMPTS: Readonly<Record<string, string>> = {
  propose: "/opsx:propose ${change_id}",
  code: "/opsx:apply ${change_id}",
  coder: "/opsx:apply ${change_id}", // deprecated alias for "code"
  review: "/ithy-opsx:review ${change_id}",
  verify: "/ithy-opsx:verify ${change_id}",
  manager: "/ithy-opsx:dispatch",
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
  agmsg?: AgmsgConfig | null,
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

  // ---- command/args ----
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

  if (!command) {
    throw new Error(`${label}: must declare 'command'`);
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
  if (agmsg !== undefined && agmsg !== null) {
    mode = "live-shell";
  } else if (o.mode !== undefined) {
    if (typeof o.mode !== "string" || !AGENT_MODES.includes(o.mode as AgentMode)) {
      throw new Error(`${label}.mode must be one of ${AGENT_MODES.join(", ")}`);
    }
    mode = o.mode as AgentMode;
  } else {
    // Synthesize: manager → live-shell, everything else → single-prompt.
    mode = roles.includes("manager") ? "live-shell" : "single-prompt";
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

  const primaryRole = roles[0];
  return {
    name: o.name,
    description,
    command,
    args,
    env,
    mode,
    roles,
    prompts: Object.keys(prompts).length > 0 ? prompts : undefined,
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
export function validateAgents(
  raw: unknown,
  warningsOut?: string[],
  agmsg?: AgmsgConfig | null,
): AgentDef[] {
  if (!raw || typeof raw !== "object") throw new Error("agents.yaml must be an object");
  const list = (raw as { agents?: unknown }).agents;
  if (!Array.isArray(list)) throw new Error("agents.yaml: `agents` must be a list");
  const warnings = warningsOut ?? [];
  const agents = list.map((a, i) => normalizeAgent(a, i, warnings, agmsg));

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

/**
 * Validate top-level `parallelExecution` field. Absent → false.
 * Non-boolean values throw so the config-error banner surfaces the mistake.
 */
function validateParallelExecution(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== "boolean") {
    throw new Error("parallelExecution must be a boolean");
  }
  return raw;
}

/**
 * Validate top-level `tmux` field. Absent → false (matches pre-toggle
 * behavior: no tmux wrap unless `agmsg` implies it). Independent of the
 * `agmsg` block — see {@link AgentRegistry.tmux}. Landed by
 * decouple-tmux-from-agmsg.
 */
function validateTmux(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "boolean") {
    throw new Error("tmux must be a boolean");
  }
  return raw;
}

/**
 * Validate top-level `maxParallel` field. Absent → DEFAULT_MAX_PARALLEL.
 * Must be an integer in [MAX_PARALLEL_MIN, MAX_PARALLEL_MAX] when present.
 * Landed by add-multi-dispatch-orchestrator.
 */
function validateMaxParallel(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_MAX_PARALLEL;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new Error(
      `maxParallel must be an integer between ${MAX_PARALLEL_MIN} and ${MAX_PARALLEL_MAX} (got: ${JSON.stringify(raw)})`,
    );
  }
  if (raw < MAX_PARALLEL_MIN || raw > MAX_PARALLEL_MAX) {
    throw new Error(
      `maxParallel must be between ${MAX_PARALLEL_MIN} and ${MAX_PARALLEL_MAX} (got: ${raw})`,
    );
  }
  return raw;
}

/**
 * Validate top-level `maxReworkRounds` field. Absent → DEFAULT_MAX_REWORK_ROUNDS.
 * Non-numeric or missing → return default with a console warning.
 * Float → floored with a warning.
 * Out of range → clamped to [MAX_REWORK_ROUNDS_MIN, MAX_REWORK_ROUNDS_MAX] with a warning.
 * Valid integer in range → returned as-is.
 * Landed by add-agents-max-rework-rounds-config.
 */
function validateMaxReworkRounds(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_MAX_REWORK_ROUNDS;
  if (typeof raw !== "number") {
    console.warn(
      `[registry] maxReworkRounds must be a number (got: ${JSON.stringify(raw)}); using default ${DEFAULT_MAX_REWORK_ROUNDS}`,
    );
    return DEFAULT_MAX_REWORK_ROUNDS;
  }
  let value = raw;
  if (!Number.isInteger(value)) {
    const floored = Math.floor(value);
    console.warn(
      `[registry] maxReworkRounds must be an integer (got: ${value}); flooring to ${floored}`,
    );
    value = floored;
  }
  if (value < MAX_REWORK_ROUNDS_MIN) {
    console.warn(
      `[registry] maxReworkRounds ${value} is below minimum ${MAX_REWORK_ROUNDS_MIN}; clamping`,
    );
    return MAX_REWORK_ROUNDS_MIN;
  }
  if (value > MAX_REWORK_ROUNDS_MAX) {
    console.warn(
      `[registry] maxReworkRounds ${value} exceeds maximum ${MAX_REWORK_ROUNDS_MAX}; clamping`,
    );
    return MAX_REWORK_ROUNDS_MAX;
  }
  return value;
}

/**
 * Validate top-level `agmsg` block. Absent → null (agmsg not
 * configured; default). When present, `team` is required and
 * non-empty. Landed by add-agmsg-config-block.
 */
function validateAgmsg(raw: unknown): AgmsgConfig | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("agmsg must be an object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.team !== "string" || o.team.length === 0) {
    throw new Error("agmsg.team is required when the agmsg block is present");
  }
  if (o.storage !== undefined && o.storage !== null) {
    if (typeof o.storage !== "string") {
      throw new Error("agmsg.storage must be a string");
    }
  }
  const out: AgmsgConfig = { team: o.team };
  if (typeof o.storage === "string" && o.storage.length > 0) {
    out.storage = o.storage;
  }
  return out;
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
  role: string,
): string | undefined {
  const agentPrompt = agent.prompts?.[role];
  if (agentPrompt !== undefined) return agentPrompt;
  return BUILT_IN_ROLE_PROMPTS[role];
}

/**
 * Check whether `agents.yaml` exists as a readable file at `projectRoot`.
 * Returns false when the path is absent, is a directory, is a symlink to a
 * non-file, or is otherwise unreadable.
 *
 * Exported as a standalone helper so callers that don't hold an
 * `AgentRegistry` instance (e.g. `scanWorkspace`, tests) can use it
 * directly. Landed by guard-terminal-autolaunch-on-agents-yaml.
 */
export function hasAgentsYaml(projectRoot: string): boolean {
  const p = join(projectRoot, "agents.yaml");
  if (!existsSync(p)) return false;
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export class AgentRegistry {
  private cache: AgentConfig = {
    ok: true,
    agents: [],
    parallelExecution: false,
    maxParallel: DEFAULT_MAX_PARALLEL,
    maxReworkRounds: DEFAULT_MAX_REWORK_ROUNDS,
    agmsg: null,
    tmux: undefined,
    warnings: [],
  };
  private projectRoot: string;
  private watcher: FSWatcher | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async load(): Promise<void> {
    const path = join(this.projectRoot, "agents.yaml");
    if (!existsSync(path)) {
      this.cache = {
        ok: true,
        agents: [],
        parallelExecution: false,
        maxParallel: DEFAULT_MAX_PARALLEL,
        maxReworkRounds: DEFAULT_MAX_REWORK_ROUNDS,
        agmsg: null,
        tmux: undefined,
        warnings: [],
      };
      return;
    }
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseYaml(raw);
      const warnings: string[] = [];
      const parallelExecution = validateParallelExecution(
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).parallelExecution
          : undefined,
      );
      const maxParallel = validateMaxParallel(
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).maxParallel
          : undefined,
      );
      const maxReworkRounds = validateMaxReworkRounds(
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).maxReworkRounds
          : undefined,
      );
      const agmsg = validateAgmsg(
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).agmsg
          : undefined,
      );
      const agents = validateAgents(parsed, warnings, agmsg);
      const tmux = validateTmux(
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).tmux
          : undefined,
      );
      if (warnings.length > 0) {
        for (const w of warnings) console.warn(`[registry] ${w}`);
      }
      this.cache = {
        ok: true,
        agents,
        parallelExecution,
        maxParallel,
        maxReworkRounds,
        agmsg,
        tmux,
        warnings,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.cache = {
        ok: false,
        agents: this.cache.agents,
        parallelExecution: this.cache.parallelExecution,
        maxParallel: this.cache.maxParallel,
        maxReworkRounds: this.cache.maxReworkRounds,
        agmsg: this.cache.agmsg,
        tmux: this.cache.tmux,
        warnings: this.cache.warnings,
        error: msg,
      };
    }
  }

  async startWatching(onChange?: () => void): Promise<void> {
    const path = join(this.projectRoot, "agents.yaml");
    // Watch the directory not the file — `fs.watch(file)` loses the
    // watch across atomic rename patterns on macOS (editor writes via
    // `.tmp → rename` fire once and then the watcher goes silent).
    // chokidar handles this by re-establishing the watch on `unlink`.
    // We filter by filename inside the handler.
    try {
      this.watcher = chokidar.watch(path, {
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 20,
        },
      });
      const handle = (kind: string) => async (changedPath: string) => {
        // chokidar path is absolute; only react to agents.yaml.
        if (changedPath !== path) return;
        console.log(`[registry] fs event: ${kind} ${changedPath}`);
        await this.load();
        onChange?.();
      };
      this.watcher.on("add", handle("add"));
      this.watcher.on("change", handle("change"));
      this.watcher.on("unlink", handle("unlink"));
      this.watcher.on("error", (err) => {
        console.warn(
          `[registry] chokidar error watching ${path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    } catch {
      // best-effort; the dashboard still works without auto-reload
    }
  }

  /** Public config (env values are redacted before going on the wire). */
  publicConfig(): {
    ok: boolean;
    error?: string;
    agents: Array<Omit<AgentDef, "env"> & { hasEnv: boolean }>;
    parallelExecution: boolean;
    maxParallel: number;
    maxReworkRounds: number;
    agmsg: AgmsgConfig | null;
    tmux: boolean;
    warnings: string[];
  } {
    const sanitized = this.cache.agents.map(({ env, ...rest }) => ({
      ...rest,
      hasEnv: !!env && Object.keys(env).length > 0,
    }));
    const effectiveTmux =
      this.cache.tmux !== undefined ? this.cache.tmux : this.cache.agmsg !== null;
    if (!this.cache.ok) {
      return {
        ok: false,
        error: this.cache.error,
        agents: sanitized,
        parallelExecution: this.cache.parallelExecution,
        maxParallel: this.cache.maxParallel,
        maxReworkRounds: this.cache.maxReworkRounds,
        agmsg: this.cache.agmsg,
        tmux: effectiveTmux,
        warnings: this.cache.warnings,
      };
    }
    return {
      ok: true,
      agents: sanitized,
      parallelExecution: this.cache.parallelExecution,
      maxParallel: this.cache.maxParallel,
      maxReworkRounds: this.cache.maxReworkRounds,
      agmsg: this.cache.agmsg,
      tmux: effectiveTmux,
      warnings: this.cache.warnings,
    };
  }

  find(name: string): AgentDef | null {
    return this.cache.agents.find((a) => a.name === name) ?? null;
  }

  /** The parsed top-level `agmsg` block, or null when not configured.
   *  Consumers use this to decide whether to spawn tmux / agmsg
   *  runtime pieces (in follow-up changes). */
  agmsg(): AgmsgConfig | null {
    return this.cache.agmsg;
  }

  /** The parsed top-level `tmux` toggle, or undefined when absent.
   *  When explicitly set (true/false), takes precedence over agmsg.
   *  When undefined, defaults to `agmsg !== null`. */
  tmux(): boolean | undefined {
    return this.cache.tmux;
  }

  /**
   * The first agent whose `roles` include `manager`, or `null` if none.
   * The embedded Terminal panel uses this to pick its PTY startup command.
   */
  managerAgent(): AgentDef | null {
    return this.cache.agents.find((a) => a.roles.includes("manager")) ?? null;
  }

  /**
   * Whether `agents.yaml` exists as a readable file at the project root.
   * Returns false when the file is missing, is a directory, or the path
   * points to an unreadable entry.
   *
   * Used by `attachPtyToSocket` and the VS Code extension to gate the
   * auto-launch injection: projects without `agents.yaml` skip the
   * Claude-startup command so only a plain shell is opened. Users can
   * still open the terminal manually via any explicit affordance.
   * Landed by guard-terminal-autolaunch-on-agents-yaml.
   */
  hasAgentsYaml(): boolean {
    return hasAgentsYaml(this.projectRoot);
  }

  /**
   * Resolve template variables, apply per-role prompt resolution, and
   * produce a concrete command + args tuple.
   *
   * `role` is the dispatched role — the specific role that was requested
   * (not the agent's whole `roles` array). When omitted, defaults to
   * `agent.roles[0]`.
   *
   * @throws when the dispatched role has no prompt at any resolution tier
   *   for `mode: live-shell` workers.
   */
  resolve(
    def: AgentDef,
    vars: {
      change_id: string;
      worktree_path: string;
      branch: string;
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
     *
     *  Manager `mode: live-shell` never goes through resolve() — the
     *  Terminal panel's `attachPtyToSocket` handles that PTY spawn
     *  independently via `ptyStartup()`. Worker `mode: live-shell` maps
     *  to `"stdin"` here (stdin-piped headless spawn); it does NOT open
     *  a PTY. */
    initialInputMode: "cli-arg" | "stdin";
  } {
    const replace = (s: string): string =>
      s
        .replace(/\$\{change_id\}/g, vars.change_id)
        .replace(/\$\{worktree_path\}/g, vars.worktree_path)
        .replace(/\$\{branch\}/g, vars.branch);

    const dispatchedRole = role ?? def.roles[0];
    const env: Record<string, string> = {};
    if (def.env) for (const [k, v] of Object.entries(def.env)) env[k] = replace(v);

    // Resolve command + args.
    const command = def.command ?? "";
    const args = (def.args ?? []).map(replace);

    // Resolve the prompt for the dispatched role. explicit = agent.prompts;
    // fallback = built-in default per role.
    const agentPrompt = def.prompts?.[dispatchedRole];
    const promptTemplate = agentPrompt ?? BUILT_IN_ROLE_PROMPTS[dispatchedRole];
    const resolvedPrompt = promptTemplate === undefined ? undefined : replace(promptTemplate);
    const isExplicitPrompt = agentPrompt !== undefined;

    // Wire the prompt into the runner:
    //   - `mode: live-shell` (worker) — write resolvedPrompt to child.stdin.
    //     Manager `mode: live-shell` is handled by attachPtyToSocket
    //     (Terminal panel WS) and never reaches this branch.
    //   - `mode: single-prompt` — append `[-p, prompt]` to args when the
    //     agent has an explicit `prompts.<role>` set AND args does not
    //     already inline `-p`. Command-only agents with no explicit
    //     prompt keep their hand-authored args unchanged.
    let initialInputMode: "cli-arg" | "stdin";
    let initialInput: string | undefined;
    let effectiveArgs = args;

    if (def.mode === "live-shell") {
      if (resolvedPrompt === undefined) {
        throw new Error(
          `agent '${def.name}': no prompt configured for role '${dispatchedRole}'`,
        );
      }
      initialInputMode = "stdin";
      initialInput = resolvedPrompt;
    } else {
      initialInputMode = "cli-arg";
      initialInput = undefined;
      const shouldInject =
        resolvedPrompt !== undefined &&
        isExplicitPrompt &&
        !args.includes("-p");
      if (shouldInject) {
        effectiveArgs = [...args, "-p", resolvedPrompt!];
      }
    }

    return { command, args: effectiveArgs, env, initialInput, initialInputMode };
  }
}
