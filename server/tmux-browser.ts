// SPDX-License-Identifier: GPL-3.0-or-later
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { resolvedTmuxSessionName } from "./sync/pty.js";

const execFile = promisify(execFileCallback);
const COMMAND_TIMEOUT_MS = 3_000;
const MAX_CAPTURE_BYTES = 512 * 1024;
export const DEFAULT_HISTORY_LINES = 5_000;
export const MAX_HISTORY_LINES = 20_000;

export type TmuxCapabilities = {
  topology: boolean;
  selection: boolean;
  history: boolean;
};

function normalizeCommandList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function detectTmuxCapabilities(
  runner: TmuxCommandRunner,
  provider: "tmux" | "psmux",
): Promise<{ capabilities: TmuxCapabilities; reason?: string }> {
  if (provider === "tmux") {
    return { capabilities: capabilities(true) };
  }

  try {
    const commands = await runner(["list-commands", "-F", "#{command}"]);
    const available = new Set(normalizeCommandList(commands.stdout));
    const selectionWindow = available.has("select-window");
    const selectionPane = available.has("select-pane");
    const selection = selectionWindow && selectionPane;
    const history = available.has("capture-pane");

    const reasons: string[] = [];
    if (!selectionWindow || !selectionPane) {
      const missing = [!selectionWindow ? "select-window" : null, !selectionPane ? "select-pane" : null].filter(Boolean);
      reasons.push(`selection is disabled because ${missing.join(" and ")} is not supported by ${provider}`);
    }
    if (!history) {
      reasons.push(`history is disabled because capture-pane is not supported by ${provider}`);
    }

    return {
      capabilities: {
        topology: true,
        selection,
        history,
      },
      reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    };
  } catch (error) {
    return {
      capabilities: {
        topology: true,
        selection: false,
        history: false,
      },
      reason: `Capability probe failed for ${provider}; selection and history are disabled: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export type TmuxPane = {
  id: string;
  windowId: string;
  windowIndex: number;
  index: number;
  title: string;
  active: boolean;
  width: number;
  height: number;
  currentPath: string;
};

export type TmuxWindow = {
  id: string;
  index: number;
  name: string;
  active: boolean;
  paneCount: number;
  layout: string;
  panes: TmuxPane[];
};

export type TmuxTopology = {
  available: boolean;
  provider: "tmux" | "psmux" | null;
  version: string | null;
  capabilities: TmuxCapabilities;
  session: null | {
    name: string;
    windows: TmuxWindow[];
  };
  reason?: string;
};

export type TmuxHistory = {
  paneId: string;
  content: string;
  lineLimit: number;
  truncated: boolean;
};

export type TmuxActionId =
  | "next-window"
  | "previous-window"
  | "last-window"
  | "pane-left"
  | "pane-right"
  | "pane-up"
  | "pane-down"
  | "create-window"
  | "split-left"
  | "split-right"
  | "split-top"
  | "split-bottom"
  | "toggle-pane-zoom"
  | "cycle-layout"
  | "refresh-topology"
  | "open-history"
  | "close-pane"
  | "kill-pane"
  | "kill-window"
  | "kill-session";

export type ExecutableTmuxActionId = Exclude<
  TmuxActionId,
  "refresh-topology" | "open-history" | "kill-pane" | "kill-window"
>;

export type TmuxActionAvailability = "executable" | "unsupported" | "client-only" | "reference-only";
export type TmuxActionGroup = "navigation" | "pane" | "layout" | "history" | "session";

export type TmuxActionCatalogEntry = {
  id: TmuxActionId;
  group: TmuxActionGroup;
  label: string;
  shortcut: string;
  availability: TmuxActionAvailability;
  supported: boolean;
  description: string;
};

export const TMUX_ACTION_CATALOG: readonly TmuxActionCatalogEntry[] = [
  { id: "next-window", group: "navigation", label: "Next window", shortcut: "Ctrl+B, then n", availability: "executable", supported: true, description: "Move to the next tmux window." },
  { id: "previous-window", group: "navigation", label: "Previous window", shortcut: "Ctrl+B, then p", availability: "executable", supported: true, description: "Move to the previous tmux window." },
  { id: "last-window", group: "navigation", label: "Last window", shortcut: "Ctrl+B, then l", availability: "executable", supported: true, description: "Return to the most recent tmux window." },
  { id: "pane-left", group: "pane", label: "Move left", shortcut: "Ctrl+B, then Left Arrow", availability: "executable", supported: true, description: "Select the pane on the left." },
  { id: "pane-right", group: "pane", label: "Move right", shortcut: "Ctrl+B, then Right Arrow", availability: "executable", supported: true, description: "Select the pane on the right." },
  { id: "pane-up", group: "pane", label: "Move up", shortcut: "Ctrl+B, then Up Arrow", availability: "executable", supported: true, description: "Select the pane above." },
  { id: "pane-down", group: "pane", label: "Move down", shortcut: "Ctrl+B, then Down Arrow", availability: "executable", supported: true, description: "Select the pane below." },
  { id: "create-window", group: "session", label: "Create window", shortcut: "Ctrl+B, then c", availability: "executable", supported: true, description: "Create a new tmux window in the current project session." },
  { id: "split-left", group: "layout", label: "Split left", shortcut: "Ctrl+B, then %", availability: "executable", supported: true, description: "Split the active pane to the left." },
  { id: "split-right", group: "layout", label: "Split right", shortcut: 'Ctrl+B, then "', availability: "executable", supported: true, description: "Split the active pane to the right." },
  { id: "split-top", group: "layout", label: "Split top", shortcut: 'Ctrl+B, then "', availability: "executable", supported: true, description: "Split the active pane above." },
  { id: "split-bottom", group: "layout", label: "Split bottom", shortcut: 'Ctrl+B, then %', availability: "executable", supported: true, description: "Split the active pane below." },
  { id: "toggle-pane-zoom", group: "layout", label: "Toggle zoom", shortcut: "Ctrl+B, then z", availability: "executable", supported: true, description: "Toggle the active pane zoom state." },
  { id: "cycle-layout", group: "layout", label: "Cycle layout", shortcut: "Ctrl+B, then Space", availability: "executable", supported: true, description: "Cycle the active window layout." },
  { id: "refresh-topology", group: "history", label: "Refresh topology", shortcut: "Click Refresh", availability: "client-only", supported: true, description: "Fetch a fresh tmux topology snapshot without restarting the terminal." },
  { id: "open-history", group: "history", label: "Open pane history", shortcut: "Click History", availability: "client-only", supported: true, description: "Open the retained history viewer for the active pane." },
  { id: "kill-pane", group: "session", label: "Kill pane", shortcut: "Ctrl+B, then x", availability: "reference-only", supported: false, description: "Reference-only destructive shortcut; ithyno does not execute it in the initial release." },
  { id: "kill-window", group: "session", label: "Kill window", shortcut: "Ctrl+B, then &", availability: "reference-only", supported: false, description: "Reference-only destructive shortcut; ithyno does not execute it in the initial release." },
  { id: "kill-session", group: "session", label: "Stop session", shortcut: "Click Stop session", availability: "executable", supported: true, description: "Stop the Manager and every window and pane in the current project session; it does not merely hide the tmux panel." },
];

export function getTmuxActionCatalog(provider: "tmux" | "psmux" | null = "tmux"): TmuxActionCatalogEntry[] {
  if (!provider) return [];
  const override: Partial<Record<TmuxActionId, boolean>> = provider === "psmux"
    ? {
        "create-window": false,
        "split-left": false,
        "split-right": false,
        "split-top": false,
        "split-bottom": false,
      }
    : {};

  return TMUX_ACTION_CATALOG.map((entry) => {
    const supported = override[entry.id] ?? entry.supported;
    if (provider === "psmux" && entry.availability === "executable" && !supported) {
      return { ...entry, availability: "unsupported", supported: false };
    }
    if (entry.availability === "reference-only") {
      return { ...entry, supported: false };
    }
    return { ...entry, supported };
  });
}

export function isTmuxActionExecutable(action: TmuxActionCatalogEntry): boolean {
  return action.availability === "executable" && action.supported;
}

type CommandResult = { stdout: string; stderr: string };
export type TmuxCommandRunner = (args: readonly string[]) => Promise<CommandResult>;

export class TmuxBrowserError extends Error {
  constructor(
    public readonly kind: "unavailable" | "unsupported" | "session-missing" | "target-missing" | "command-failed",
    message: string,
  ) {
    super(message);
    this.name = "TmuxBrowserError";
  }
}

const defaultRunner: TmuxCommandRunner = async (args) => {
  try {
    const result = await execFile("tmux", [...args], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
      windowsHide: true,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (err.code === "ENOENT") {
      throw new TmuxBrowserError("unavailable", "tmux is not available on PATH");
    }
    throw error;
  }
};

function asBool(value: string): boolean {
  return value === "1" || value === "on" || value === "true";
}

function asInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rows(output: string): string[][] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

export function parseTmuxTopology(
  sessionName: string,
  windowsOutput: string,
  panesOutput: string,
): TmuxTopology["session"] {
  const panes = rows(panesOutput).map((fields): TmuxPane => ({
    id: fields[0] ?? "",
    windowId: fields[1] ?? "",
    windowIndex: asInt(fields[2] ?? "0"),
    index: asInt(fields[3] ?? "0"),
    title: fields[4] ?? "",
    active: asBool(fields[5] ?? "0"),
    width: asInt(fields[6] ?? "0"),
    height: asInt(fields[7] ?? "0"),
    currentPath: fields.slice(8).join("\t"),
  })).filter((pane) => /^%\d+$/.test(pane.id) && /^@\d+$/.test(pane.windowId));

  const windows = rows(windowsOutput).map((fields): TmuxWindow => {
    const id = fields[0] ?? "";
    return {
      id,
      index: asInt(fields[1] ?? "0"),
      name: fields[2] ?? "",
      active: asBool(fields[3] ?? "0"),
      paneCount: asInt(fields[4] ?? "0"),
      layout: fields.slice(5).join("\t"),
      panes: panes.filter((pane) => pane.windowId === id),
    };
  }).filter((window) => /^@\d+$/.test(window.id));

  return { name: sessionName, windows };
}

function providerForPlatform(platform: NodeJS.Platform): "tmux" | "psmux" {
  return platform === "win32" ? "psmux" : "tmux";
}

function capabilities(enabled = true): TmuxCapabilities {
  return { topology: enabled, selection: enabled, history: enabled };
}

function isCommandFailure(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error;
}

async function version(runner: TmuxCommandRunner): Promise<string> {
  const result = await runner(["-V"]);
  return result.stdout.trim();
}

async function sessionExists(sessionName: string, runner: TmuxCommandRunner): Promise<boolean> {
  try {
    await runner(["has-session", "-t", sessionName]);
    return true;
  } catch (error) {
    if (error instanceof TmuxBrowserError && error.kind === "unavailable") throw error;
    if (isCommandFailure(error)) return false;
    throw error;
  }
}

export async function getTmuxTopology(
  projectRoot: string,
  options: { runner?: TmuxCommandRunner; platform?: NodeJS.Platform } = {},
): Promise<TmuxTopology> {
  const runner = options.runner ?? defaultRunner;
  const provider = providerForPlatform(options.platform ?? process.platform);
  const sessionName = resolvedTmuxSessionName(projectRoot);

  let detectedVersion: string;
  try {
    detectedVersion = await version(runner);
  } catch (error) {
    if (error instanceof TmuxBrowserError && error.kind === "unavailable") {
      return {
        available: false,
        provider: null,
        version: null,
        capabilities: capabilities(false),
        session: null,
        reason: error.message,
      };
    }
    return {
      available: false,
      provider,
      version: null,
      capabilities: capabilities(false),
      session: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (!(await sessionExists(sessionName, runner))) {
    const capabilityProbe = await detectTmuxCapabilities(runner, provider);
    return {
      available: true,
      provider,
      version: detectedVersion,
      capabilities: capabilityProbe.capabilities,
      session: null,
      reason: capabilityProbe.reason ?? "No tmux session exists for this project",
    };
  }

  try {
    const [windows, panes] = await Promise.all([
      runner([
        "list-windows", "-t", sessionName,
        "-F", "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}\t#{window_layout}",
      ]),
      runner([
        "list-panes", "-s", "-t", sessionName,
        "-F", "#{pane_id}\t#{window_id}\t#{window_index}\t#{pane_index}\t#{pane_title}\t#{pane_active}\t#{pane_width}\t#{pane_height}\t#{pane_current_path}",
      ]),
    ]);
    const capabilityProbe = await detectTmuxCapabilities(runner, provider);
    return {
      available: true,
      provider,
      version: detectedVersion,
      capabilities: {
        topology: true,
        selection: capabilityProbe.capabilities.selection,
        history: capabilityProbe.capabilities.history,
      },
      session: parseTmuxTopology(sessionName, windows.stdout, panes.stdout),
      reason: capabilityProbe.reason ?? "tmux topology is available",
    };
  } catch (error) {
    const capabilityProbe = await detectTmuxCapabilities(runner, provider).catch(() => ({
      capabilities: capabilities(false),
      reason: `Capability probe failed for ${provider}: ${error instanceof Error ? error.message : String(error)}`,
    }));
    return {
      available: true,
      provider,
      version: detectedVersion,
      capabilities: {
        topology: false,
        selection: capabilityProbe.capabilities.selection,
        history: capabilityProbe.capabilities.history,
      },
      session: null,
      reason: `tmux topology is unsupported or failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function selectTmuxTarget(
  projectRoot: string,
  target: { windowId?: string; paneId?: string },
  options: { runner?: TmuxCommandRunner; platform?: NodeJS.Platform } = {},
): Promise<void> {
  const runner = options.runner ?? defaultRunner;
  const topology = await getTmuxTopology(projectRoot, options);
  if (!topology.available) throw new TmuxBrowserError("unavailable", topology.reason ?? "tmux unavailable");
  if (!topology.capabilities.selection) throw new TmuxBrowserError("unsupported", topology.reason ?? "Selection is unsupported by this tmux provider");
  const session = topology.session;
  if (!session) throw new TmuxBrowserError("session-missing", "No tmux session exists for this project");

  if (target.paneId) {
    if (!/^%\d+$/.test(target.paneId)) throw new TmuxBrowserError("target-missing", "Invalid pane target");
    const pane = session.windows.flatMap((window) => window.panes).find((candidate) => candidate.id === target.paneId);
    if (!pane) throw new TmuxBrowserError("target-missing", "Pane is not part of the current project session");
    const window = session.windows.find((candidate) => candidate.id === pane.windowId);
    if (!window) throw new TmuxBrowserError("target-missing", "Pane window is not part of the current project session");
    await runner(["select-window", "-t", `${session.name}:${window.index}`]);
    await runner(["select-pane", "-t", pane.id]);
    return;
  }

  if (target.windowId) {
    if (!/^@\d+$/.test(target.windowId)) throw new TmuxBrowserError("target-missing", "Invalid window target");
    const window = session.windows.find((candidate) => candidate.id === target.windowId);
    if (!window) throw new TmuxBrowserError("target-missing", "Window is not part of the current project session");
    await runner(["select-window", "-t", `${session.name}:${window.index}`]);
    return;
  }

  throw new TmuxBrowserError("target-missing", "A windowId or paneId is required");
}

export async function executeTmuxAction(
  projectRoot: string,
  actionId: string,
  options: { runner?: TmuxCommandRunner; platform?: NodeJS.Platform } = {},
  paneId?: string,
): Promise<{ actionId: TmuxActionId }> {
  const runner = options.runner ?? defaultRunner;
  const topology = await getTmuxTopology(projectRoot, options);
  if (!topology.available) throw new TmuxBrowserError("unavailable", topology.reason ?? "tmux unavailable");
  if (!topology.session) throw new TmuxBrowserError("session-missing", "No tmux session exists for this project");

  const session = topology.session;
  const validatedPaneId = typeof paneId === "string" ? paneId : undefined;
  if (actionId === "close-pane") {
    if (!validatedPaneId) throw new TmuxBrowserError("target-missing", "paneId is required to close a pane");
    if (!/^%\d+$/.test(validatedPaneId)) throw new TmuxBrowserError("target-missing", "Invalid pane target");
    const pane = session.windows.flatMap((window) => window.panes).find((candidate) => candidate.id === validatedPaneId);
    if (!pane) throw new TmuxBrowserError("target-missing", "Pane is not part of the current project session");

    try {
      await runner(["kill-pane", "-t", validatedPaneId]);
    } catch (error) {
      throw new TmuxBrowserError(
        "command-failed",
        `Action ${actionId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { actionId: "close-pane" };
  }

  const catalog = getTmuxActionCatalog(topology.provider ?? "tmux");
  const action = catalog.find((entry) => entry.id === actionId) ?? null;
  if (!action) throw new TmuxBrowserError("unsupported", `Unknown tmux action: ${actionId}`);
  if (!isTmuxActionExecutable(action)) {
    throw new TmuxBrowserError("unsupported", `${action.label} is not executable from ithyno`);
  }

  const activeWindow = session.windows.find((window) => window.active) ?? session.windows[0];
  const activePane = activeWindow?.panes.find((pane) => pane.active) ?? activeWindow?.panes[0];
  if (!activeWindow) throw new TmuxBrowserError("session-missing", "No active tmux window is available");

  const sessionTarget = session.name;
  const activePaneTarget = activePane ? activePane.id : `%1`;
  const windowTarget = `${session.name}:${activeWindow.index}`;

  const argvById: Partial<Record<ExecutableTmuxActionId, readonly string[]>> = {
    "next-window": ["next-window", "-t", sessionTarget],
    "previous-window": ["previous-window", "-t", sessionTarget],
    "last-window": ["last-window", "-t", sessionTarget],
    "pane-left": ["select-pane", "-L", "-t", activePaneTarget],
    "pane-right": ["select-pane", "-R", "-t", activePaneTarget],
    "pane-up": ["select-pane", "-U", "-t", activePaneTarget],
    "pane-down": ["select-pane", "-D", "-t", activePaneTarget],
    "create-window": ["new-window", "-t", sessionTarget],
    "split-left": ["split-window", "-h", "-b", "-t", windowTarget],
    "split-right": ["split-window", "-h", "-t", windowTarget],
    "split-top": ["split-window", "-v", "-b", "-t", windowTarget],
    "split-bottom": ["split-window", "-v", "-t", windowTarget],
    "toggle-pane-zoom": ["resize-pane", "-Z", "-t", activePaneTarget],
    "cycle-layout": ["next-layout", "-t", windowTarget],
    "kill-session": ["kill-session", "-t", sessionTarget],
  };

  const argv = argvById[action.id as ExecutableTmuxActionId];
  if (!argv) throw new TmuxBrowserError("unsupported", `No executable tmux argv mapping for ${action.id}`);

  try {
    await runner(argv);
  } catch (error) {
    throw new TmuxBrowserError(
      "command-failed",
      `Action ${action.id} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { actionId: action.id };
}

export async function captureTmuxPaneHistory(
  projectRoot: string,
  paneId: string,
  requestedLines = DEFAULT_HISTORY_LINES,
  options: { runner?: TmuxCommandRunner; platform?: NodeJS.Platform } = {},
): Promise<TmuxHistory> {
  const runner = options.runner ?? defaultRunner;
  const topology = await getTmuxTopology(projectRoot, options);
  if (!topology.available) throw new TmuxBrowserError("unavailable", topology.reason ?? "tmux unavailable");
  if (!topology.capabilities.history) throw new TmuxBrowserError("unsupported", topology.reason ?? "Pane history is unsupported by this tmux provider");
  const session = topology.session;
  if (!session) throw new TmuxBrowserError("session-missing", "No tmux session exists for this project");
  if (!/^%\d+$/.test(paneId)) throw new TmuxBrowserError("target-missing", "Invalid pane target");
  const exists = session.windows.some((window) => window.panes.some((pane) => pane.id === paneId));
  if (!exists) throw new TmuxBrowserError("target-missing", "Pane is not part of the current project session");

  const lineLimit = Math.max(1, Math.min(MAX_HISTORY_LINES, Math.trunc(requestedLines)));
  let result: CommandResult;
  try {
    result = await runner(["capture-pane", "-p", "-J", "-S", `-${lineLimit}`, "-t", paneId]);
  } catch (error) {
    throw new TmuxBrowserError(
      "unsupported",
      `Pane history is unsupported or failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let content = result.stdout;
  const contentBuffer = Buffer.from(content, "utf8");
  const overByteLimit = contentBuffer.length > MAX_CAPTURE_BYTES;
  if (overByteLimit) {
    const tail = contentBuffer.subarray(contentBuffer.length - MAX_CAPTURE_BYTES);
    content = tail.toString("utf8");
  }

  const rawLines = content.split(/\r?\n/);
  const lastLine = rawLines[rawLines.length - 1];
  if (lastLine === "") rawLines.pop();
  const hadTailTruncation = rawLines.length > lineLimit;
  const boundedLines = rawLines.slice(-lineLimit);
  const boundedContent = boundedLines.join("\n");
  const normalizedContent = boundedLines.length > 0 && content.endsWith("\n")
    ? `${boundedContent}\n`
    : boundedContent;

  return {
    paneId,
    content: normalizedContent,
    lineLimit,
    truncated: overByteLimit || hadTailTruncation,
  };
}
