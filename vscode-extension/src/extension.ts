// SPDX-License-Identifier: GPL-3.0-or-later
import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnServer, SpawnedServer } from "./server-spawner";
import { renderOnboardingHtml, renderWebviewHtml } from "./webview-html";

/**
 * Choose the startup command sent to the injected terminal.
 *
 * - Non-empty config value → verbatim override.
 * - Empty / unset → session-id logic against
 *   `<workspaceRoot>/.ithyno/session-id`:
 *     - file missing / empty → mint UUID, write, emit `claude --session-id`
 *     - file present, non-empty → emit `claude --resume`
 * - On write failure → fall back to `claude` (fresh) + console.warn.
 *
 * Landed by vscode-terminal-uses-project-session-id (2026-07-19).
 */
function resolveInjectedStartup(
  workspaceRoot: string,
  configValue: string | undefined,
): string {
  if (configValue && configValue.trim().length > 0) {
    return configValue;
  }
  const idPath = join(workspaceRoot, ".ithyno", "session-id");
  let uuid = "";
  if (existsSync(idPath)) {
    try {
      uuid = readFileSync(idPath, "utf8").trim();
    } catch {
      /* fall through to mint */
    }
  }
  if (uuid) {
    return `claude --resume ${uuid}`;
  }
  const fresh = randomUUID();
  try {
    mkdirSync(dirname(idPath), { recursive: true });
    writeFileSync(idPath, `${fresh}\n`);
  } catch (err) {
    console.warn(
      "[ithyno] failed to persist session-id, falling back to fresh claude:",
      err,
    );
    return "claude";
  }
  return `claude --session-id ${fresh}`;
}

type PanelSession = {
  panel: vscode.WebviewPanel;
  server: SpawnedServer;
  terminal: vscode.Terminal | null;
  workspaceRoot: string;
};

let session: PanelSession | null = null;

/**
 * Ensure `s.terminal` points at a live "ithyno" VS Code Terminal.
 *
 * Idempotent: if the terminal is still alive, return it as-is. Otherwise
 * create a fresh one, resolve the startup command per
 * `ithyno.terminalStartup`, and send it. See
 * `vscode-terminal-uses-project-session-id` for the session-id contract
 * and `add-vscode-dashboard-terminal-autostart` for the eager-vs-lazy
 * trigger.
 */
function ensureTerminal(s: PanelSession): vscode.Terminal {
  if (s.terminal && s.terminal.exitStatus === undefined) return s.terminal;
  s.terminal = vscode.window.createTerminal({
    name: "ithyno",
    cwd: s.workspaceRoot,
  });
  const configValue = vscode.workspace
    .getConfiguration("ithyno")
    .get<string>("terminalStartup", "");
  const startup = resolveInjectedStartup(s.workspaceRoot, configValue);
  if (startup && startup.trim().length > 0) {
    s.terminal.sendText(startup, true);
  }
  return s.terminal;
}

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand("ithyno.show", async () => {
    if (session) {
      session.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage("ithyno: open a folder first.");
      return;
    }
    const workspaceRoot = folders[0].uri.fsPath;

    let server: SpawnedServer;
    try {
      server = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "ithyno: starting server…",
          cancellable: false,
        },
        () => spawnServer({ extensionPath: context.extensionPath, workspaceRoot }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`ithyno: failed to start server (${msg})`);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "ithyno",
      "ithyno",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    panel.webview.html = renderWebviewHtml(server.url);

    const s: PanelSession = { panel, server, terminal: null, workspaceRoot };
    session = s;

    // Eager terminal spawn (default) — mirrors Electron/browser channels
    // where opening the dashboard immediately connects to a live PTY.
    // Skipped when `ithyno.autoLaunchTerminal` is false, in which case
    // the terminal is created lazily on the first pty.inject message.
    const autoLaunch = vscode.workspace
      .getConfiguration("ithyno")
      .get<boolean>("autoLaunchTerminal", true);
    if (autoLaunch) {
      const t = ensureTerminal(s);
      t.show(true); // preserveFocus so the dashboard keeps keyboard focus
    }

    panel.webview.onDidReceiveMessage((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "pty.inject" && typeof msg.data === "string") {
        const terminate = msg.terminate !== false;
        const t = ensureTerminal(s);
        t.sendText(msg.data, terminate);
        t.show(true);
      }
    });

    panel.onDidDispose(() => {
      s.server.dispose();
      if (s.terminal && s.terminal.exitStatus === undefined) {
        // Leave the terminal for the user — they may want its scrollback.
      }
      if (session === s) session = null;
    });
  });

  const newProjectCmd = vscode.commands.registerCommand(
    "ithyno.newProject",
    () => runNewProjectFlow(context),
  );

  context.subscriptions.push(cmd, newProjectCmd);
}

/**
 * Validate a target path posted from the onboarding webview.
 *
 * Must be absolute, must not contain `..` traversal tokens (defense in
 * depth — the picker builds a normal absolute path, but the webview is
 * still a boundary), and its parent directory must exist.
 */
function isValidOnboardingTarget(target: unknown): target is string {
  if (typeof target !== "string" || target.length === 0) return false;
  if (!target.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(target)) return false;
  const parts = target.split(/[\\/]/);
  if (parts.some((p) => p === "..")) return false;
  const parent = dirname(target);
  return existsSync(parent);
}

async function runNewProjectFlow(
  context: vscode.ExtensionContext,
): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Create ithyno project here",
    title: "Select a folder for the new ithyno project",
  });
  if (!picked || picked.length === 0) return;
  const parentDir = picked[0].fsPath;

  const subdir = await vscode.window.showInputBox({
    prompt:
      "Project name (leave empty to use the selected folder as the project root)",
    placeHolder: "my-ithyno-project",
    validateInput: (value) => {
      if (!value) return null;
      if (/[\\/]/.test(value)) {
        return "Project name cannot contain slashes.";
      }
      if (value === "." || value === "..") {
        return "Project name cannot be '.' or '..'.";
      }
      return null;
    },
  });
  if (subdir === undefined) return;

  const target = subdir.trim().length > 0 ? join(parentDir, subdir.trim()) : parentDir;

  let server: SpawnedServer;
  try {
    server = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "ithyno: starting init server…",
        cancellable: false,
      },
      () => spawnServer({ extensionPath: context.extensionPath, workspaceRoot: parentDir }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`ithyno: failed to start server (${msg})`);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "ithyno.onboarding",
    "ithyno: New Project",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
  );
  panel.webview.html = renderOnboardingHtml(server.url, target);

  let disposed = false;
  panel.webview.onDidReceiveMessage((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "onboarding-open") {
      const t = msg.target;
      if (!isValidOnboardingTarget(t)) {
        vscode.window.showErrorMessage(
          `ithyno: refusing to open invalid project target: ${String(t)}`,
        );
        return;
      }
      // Dispose the panel BEFORE the reload — the extension host is about to
      // recycle. server.dispose() runs in onDidDispose below.
      disposed = true;
      panel.dispose();
      vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(t),
        false,
      );
      return;
    }
    if (msg.type === "onboarding-close") {
      disposed = true;
      panel.dispose();
      return;
    }
  });

  panel.onDidDispose(() => {
    if (!disposed) disposed = true;
    server.dispose();
  });
}

export function deactivate(): void {
  if (session) {
    session.server.dispose();
    session.panel.dispose();
    session = null;
  }
}
