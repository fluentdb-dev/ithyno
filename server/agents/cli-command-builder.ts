// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Safe parsing and serialization helpers for Agent CLI argument builders.
 *
 * The runtime owns prompt transport (`-p`, `--print`, `--prompt`, Codex `exec`,
 * etc.), but the builder MUST NOT silently delete arbitrary user-supplied argv.
 * The CLI-aware adapter construction decides which values are runtime-owned; the
 * generic config-writer only round-trips the command + args array untouched.
 */

import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { realpathSync } from "node:fs";

export type CodexModelMetadata = {
  id?: string;
  model?: string;
  displayName?: string;
  supportedReasoningEfforts?: readonly string[];
  defaultReasoningEffort?: string;
};

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

export const CLI_CAPABILITY_CACHE = new Map<string, { result: unknown; expiresAt: number }>();

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function resolveCliExecutablePath(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  if (/[\\/]/.test(trimmed) || (process.platform === "win32" && /\.exe$/i.test(trimmed))) {
    try {
      return realpathSync(trimmed);
    } catch {
      return trimmed;
    }
  }

  const probeCommand = process.platform === "win32" ? "where" : "which";
  const { stdout, stderr } = spawnSync(probeCommand, [trimmed], {
    shell: false,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: sanitizeProbeEnv(process.env),
  });
  const resolved = ((stdout || stderr || "").split(/\r?\n/)[0] ?? "").trim();
  if (!resolved) return trimmed;
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function probeFingerprintFromResult(result: {
  currentVersion?: string;
  availableModels?: readonly string[];
  fields?: readonly CliFieldDescriptor[];
  reason?: string;
  modelDiscovery?: string;
}): string {
  const fieldSignature = (result.fields ?? []).map((field) => `${field.flag}:${field.kind}`).join("|");
  const modelSignature = (result.availableModels ?? []).join(",");
  const version = result.currentVersion ?? "unknown";
  const reason = result.reason ?? "none";
  return stableHash([version, result.modelDiscovery ?? "none", fieldSignature, modelSignature, reason].join("::"));
}

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
    modelProbe: ["codex", "app-server"],
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
  const selectedKeys = new Set(
    Object.entries(selected)
      .map(([key]) => canonicalCliFlagName(key.startsWith("-") ? key : `--${key}`)),
  );
  const removeKeys = new Set(
    Object.entries(selected)
      .filter(([, value]) => value === undefined || value === null || value === false)
      .map(([key]) => canonicalCliFlagName(key.startsWith("-") ? key : `--${key}`)),
  );

  const preserved: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === undefined) continue;
    const bareFlag = token.split("=", 1)[0];
    const canonical = canonicalCliFlagName(bareFlag);
    const matchesSelected = selectedKeys.has(canonical);
    if (matchesSelected) {
      const shouldRemove = removeKeys.has(canonical);
      if (shouldRemove) {
        const next = token.includes("=") ? undefined : args[i + 1];
        if (!token.includes("=") && next !== undefined && !next.startsWith("-")) {
          i += 1;
        }
        continue;
      }
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

const PROBE_TIMEOUT_MS = 12_000;
const PROBE_OUTPUT_LIMIT = 16_384;
const PROBE_ENV_EXCLUDE_RE = /^(ITHYNO_[A-Z0-9_]+|DOTENV[A-Z0-9_]*|DOTENVX_[A-Z0-9_]+|SESSION_TOKEN|AUTH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|COPILOT_TOKEN|CODEX_API_KEY|AZURE_OPENAI_API_KEY)$/i;

export function sanitizeProbeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (PROBE_ENV_EXCLUDE_RE.test(key)) continue;
    next[key] = value;
  }
  return next;
}

function terminateChild(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }).unref();
    } catch {
      child.kill("SIGKILL");
    }
    return;
  }
  child.kill(signal);
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 1000).unref?.();
}

function parseJsonPayloads(text: string): unknown[] {
  const packets: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      packets.push(JSON.parse(trimmed));
    } catch {
      // ignore malformed fragments; the caller decides how to handle them.
    }
  }
  return packets;
}

export function parseCodexModelMetadata(output: string): CodexModelMetadata[] {
  const entries: CodexModelMetadata[] = [];
  for (const packet of parseJsonPayloads(output)) {
    const candidate = packet && typeof packet === "object" ? packet as Record<string, unknown> : null;
    const result = candidate && typeof candidate.result === "object" ? candidate.result as Record<string, unknown> : null;
    const data = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(candidate?.models)
        ? candidate.models
        : Array.isArray(candidate?.result)
          ? candidate.result
          : [];

    for (const item of data) {
      if (typeof item === "string") continue;
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const id = typeof entry.id === "string" ? entry.id : typeof entry.model === "string" ? entry.model : undefined;
      const displayName = typeof entry.displayName === "string" ? entry.displayName : typeof entry.label === "string" ? entry.label : undefined;
      const supportedReasoningEfforts = Array.isArray(entry.supportedReasoningEfforts)
        ? entry.supportedReasoningEfforts.filter((value): value is string => typeof value === "string")
        : undefined;
      const defaultReasoningEffort = typeof entry.defaultReasoningEffort === "string" ? entry.defaultReasoningEffort : undefined;
      if (!id && !displayName && !supportedReasoningEfforts && !defaultReasoningEffort) continue;
      entries.push({
        id,
        model: typeof entry.model === "string" ? entry.model : undefined,
        displayName,
        supportedReasoningEfforts,
        defaultReasoningEffort,
      });
    }
  }
  return entries;
}

export function parseCodexModelListOutput(output: string): string[] {
  const values = new Set<string>();
  for (const entry of parseCodexModelMetadata(output)) {
    const id = entry.id ?? entry.model;
    if (id && id.trim()) values.add(id.trim());
  }
  return [...values];
}

export async function runCodexAppServerModelProbe(executablePath = "codex"): Promise<string[]> {
  const payload = await runCodexAppServerModelProbeDetailed(executablePath);
  return payload.models;
}

export async function runCodexAppServerModelProbeDetailed(executablePath = "codex"): Promise<{ models: string[]; metadata: CodexModelMetadata[] }> {
  return await new Promise<{ models: string[]; metadata: CodexModelMetadata[] }>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let initializeResultSeen = false;
    let modelListResultSeen = false;
    const outputCap = 65_536;
    let child: ChildProcess;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child) child.kill("SIGTERM");
      resolve({ models: [], metadata: [] });
    }, PROBE_TIMEOUT_MS);
    child = spawn(executablePath, ["app-server"], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: sanitizeProbeEnv(process.env),
    });
    const finalize = (models: string[], metadata: CodexModelMetadata[] = []) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin?.end();
      setTimeout(() => terminateChild(child, "SIGTERM"), 150).unref?.();
      resolve({ models, metadata });
    };
    const handlePacket = (packet: unknown) => {
      const candidate = packet && typeof packet === "object" ? packet as Record<string, unknown> : null;
      if (!candidate) return;
      const packetId = candidate.id;
      if (packetId === 1) {
        if (initializeResultSeen) return;
        if (candidate.result && !candidate.error) {
          initializeResultSeen = true;
          child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} })}\n`);
          child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "model/list", params: { includeHidden: false, limit: 100 } })}\n`);
          return;
        }
        if (candidate.error) {
          finalize([], []);
        }
        return;
      }
      if (packetId === 2) {
        if (modelListResultSeen) return;
        if (candidate.result && !candidate.error) {
          modelListResultSeen = true;
          const metadata = parseCodexModelMetadata(stdout);
          const models = parseCodexModelListOutput(stdout);
          if (models.length > 0) finalize(models, metadata);
        }
      }
    };
    const onChunk = (chunk: Buffer | string) => {
      const text = String(chunk);
      stdout += text;
      if (stdout.length > outputCap) {
        finalize([], []);
        return;
      }
      for (const packet of parseJsonPayloads(stdout)) {
        handlePacket(packet);
      }
      if (modelListResultSeen) {
        finalize(parseCodexModelListOutput(stdout), parseCodexModelMetadata(stdout));
      }
    };

    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > outputCap) finalize([], []);
    });
    child.on("error", () => finalize([], []));
    child.on("close", () => {
      if (!settled) {
        const models = parseCodexModelListOutput(stdout);
        const metadata = parseCodexModelMetadata(stdout);
        finalize(models, metadata);
      }
    });
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "ithyno", version: "0.9.0" } } })}\n`);
  });
}

export async function runCliProbe(argv: readonly string[], options: { timeoutMs?: number; outputLimit?: number; executablePath?: string } = {}): Promise<CliProbeResult> {
  if (argv.length === 0) {
    return { ok: false, command: argv, stdout: "", stderr: "", timedOut: false, error: "empty probe argv" };
  }

  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const outputLimit = options.outputLimit ?? PROBE_OUTPUT_LIMIT;
  const [command, ...rest] = argv;
  const spawnCommand = options.executablePath || command;
  return await new Promise<CliProbeResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(spawnCommand, rest, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizeProbeEnv(process.env),
    });

    const finalize = (next: CliProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(next);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      terminateChild(child, "SIGTERM");
      finalize({
        ok: false,
        command: argv,
        stdout: stdout.slice(0, outputLimit),
        stderr: stderr.slice(0, outputLimit),
        timedOut: true,
        error: `probe timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > outputLimit) {
        timedOut = true;
        terminateChild(child, "SIGTERM");
        finalize({
          ok: false,
          command: argv,
          stdout: stdout.slice(0, outputLimit),
          stderr: stderr.slice(0, outputLimit),
          timedOut: true,
          error: `probe output exceeded ${outputLimit} bytes`,
        });
        return;
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > outputLimit) {
        timedOut = true;
        terminateChild(child, "SIGTERM");
        finalize({
          ok: false,
          command: argv,
          stdout: stdout.slice(0, outputLimit),
          stderr: stderr.slice(0, outputLimit),
          timedOut: true,
          error: `probe output exceeded ${outputLimit} bytes`,
        });
      }
    });

    child.on("error", (error) => finalize({
      ok: false,
      command: argv,
      stdout: stdout.slice(0, outputLimit),
      stderr: stderr.slice(0, outputLimit),
      timedOut,
      error: error instanceof Error ? error.message : String(error),
    }));

    child.on("close", (code, signal) => {
      const exitCode = typeof code === "number" ? code : signal ? 1 : 0;
      finalize({
        ok: exitCode === 0,
        command: argv,
        stdout: stdout.slice(0, outputLimit),
        stderr: stderr.slice(0, outputLimit),
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
    const modelValues = parseCodexModelListOutput(output);
    if (modelValues.length > 0) return modelValues;
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const ids = new Set<string>();
  for (const line of lines) {
    const match = line.split(/\s+|\t+/).find(Boolean);
    if (match) ids.add(match);
  }
  return [...ids];
}

export async function probeCliAdapter(adapter: CliAdapter, selectedExecutablePath?: string): Promise<{
  ok: boolean;
  supported: boolean;
  command: string;
  adapter: CliAdapterId;
  fields: readonly CliFieldDescriptor[];
  modelDiscovery: "native" | "manual" | "none";
  modelGuidance: string;
  availableModels: string[];
  modelMetadata: CodexModelMetadata[];
  currentVersion?: string;
  danger: readonly string[];
  reason?: string;
}> {
  const versionProbe = await runCliProbe(adapter.versionProbe, { executablePath: selectedExecutablePath });
  const helpProbe = await runCliProbe(adapter.helpProbe, { executablePath: selectedExecutablePath });
  const helpText = `${helpProbe.stdout}\n${helpProbe.stderr}`.trim().toLowerCase();
  const versionText = versionProbe.ok ? versionProbe.stdout.trim() || versionProbe.stderr.trim() : "";
  const supportedFields = helpProbe.ok
    ? adapter.fields.filter((field) => {
        const flag = field.flag.toLowerCase();
        if (field.kind === "boolean") return helpText.includes(flag);
        return helpText.includes(flag) || (field.flag.includes("--model") && helpText.includes("model"));
      })
    : [];

  let availableModels: string[] = [];
  let modelMetadata: CodexModelMetadata[] = [];
  if (adapter.modelProbe && adapter.id === "codex") {
    const payload = await runCodexAppServerModelProbeDetailed(selectedExecutablePath ?? adapter.modelProbe[0] ?? "codex");
    availableModels = payload.models;
    modelMetadata = payload.metadata;
  } else if (adapter.modelProbe) {
    const modelProbe = await runCliProbe(adapter.modelProbe, { executablePath: selectedExecutablePath });
    if (modelProbe.ok) {
      availableModels = parseModelListOutput(adapter.id, `${modelProbe.stdout}\n${modelProbe.stderr}`);
    }
  }

  const nativeModelProbeRequired = Boolean(adapter.modelProbe && adapter.modelDiscovery === "native");
  const ok = versionProbe.ok && helpProbe.ok && (!nativeModelProbeRequired || availableModels.length > 0);
  const supported = ok && supportedFields.length > 0;
  let reason: string | undefined;
  if (!versionProbe.ok) reason = versionProbe.error ?? "version probe failed";
  else if (!helpProbe.ok) reason = helpProbe.error ?? "help probe failed";
  else if (nativeModelProbeRequired && availableModels.length === 0) reason = "model probe failed";
  else if (!supported) reason = "no compatible builder flags were discovered";

  return {
    ok,
    supported,
    command: adapter.versionProbe[0] ?? "",
    adapter: adapter.id,
    fields: supportedFields,
    modelDiscovery: adapter.modelDiscovery,
    modelGuidance: adapter.modelGuidance,
    availableModels,
    modelMetadata,
    currentVersion: versionText || undefined,
    danger: adapter.dangerousFlags ?? [],
    reason,
  };
}
