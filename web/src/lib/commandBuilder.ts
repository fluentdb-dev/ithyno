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
export type CliFieldCategory =
  | "model"
  | "reasoning"
  | "permissions"
  | "sandbox"
  | "execution"
  | "context"
  | "tools-access"
  | "unattended-dangerous"
  | "advanced";

export type CliFieldCategoryConfig = {
  label: string;
  defaultOpen: boolean;
  dangerous?: boolean;
};

export type CliFieldDescriptor = {
  key: string;
  label: string;
  flag: string;
  kind: CliFieldKind;
  category?: CliFieldCategory;
  choices?: readonly string[];
  dangerous?: boolean;
  guidance?: string;
};

export type CliModelInfo = {
  id: string;
  label?: string;
  source?: "native" | "manual";
};

export type CliSessionStartupMode = "managed" | "new" | "picker" | "latest" | "custom";

export type CliSessionStartupOption = {
  value: Exclude<CliSessionStartupMode, "custom">;
  label: string;
  args: readonly string[];
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

export const CLI_FIELD_CATEGORY_ORDER: readonly CliFieldCategory[] = [
  "model",
  "reasoning",
  "permissions",
  "sandbox",
  "execution",
  "context",
  "tools-access",
  "unattended-dangerous",
  "advanced",
] as const;

export const CLI_FIELD_CATEGORY_CONFIG: Record<CliFieldCategory, CliFieldCategoryConfig> = {
  model: { label: "Model", defaultOpen: true },
  reasoning: { label: "Reasoning", defaultOpen: true },
  permissions: { label: "Permissions", defaultOpen: false },
  sandbox: { label: "Sandbox", defaultOpen: false },
  execution: { label: "Execution", defaultOpen: false },
  context: { label: "Context", defaultOpen: false },
  "tools-access": { label: "Tools & Access", defaultOpen: false },
  "unattended-dangerous": { label: "Unattended / Dangerous", defaultOpen: false, dangerous: true },
  advanced: { label: "Advanced", defaultOpen: false },
};

export function normalizeCliFieldCategory(value?: string | CliFieldCategory | null): CliFieldCategory {
  if (value && value in CLI_FIELD_CATEGORY_CONFIG) return value as CliFieldCategory;
  return "advanced";
}

export function getCliFieldCategory(field: Pick<CliFieldDescriptor, "category" | "dangerous" | "flag" | "key">): CliFieldCategory {
  if (field.category) return normalizeCliFieldCategory(field.category);
  if (field.dangerous) return "unattended-dangerous";
  const flag = canonicalCliFlagName(field.flag || field.key || "");
  if (["model", "profile", "auto-tier"].includes(flag)) return "model";
  if (["effort", "reasoning-effort"].includes(flag)) return "reasoning";
  if (["permission-mode", "ask-for-approval", "approve-for-me"].includes(flag)) return "permissions";
  if (["sandbox"].includes(flag)) return "sandbox";
  if (["mode", "autopilot", "plan"].includes(flag)) return "execution";
  if (["context", "add-dir"].includes(flag)) return "context";
  if (["allow-tool", "deny-tool", "allow-url", "deny-url", "allow-path", "deny-path"].includes(flag)) return "tools-access";
  if (["yolo", "allow-all", "dangerously-skip-permissions", "dangerously-bypass-approvals-and-sandbox"].includes(flag)) return "unattended-dangerous";
  return "advanced";
}

export function groupCliFieldsByCategory(fields: readonly CliFieldDescriptor[]): Record<CliFieldCategory, CliFieldDescriptor[]> {
  const groups: Record<CliFieldCategory, CliFieldDescriptor[]> = {
    model: [],
    reasoning: [],
    permissions: [],
    sandbox: [],
    execution: [],
    context: [],
    "tools-access": [],
    "unattended-dangerous": [],
    advanced: [],
  };

  for (const field of fields) {
    const category = getCliFieldCategory(field);
    groups[category].push(field);
  }
  return groups;
}

export function orderedCliFieldCategories(fields: readonly CliFieldDescriptor[]): CliFieldCategory[] {
  const present = new Set<CliFieldCategory>();
  for (const field of fields) {
    present.add(getCliFieldCategory(field));
  }
  return CLI_FIELD_CATEGORY_ORDER.filter((category) => category === "advanced" || present.has(category));
}

export const CLI_ADAPTERS: Record<CliAdapterId, CliAdapter> = {
  claude: {
    id: "claude",
    aliases: ["claude", "claude-code"],
    displayName: "Claude Code",
    fields: [
      { key: "model", label: "Model", flag: "--model", kind: "text", category: "model", guidance: "Use a model alias or full name; CLI may expose /model interactively." },
      { key: "effort", label: "Effort", flag: "--effort", kind: "select", category: "reasoning", choices: ["low", "medium", "high", "xhigh", "max"], guidance: "Sets the reasoning effort level." },
      { key: "permissionMode", label: "Permission mode", flag: "--permission-mode", kind: "select", category: "permissions", choices: ["default", "acceptEdits", "auto", "plan", "dontAsk", "bypassPermissions"], guidance: "Approval policy for tool use." },
      { key: "dangerouslySkipPermissions", label: "Dangerous skip permissions", flag: "--dangerously-skip-permissions", kind: "boolean", category: "unattended-dangerous", dangerous: true, guidance: "Bypasses permission prompts." },
    ],
    versionProbe: ["claude", "--version"],
    helpProbe: ["claude", "--help"],
    modelProbe: undefined,
    modelDiscovery: "manual",
    modelGuidance: "Suggestions come from Anthropic's official Claude Code model configuration reference. Provider-specific and gateway model names remain editable.",
    dangerousFlags: ["--dangerously-skip-permissions"],
  },
  codex: {
    id: "codex",
    aliases: ["codex"],
    displayName: "Codex CLI",
    fields: [
      { key: "model", label: "Model", flag: "--model", kind: "text", category: "model" },
      { key: "profile", label: "Profile", flag: "--profile", kind: "text", category: "model" },
      { key: "sandbox", label: "Sandbox", flag: "--sandbox", kind: "select", category: "sandbox", choices: ["read-only", "workspace-write", "danger-full-access"] },
      { key: "approval", label: "Approval", flag: "--ask-for-approval", kind: "select", category: "permissions", choices: ["on-request", "never"] },
      { key: "approveForMe", label: "Approve for me", flag: "--approve-for-me", kind: "boolean", category: "permissions" },
      { key: "dangerouslyBypassApprovalsAndSandbox", label: "Dangerous bypass", flag: "--dangerously-bypass-approvals-and-sandbox", kind: "boolean", category: "unattended-dangerous", dangerous: true },
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
      { key: "model", label: "Model", flag: "--model", kind: "text", category: "model" },
      { key: "effort", label: "Effort", flag: "--effort", kind: "select", category: "reasoning", choices: ["low", "medium", "high", "xhigh", "max"] },
      { key: "mode", label: "Mode", flag: "--mode", kind: "select", category: "execution", choices: ["accept-edits", "plan"] },
      { key: "sandbox", label: "Sandbox", flag: "--sandbox", kind: "boolean", category: "sandbox" },
      { key: "dangerouslySkipPermissions", label: "Dangerous skip permissions", flag: "--dangerously-skip-permissions", kind: "boolean", category: "unattended-dangerous", dangerous: true },
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
      { key: "model", label: "Model", flag: "--model", kind: "text", category: "model" },
      { key: "reasoningEffort", label: "Reasoning effort", flag: "--reasoning-effort", kind: "select", category: "reasoning", choices: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
      { key: "context", label: "Context", flag: "--context", kind: "select", category: "context", choices: ["default", "long_context"] },
      { key: "autoTier", label: "Auto tier", flag: "--auto-tier", kind: "select", category: "model", choices: ["efficiency", "balance", "intelligence"] },
      { key: "mode", label: "Mode", flag: "--mode", kind: "select", category: "execution", choices: ["interactive", "plan", "autopilot"] },
      { key: "allowAll", label: "Allow all", flag: "--allow-all", kind: "boolean", category: "unattended-dangerous", dangerous: true },
      { key: "yolo", label: "YOLO", flag: "--yolo", kind: "boolean", category: "unattended-dangerous", dangerous: true },
    ],
    versionProbe: ["copilot", "--version"],
    helpProbe: ["copilot", "help", "commands"],
    modelProbe: undefined,
    modelDiscovery: "manual",
    modelGuidance: "Suggestions come from GitHub's official Copilot CLI supported-models reference. Availability depends on the user's plan and organization policy; the field remains editable.",
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

export function cliSessionStartupOptions(adapterId: CliAdapterId): readonly CliSessionStartupOption[] {
  if (adapterId === "codex") {
    return [
      { value: "new", label: "Start a new session", args: [] },
      { value: "picker", label: "Choose a session to resume", args: ["resume"] },
      { value: "latest", label: "Resume the latest session", args: ["resume", "--last"] },
    ];
  }
  if (adapterId === "claude") {
    return [
      { value: "managed", label: "Managed project session ID", args: [] },
      { value: "new", label: "Start a new session", args: [] },
      { value: "picker", label: "Choose a session to resume", args: ["--resume"] },
      { value: "latest", label: "Continue the latest session", args: ["--continue"] },
    ];
  }
  if (adapterId === "copilot") {
    return [
      { value: "new", label: "Start a new session", args: [] },
      { value: "picker", label: "Choose a session to resume", args: ["--resume"] },
      { value: "latest", label: "Continue the latest session", args: ["--continue"] },
    ];
  }
  return [];
}

export function detectCliSessionStartup(
  adapterId: CliAdapterId,
  args: readonly string[],
): CliSessionStartupMode {
  if (adapterId === "codex") {
    const resumeIndex = args.indexOf("resume");
    if (resumeIndex < 0) return "new";
    const tail = args.slice(resumeIndex + 1);
    if (tail.includes("--last")) return "latest";
    const firstResumeArgument = tail[0];
    return firstResumeArgument === undefined || firstResumeArgument.startsWith("-") ? "picker" : "custom";
  }
  if (adapterId === "claude" || adapterId === "copilot") {
    if (args.includes("--continue") || (adapterId === "claude" && args.includes("-c"))) return "latest";
    if (adapterId === "claude" && args.includes("--session-id")) return "custom";
    const resumeIndex = args.findIndex((arg) => arg === "--resume" || arg === "-r");
    if (resumeIndex < 0) return "new";
    const next = args[resumeIndex + 1];
    return next === undefined || next.startsWith("-") ? "picker" : "custom";
  }
  return "new";
}

export function setCliSessionStartup(
  adapterId: CliAdapterId,
  args: readonly string[],
  mode: Exclude<CliSessionStartupMode, "custom">,
): string[] {
  const options = cliSessionStartupOptions(adapterId);
  const selected = options.find((option) => option.value === mode);
  if (!selected) return [...args];

  const preserved: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (adapterId === "codex" && token === "resume") {
      const next = args[index + 1];
      if (next === "--last") index += 1;
      else if (next !== undefined && !next.startsWith("-")) index += 1;
      continue;
    }
    if ((adapterId === "claude" || adapterId === "copilot") && token === "--continue") {
      continue;
    }
    if (adapterId === "claude" && token === "-c") {
      continue;
    }
    if (adapterId === "claude" && token === "--session-id") {
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("-")) index += 1;
      continue;
    }
    if ((adapterId === "claude" || adapterId === "copilot") && (token === "--resume" || token === "-r")) {
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("-")) index += 1;
      continue;
    }
    preserved.push(token);
  }
  return [...preserved, ...selected.args];
}

function equivalentCliField(
  field: CliFieldDescriptor,
  candidate: CliFieldDescriptor,
): boolean {
  return canonicalCliFlagName(field.flag) === canonicalCliFlagName(candidate.flag)
    && field.kind === candidate.kind
    && JSON.stringify(field.choices ?? []) === JSON.stringify(candidate.choices ?? []);
}

/**
 * Remove options that belong only to the previous CLI when the Command field
 * switches between supported adapters. Shared fields with the same shape and
 * genuinely free-form arguments are retained.
 */
export function migrateCliArgsForAdapterSwitch(
  args: readonly string[],
  previousAdapter: CliAdapter | null,
  nextAdapter: CliAdapter | null,
): string[] {
  if (!previousAdapter || !nextAdapter || previousAdapter.id === nextAdapter.id) {
    return [...args];
  }

  const withoutPreviousSession = setCliSessionStartup(previousAdapter.id, args, "new");
  const fieldsToRemove = previousAdapter.fields.filter(
    (field) => !nextAdapter.fields.some((candidate) => equivalentCliField(field, candidate)),
  );
  const removals = Object.fromEntries(
    fieldsToRemove.map((field) => [canonicalCliFlagName(field.flag), undefined]),
  );
  return mergeCliArgs(withoutPreviousSession, removals);
}

/**
 * Keep only arguments managed by the current adapter, including its dedicated
 * session-startup controls. Everything else belongs to the free-form portion
 * of the draft and is discarded by the scoped reset action.
 */
export function resetFreeFormCliArgs(
  args: readonly string[],
  adapter: CliAdapter,
): string[] {
  const fieldsByFlag = new Map(
    adapter.fields.map((field) => [canonicalCliFlagName(field.flag), field]),
  );
  const kept: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;

    if (adapter.id === "codex" && token === "resume") {
      kept.push(token);
      const next = args[index + 1];
      if (next === "--last" || (next !== undefined && !next.startsWith("-"))) {
        kept.push(next);
        index += 1;
      }
      continue;
    }

    if ((adapter.id === "claude" || adapter.id === "copilot") && token === "--continue") {
      kept.push(token);
      continue;
    }
    if (adapter.id === "claude" && token === "-c") {
      kept.push(token);
      continue;
    }
    if ((adapter.id === "claude" || adapter.id === "copilot") && (token === "--resume" || token === "-r")) {
      kept.push(token);
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        kept.push(next);
        index += 1;
      }
      continue;
    }

    if (!token.startsWith("-") || token === "-") continue;
    const bareFlag = token.split("=", 1)[0];
    const field = fieldsByFlag.get(canonicalCliFlagName(bareFlag));
    if (!field) {
      const next = args[index + 1];
      if (!token.includes("=") && next !== undefined && !next.startsWith("-")) index += 1;
      continue;
    }

    kept.push(token);
    if (field.kind !== "boolean" && !token.includes("=")) {
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        kept.push(next);
        index += 1;
      }
    }
  }

  return kept;
}

export function cliTextFieldPlaceholder(
  adapterId: CliAdapterId,
  field: Pick<CliFieldDescriptor, "key" | "label" | "guidance">,
  modelOptions: readonly string[] = [],
): string {
  if (field.key === "model") {
    if (modelOptions[0]) return `e.g. ${modelOptions[0]}`;
    if (adapterId === "claude") return "e.g. sonnet or claude-sonnet-4-6";
    if (adapterId === "agy") return "e.g. gemini-3.6-flash";
    if (adapterId === "copilot") return "e.g. auto or a supported model name";
    return "Enter a model name";
  }
  if (field.key === "profile") return "e.g. work or fast";
  return field.guidance ?? `Enter ${field.label.toLowerCase()}`;
}

export type ParsedCliArgs = {
  values: Record<string, string[]>;
  unknown: string[];
  conflicts: string[];
};

export function parseCliArgs(
  args: readonly string[],
  adapter?: Pick<CliAdapter, "fields"> | null,
): ParsedCliArgs {
  const values: Record<string, string[]> = {};
  const unknown: string[] = [];
  const conflicts: string[] = [];
  const seen = new Map<string, string>();
  const knownKeys = adapter
    ? new Set(adapter.fields.flatMap((field) => [field.flag, field.key, canonicalCliFlagName(field.flag)]))
    : KNOWN_CLI_ARG_KEYS;
  const booleanKeys = adapter
    ? new Set(
        adapter.fields
          .filter((field) => field.kind === "boolean")
          .flatMap((field) => [field.flag, field.key, canonicalCliFlagName(field.flag)]),
      )
    : BOOLEAN_CLI_ARG_KEYS;

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
    const isKnown = knownKeys.has(bareFlag) || knownKeys.has(canonical) || knownKeys.has(bareFlag.replace(/^--?/, ""));
    const isBooleanFlag = booleanKeys.has(bareFlag) || booleanKeys.has(canonical) || booleanKeys.has(bareFlag.replace(/^--?/, ""));
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

export function detectCliArgConflicts(
  args: readonly string[],
  adapter?: Pick<CliAdapter, "fields"> | null,
): string[] {
  return parseCliArgs(args, adapter).conflicts;
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
    const stringValue = String(value);
    // Keep values that begin with "-" attached to their flag. Otherwise a
    // partially typed value such as "-" is parsed as another option on the
    // next render and the original field is incorrectly shown as `true`.
    if (stringValue.startsWith("-")) {
      appended.push(`${flag}=${stringValue}`);
      continue;
    }
    appended.push(flag, stringValue);
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
