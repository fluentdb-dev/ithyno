// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Safe parsing and serialization helpers for Agent CLI argument builders.
 *
 * The runtime owns prompt transport (`-p`, `--print`, `--prompt`, Codex `exec`,
 * etc.), but the builder MUST NOT silently delete arbitrary user-supplied argv.
 * The CLI-aware adapter construction decides which values are runtime-owned; the
 * generic config-writer only round-trips the command + args array untouched.
 */

import { spawn } from "node:child_process";

export const DISPATCHER_OWNED_PROMPT_FLAGS = new Set([
  "-p",
  "--print",
  "--prompt",
  "--resume",
  "--continue",
  "--session-id",
  "--conversation",
  "--artifact-contract",
  "--change-id",
  "--worktree",
  "--cwd",
  "exec",
]);

export type CliAdapterId = "claude" | "codex" | "agy" | "copilot";
export type CliFieldKind = "text" | "select" | "boolean";

export type CliFieldDescriptor = {
  key: string;
  label: string;
  flag: string;
  kind: CliFieldKind;
  choices?: readonly string[];
  dangerous?: boolean;
  guidance?: string;
};

export type CliModelInfo = {
  id: string;
  label?: string;
  source?: "native" | "manual";
};

export type CliAdapter = {
  id: CliAdapterId;
  aliases: readonly string[];
  displayName: string;
  fields: readonly CliFieldDescriptor[];
  versionProbe: readonly string[];
  helpProbe: readonly string[];
  modelProbe?: readonly string[];
  modelDiscovery: "native" | "manual" | "none";
  modelGuidance: string;
  dangerousFlags?: readonly string[];
};

export type CliProbeResult = {
  ok: boolean;
  command: readonly string[];
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: string;
};

export const CLI_ADAPTERS: Record<CliAdapterId, CliAdapter> = {
  claude: {
    id: "claude",
    aliases: ["claude", "claude-code"],
    displayName: "Claude Code",
    fields: [
      { key: "model", label: "Model", flag: "--model", kind: "text", guidance: "Use a model alias or full name; CLI may expose /model interactively." },
      { key: "effort", label: "Effort", flag: "--effort", kind: "select", choices: ["low", "medium", "high", "xhigh", "max"], guidance: "Sets the reasoning effort level." },
      { key: "permissionMode", label: "Permission mode", flag: "--permission-mode", kind: "select", choices: ["default", "acceptEdits", "auto", "plan", "dontAsk", "bypassPermissions"], guidance: "Approval policy for tool use." },
      { key: "dangerouslySkipPermissions", label: "Dangerous skip permissions", flag: "--dangerously-skip-permissions", kind: "boolean", dangerous: true, guidance: "Bypasses permission prompts." },
    ],
    versionProbe: ["claude", "--version"],
    helpProbe: ["claude", "--help"],
    modelProbe: undefined,
    modelDiscovery: "manual",
    modelGuidance: "Claude Code offers no verified non-interactive model list in this environment; use /model interactively or enter a model name manually.",
    dangerousFlags: ["--dangerously-skip-permissions"],
  },
  codex: {
    id: "codex",
    aliases: ["codex"],
    displayName: "Codex CLI",
    fields: [
      { key: "model", label: "Model", flag: "--model", kind: "text" },
      { key: "profile", label: "Profile", flag: "--profile", kind: "text" },
      { key: "sandbox", label: "Sandbox", flag: "--sandbox", kind: "select", choices: ["read-only", "workspace-write", "danger-full-access"] },
      { key: "approval", label: "Approval", flag: "--ask-for-approval", kind: "select", choices: ["on-request", "never"] },
      { key: "approveForMe", label: "Approve for me", flag: "--approve-for-me", kind: "boolean" },
      { key: "dangerouslyBypassApprovalsAndSandbox", label: "Dangerous bypass", flag: "--dangerously-bypass-approvals-and-sandbox", kind: "boolean", dangerous: true },
    ],
    versionProbe: ["codex", "--version"],
    helpProbe: ["codex", "--help"],
    modelProbe: ["codex", "app-server", "initialize", "--", "model/list"],
    modelDiscovery: "native",
    modelGuidance: "Codex app-server model/list is preferred when available; if it fails, keep the model field editable and enter a value manually.",
    dangerousFlags: ["--dangerously-bypass-approvals-and-sandbox", "--approve-for-me"],
  },
  agy: {
    id: "agy",
    aliases: ["agy", "antigravity"],
    displayName: "Antigravity CLI",
    fields: [
      { key: "model", label: "Model", flag: "--model", kind: "text" },
      { key: "effort", label: "Effort", flag: "--effort", kind: "select", choices: ["low", "medium", "high", "xhigh", "max"] },
      { key: "mode", label: "Mode", flag: "--mode", kind: "select", choices: ["accept-edits", "plan"] },
      { key: "sandbox", label: "Sandbox", flag: "--sandbox", kind: "boolean" },
      { key: "dangerouslySkipPermissions", label: "Dangerous skip permissions", flag: "--dangerously-skip-permissions", kind: "boolean", dangerous: true },
    ],
    versionProbe: ["agy", "--version"],
    helpProbe: ["agy", "--help"],
    modelProbe: ["agy", "models"],
    modelDiscovery: "native",
    modelGuidance: "Agy exposes models via `agy models`; if that command fails, keep manual input available.",
    dangerousFlags: ["--dangerously-skip-permissions"],
  },
  copilot: {
    id: "copilot",
    aliases: ["copilot", "github-copilot"],
    displayName: "GitHub Copilot CLI",
    fields: [
      { key: "model", label: "Model", flag: "--model", kind: "text" },
      { key: "reasoningEffort", label: "Reasoning effort", flag: "--reasoning-effort", kind: "select", choices: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
      { key: "context", label: "Context", flag: "--context", kind: "select", choices: ["default", "long_context"] },
      { key: "autoTier", label: "Auto tier", flag: "--auto-tier", kind: "select", choices: ["efficiency", "balance", "intelligence"] },
      { key: "mode", label: "Mode", flag: "--mode", kind: "select", choices: ["interactive", "plan", "autopilot"] },
      { key: "allowAll", label: "Allow all", flag: "--allow-all", kind: "boolean", dangerous: true },
      { key: "yolo", label: "YOLO", flag: "--yolo", kind: "boolean", dangerous: true },
    ],
    versionProbe: ["copilot", "--version"],
    helpProbe: ["copilot", "help", "commands"],
    modelProbe: undefined,
    modelDiscovery: "manual",
    modelGuidance: "Copilot does not expose a verified non-interactive model list in this environment; use /model interactively or specify a model manually.",
    dangerousFlags: ["--allow-all", "--yolo", "--no-ask-user"],
  },
};

export const KNOWN_CLI_ARG_KEYS = new Set<string>();
export const BOOLEAN_CLI_ARG_KEYS = new Set<string>();
for (const adapter of Object.values(CLI_ADAPTERS)) {
  for (const field of adapter.fields) {
    KNOWN_CLI_ARG_KEYS.add(field.flag);
    KNOWN_CLI_ARG_KEYS.add(field.key);
    KNOWN_CLI_ARG_KEYS.add(canonicalCliFlagName(field.flag));
    if (field.kind === "boolean") {
      BOOLEAN_CLI_ARG_KEYS.add(field.flag);
      BOOLEAN_CLI_ARG_KEYS.add(field.key);
      BOOLEAN_CLI_ARG_KEYS.add(canonicalCliFlagName(field.flag));
    }
  }
}

export function canonicalCliFlagName(value: string): string {
  return value.replace(/^--?/, "").replace(/^-+/, "").replace(/-+/g, "-");
}

export function resolveCliAdapter(command?: string | null): CliAdapter | null {
  if (!command) return null;
  const executable = command.split(/[\\/]/).pop() ?? command;
  const normalized = executable.replace(/\.(exe|cmd|bat)$/i, "").toLowerCase();

  for (const [id, adapter] of Object.entries(CLI_ADAPTERS) as Array<[CliAdapterId, CliAdapter]>) {
    if (adapter.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return adapter;
    }
    if (id === normalized || normalized === "antigravity" || normalized === "github-copilot") {
      return adapter;
    }
  }
  return null;
}

export type ParsedCliArgs = {
  values: Record<string, string[]>;
  unknown: string[];
  conflicts: string[];
};

export function parseCliArgs(args: readonly string[]): ParsedCliArgs {
  const values: Record<string, string[]> = {};
  const unknown: string[] = [];
  const conflicts: string[] = [];
  const seen = new Map<string, string>();

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) continue;

    const isFlag = token.startsWith("-") && token !== "-";
    if (!isFlag) {
      unknown.push(token);
      continue;
    }

    const bareFlag = token.split("=", 1)[0];
    const canonical = canonicalCliFlagName(bareFlag);
    const nextValue = token.includes("=") ? token.slice(token.indexOf("=") + 1) : undefined;

    if (DISPATCHER_OWNED_PROMPT_FLAGS.has(bareFlag) || DISPATCHER_OWNED_PROMPT_FLAGS.has(canonical)) {
      unknown.push(token);
      if (nextValue !== undefined) continue;
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        unknown.push(next);
        i += 1;
      }
      continue;
    }

    const isKnown = KNOWN_CLI_ARG_KEYS.has(bareFlag) || KNOWN_CLI_ARG_KEYS.has(canonical) || KNOWN_CLI_ARG_KEYS.has(bareFlag.replace(/^--?/, ""));
    const isBooleanFlag = BOOLEAN_CLI_ARG_KEYS.has(bareFlag) || BOOLEAN_CLI_ARG_KEYS.has(canonical) || BOOLEAN_CLI_ARG_KEYS.has(bareFlag.replace(/^--?/, ""));
    if (token.includes("=")) {
      if (isKnown) {
        if (seen.has(canonical) && seen.get(canonical) !== nextValue) conflicts.push(canonical);
        seen.set(canonical, String(nextValue ?? ""));
        values[canonical] = values[canonical] ? [...values[canonical], String(nextValue ?? "")] : [String(nextValue ?? "")];
      } else {
        unknown.push(token);
      }
      continue;
    }

    if (isKnown) {
      const next = args[i + 1];
      if (isBooleanFlag) {
        if (seen.has(canonical) && seen.get(canonical) !== "true") conflicts.push(canonical);
        seen.set(canonical, "true");
        values[canonical] = values[canonical] ? [...values[canonical], "true"] : ["true"];
        continue;
      }
      if (next !== undefined && !next.startsWith("-")) {
        if (seen.has(canonical) && seen.get(canonical) !== next) conflicts.push(canonical);
        seen.set(canonical, next);
        values[canonical] = values[canonical] ? [...values[canonical], next] : [next];
        i += 1;
      } else {
        if (seen.has(canonical) && seen.get(canonical) !== "true") conflicts.push(canonical);
        seen.set(canonical, "true");
        values[canonical] = values[canonical] ? [...values[canonical], "true"] : ["true"];
      }
      continue;
    }

    unknown.push(token);
  }

  return { values, unknown, conflicts: [...new Set(conflicts)] };
}

export function detectCliArgConflicts(args: readonly string[]): string[] {
  return parseCliArgs(args).conflicts;
}

export function mergeCliArgs(
  args: readonly string[],
  selected: Record<string, string | boolean | undefined>,
): string[] {
  const preserved: string[] = [];
  const selectedKeys = new Set(
    Object.entries(selected)
      .filter(([, value]) => value !== undefined && value !== null && value !== false)
      .map(([key]) => canonicalCliFlagName(key.startsWith("-") ? key : `--${key}`)),
  );

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === undefined) continue;
    const bareFlag = token.split("=", 1)[0];
    const canonical = canonicalCliFlagName(bareFlag);
    const matchesSelected = selectedKeys.has(canonical);
    if (matchesSelected) {
      const next = token.includes("=") ? undefined : args[i + 1];
      if (!token.includes("=") && next !== undefined && !next.startsWith("-")) {
        i += 1;
      }
      continue;
    }

    if (token.startsWith("-") && !token.includes("=") && args[i + 1] !== undefined && !args[i + 1].startsWith("-")) {
      preserved.push(token, args[i + 1]);
      i += 1;
      continue;
    }

    preserved.push(token);
  }

  const appended: string[] = [];
  for (const [key, value] of Object.entries(selected)) {
    if (value === undefined || value === null || value === false) continue;
    const flag = key.startsWith("-") ? key : `--${canonicalCliFlagName(key)}`;
    if (typeof value === "boolean") {
      appended.push(flag);
      continue;
    }
    appended.push(flag, String(value));
  }

  return [...preserved, ...appended];
}

export function formatArgvPreview(command: string, args: readonly string[]): string {
  const all = [...args].filter((arg) => arg !== undefined && arg !== null);
  return `${command}${all.length > 0 ? ` ${joinArgv(all)}` : ""}`;
}

export function splitArgv(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (escaped) current += "\\";
  if (current.length > 0) out.push(current);
  return out;
}

export function joinArgv(args: readonly string[]): string {
  return args
    .map((arg) => {
      if (arg.length === 0) return '""';
      return /[\s"'\\]/.test(arg) ? JSON.stringify(arg) : arg;
    })
    .join(" ");
}

/**
 * Preserve the current args array without deleting anonymous or user-controlled
 * tokens. The builder must decide what to drop per CLI adapter; generic config
 * writes must never rewrite user-owned argv.
 */
export function sanitizePersistedArgs(args: readonly string[]): string[] {
  return [...args].filter((arg) => arg !== undefined && arg !== null);
}

const PROBE_TIMEOUT_MS = 12000;
const PROBE_OUTPUT_LIMIT = 16384;

export async function runCliProbe(argv: readonly string[]): Promise<CliProbeResult> {
  if (argv.length === 0) {
    return { ok: false, command: argv, stdout: "", stderr: "", timedOut: false, error: "empty probe argv" };
  }

  const [command, ...rest] = argv;
  return await new Promise<CliProbeResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(command, rest, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      timedOut = true;
      child.kill("SIGKILL");
      resolve({
        ok: false,
        command: argv,
        stdout: stdout.slice(0, PROBE_OUTPUT_LIMIT),
        stderr: stderr.slice(0, PROBE_OUTPUT_LIMIT),
        timedOut: true,
        error: `probe timed out after ${PROBE_TIMEOUT_MS}ms`,
      });
    }, PROBE_TIMEOUT_MS);

    const finalize = (next: CliProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(next);
    };

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > PROBE_OUTPUT_LIMIT) stdout = stdout.slice(0, PROBE_OUTPUT_LIMIT);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > PROBE_OUTPUT_LIMIT) stderr = stderr.slice(0, PROBE_OUTPUT_LIMIT);
    });

    child.on("error", (error) => finalize({
      ok: false,
      command: argv,
      stdout: stdout.slice(0, PROBE_OUTPUT_LIMIT),
      stderr: stderr.slice(0, PROBE_OUTPUT_LIMIT),
      timedOut,
      error: error instanceof Error ? error.message : String(error),
    }));

    child.on("close", (code, signal) => {
      const exitCode = typeof code === "number" ? code : signal ? 1 : 0;
      finalize({
        ok: exitCode === 0,
        command: argv,
        stdout: stdout.slice(0, PROBE_OUTPUT_LIMIT),
        stderr: stderr.slice(0, PROBE_OUTPUT_LIMIT),
        timedOut,
        error: exitCode === 0 ? undefined : `exit ${exitCode}`,
      });
    });
  });
}

export function parseModelListOutput(adapterId: CliAdapterId, output: string): string[] {
  const text = output.trim();
  if (!text) return [];

  if (adapterId === "codex") {
    try {
      const parsed = JSON.parse(text);
      const models = Array.isArray(parsed?.models)
        ? parsed.models
        : Array.isArray(parsed)
          ? parsed
          : [];
      const ids = models
        .map((entry: unknown) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") {
            const id = (entry as { id?: string }).id ?? (entry as { model?: string }).model;
            return typeof id === "string" ? id : undefined;
          }
          return undefined;
        })
        .filter((value: string | undefined): value is string => !!value);
      if (ids.length > 0) return ids;
    } catch {
      // Fall through to plain-text parsing.
    }
  }

  return [...new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const match = line.split(/\s+|\t+/).find(Boolean);
        return match ? [match] : [];
      }),
  )];
}

export async function probeCliAdapter(adapter: CliAdapter): Promise<{
  ok: boolean;
  supported: boolean;
  command: string;
  adapter: CliAdapterId;
  fields: readonly CliFieldDescriptor[];
  modelDiscovery: "native" | "manual" | "none";
  modelGuidance: string;
  availableModels: string[];
  currentVersion?: string;
  danger: readonly string[];
}> {
  const versionProbe = await runCliProbe(adapter.versionProbe);
  const helpProbe = await runCliProbe(adapter.helpProbe);

  let availableModels: string[] = [];
  if (adapter.modelProbe) {
    const modelProbe = await runCliProbe(adapter.modelProbe);
    if (modelProbe.ok) {
      availableModels = parseModelListOutput(adapter.id, `${modelProbe.stdout}\n${modelProbe.stderr}`);
    }
  }

  const versionText = versionProbe.ok ? versionProbe.stdout.trim() || versionProbe.stderr.trim() : "";
  const helpText = `${helpProbe.stdout}\n${helpProbe.stderr}`.toLowerCase();
  const supportedFields = adapter.fields.filter((field) => {
    if (field.kind === "boolean" && field.flag) return helpText.includes(field.flag.toLowerCase());
    return helpText.includes(field.flag.toLowerCase()) || (field.flag.includes("--model") && helpText.includes("model"));
  });

  return {
    ok: true,
    supported: true,
    command: adapter.aliases[0] ?? adapter.id,
    adapter: adapter.id,
    fields: supportedFields.length > 0 ? supportedFields : adapter.fields,
    modelDiscovery: adapter.modelDiscovery,
    modelGuidance: adapter.modelGuidance,
    availableModels,
    currentVersion: versionText || undefined,
    danger: adapter.dangerousFlags ?? [],
  };
}
