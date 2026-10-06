// SPDX-License-Identifier: GPL-3.0-or-later

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
    if (adapter.aliases.some((alias) => alias.toLowerCase() === normalized)) return adapter;
    if (id === normalized || normalized === "antigravity" || normalized === "github-copilot") return adapter;
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
        if (!token.includes("=") && next !== undefined && !next.startsWith("-")) i += 1;
        continue;
      }
      const next = token.includes("=") ? undefined : args[i + 1];
      if (!token.includes("=") && next !== undefined && !next.startsWith("-")) i += 1;
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

export function sanitizePersistedArgs(args: readonly string[]): string[] {
  return [...args].filter((arg) => arg !== undefined && arg !== null);
}

export function parseCodexModelListOutput(output: string): string[] {
  const text = output.trim();
  if (!text) return [];
  const values = new Set<string>();
  const sentences = text.split(/\r?\n/);
  for (const line of sentences) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      const match = trimmed.split(/\s+|\t+/).find(Boolean);
      if (match) values.add(match);
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const result = parsed && typeof parsed.result === "object" ? parsed.result as Record<string, unknown> : null;
      const data = result && typeof result.data !== "undefined" ? result.data : parsed && typeof parsed.models !== "undefined" ? parsed.models : [];
      const models = Array.isArray(data) ? data : [];
      for (const item of models) {
        if (typeof item === "string") values.add(item.trim());
        if (item && typeof item === "object") {
          const entry = item as Record<string, unknown>;
          const id = typeof entry.id === "string" ? entry.id : typeof entry.model === "string" ? entry.model : undefined;
          if (id) values.add(id.trim());
        }
      }
    } catch {
      const match = trimmed.split(/\s+|\t+/).find(Boolean);
      if (match) values.add(match);
    }
  }
  return [...values];
}

export function parseModelListOutput(adapterId: CliAdapterId, output: string): string[] {
  const text = output.trim();
  if (!text) return [];
  if (adapterId === "codex") {
    const parsed = parseCodexModelListOutput(output);
    if (parsed.length > 0) return parsed;
  }
  const ids = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().split(/\s+|\t+/).find(Boolean);
    if (match) ids.add(match);
  }
  return [...ids];
}
