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
import { renderWebviewHtml } from "./webview-html";

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

    panel.webview.onDidReceiveMessage((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "pty.inject" && typeof msg.data === "string") {
        const terminate = msg.terminate !== false;
        if (!s.terminal || s.terminal.exitStatus !== undefined) {
          s.terminal = vscode.window.createTerminal({
            name: "ithyno",
            cwd: s.workspaceRoot,
          });
          // Auto-launch the startup command per `ithyno.terminalStartup`.
          // Empty / unset → session-id auto-manage (mirrors server-side
          // pty.ts fallback). Non-empty → user override, sent verbatim.
          // See vscode-terminal-uses-project-session-id.
          const configValue = vscode.workspace
            .getConfiguration("ithyno")
            .get<string>("terminalStartup", "");
          const startup = resolveInjectedStartup(s.workspaceRoot, configValue);
          if (startup && startup.trim().length > 0) {
            s.terminal.sendText(startup, true);
          }
        }
        s.terminal.sendText(msg.data, terminate);
        s.terminal.show(true);
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

  context.subscriptions.push(cmd);
}

export function deactivate(): void {
  if (session) {
    session.server.dispose();
    session.panel.dispose();
    session = null;
  }
}
