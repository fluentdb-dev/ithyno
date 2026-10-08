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
