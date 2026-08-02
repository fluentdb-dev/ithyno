// SPDX-License-Identifier: GPL-3.0-or-later
import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { spawnServer, SpawnedServer } from "./server-spawner";
import { renderOnboardingHtml, renderWebviewHtml } from "./webview-html";
import { buildAboutInfo, LICENSE_URL, ROOT_DESCRIPTION } from "./about-config";

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
function parseManagerCommand(workspaceRoot: string): { command: string; args?: string[] } | null {
  const p = join(workspaceRoot, "agents.yaml");
  if (!existsSync(p)) return null;
  try {
    const content = readFileSync(p, "utf8");
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== "object") return null;

    const agentsList: any[] = Array.isArray(parsed.agents)
      ? parsed.agents
      : Array.isArray(parsed.manager)
        ? parsed.manager
        : [];

    const manager = agentsList.find((a: any) => {
      if (!a || typeof a !== "object") return false;
      if (a.role === "manager") return true;
      if (Array.isArray(a.roles) && a.roles.includes("manager")) return true;
      return false;
    });

    if (manager && typeof manager.command === "string" && manager.command.trim().length > 0) {
      const args = Array.isArray(manager.args) ? manager.args.map(String) : [];
      return { command: manager.command.trim(), args };
    }
  } catch (err) {
    console.warn("[ithyno] failed to parse agents.yaml manager command:", err);
  }
  return null;
}

function resolveInjectedStartup(
  workspaceRoot: string,
  configValue: string | undefined,
): string {
  if (configValue && configValue.trim().length > 0) {
    return configValue;
  }
  const manager = parseManagerCommand(workspaceRoot);
  if (manager && manager.command) {
    const args = manager.args ?? [];
    if (manager.command === "claude" && args.length === 0) {
      // Fall through to claude session UUID mint / resume logic below
    } else {
      return [manager.command, ...args].join(" ");
    }
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

/**
 * Returns true when `agents.yaml` exists as a readable file at the given
 * workspace root. Returns false when absent, is a directory, or is a symlink
 * to a non-file. Mirrors the server-side `hasAgentsYaml()` helper.
 *
 * Landed by guard-terminal-autolaunch-on-agents-yaml.
 */
function workspaceHasAgentsYaml(workspaceRoot: string): boolean {
  const p = join(workspaceRoot, "agents.yaml");
  if (!existsSync(p)) return false;
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
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
    //
    // Guard (guard-terminal-autolaunch-on-agents-yaml): also skip when
    // the workspace has no agents.yaml — auto-launch is only useful when
    // agents are configured. Users can still open the terminal manually.
    const autoLaunch = vscode.workspace
      .getConfiguration("ithyno")
      .get<boolean>("autoLaunchTerminal", true);
    if (autoLaunch && workspaceHasAgentsYaml(workspaceRoot)) {
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
      if (msg.type === "ithyno:reload-session") {
        panel.webview.html = renderWebviewHtml(s.server.url);
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

  class SidebarDashboardViewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView): void {
      webviewView.webview.options = { enableScripts: true };

      webviewView.webview.html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); text-align: center; }
      button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; font-size: 13px; font-weight: 500; border-radius: 4px; cursor: pointer; margin-top: 12px; width: 100%; }
      button:hover { background: var(--vscode-button-hoverBackground); }
      p { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    </style>
  </head>
  <body>
    <p>ithyno OpenSpec Dashboard</p>
    <button onclick="openDashboard()">Open Dashboard in Tab</button>
    <script>
      const vscode = acquireVsCodeApi();
      function openDashboard() {
        vscode.postMessage({ command: 'openDashboard' });
      }
    </script>
  </body>
</html>`;

      webviewView.webview.onDidReceiveMessage((msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.command === "openDashboard") {
          void vscode.commands.executeCommand("ithyno.show");
        }
        if (msg.type === "pty.inject" && typeof msg.data === "string" && session) {
          const terminate = msg.terminate !== false;
          const t = ensureTerminal(session);
          t.sendText(msg.data, terminate);
          t.show(true);
        }
        if (msg.type === "ithyno:reload-session" && session) {
          webviewView.webview.html = renderWebviewHtml(session.server.url);
        }
      });
    }
  }

  const sidebarProvider = vscode.window.registerWebviewViewProvider(
    "ithyno.sidebarDashboardView",
    new SidebarDashboardViewProvider(),
  );

  const newProjectCmd = vscode.commands.registerCommand(
    "ithyno.newProject",
    () => runNewProjectFlow(context),
  );

  // import-project-spec-generation: open a folder picker then navigate
  // the existing ithyno dashboard to the import flow for that folder.
  const importProjectCmd = vscode.commands.registerCommand(
    "ithyno.importProject",
    () => runImportProjectFlow(),
  );

  const aboutCmd = vscode.commands.registerCommand("ithyno.about", () =>
    openAboutPanel(context),
  );

  context.subscriptions.push(cmd, sidebarProvider, newProjectCmd, importProjectCmd, aboutCmd);
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

/**
 * Open a small About webview panel.
 * `enableScripts: false` — no JavaScript, only static HTML + <a href> links.
 * VS Code intercepts external links and opens them via `vscode.env.openExternal`.
 *
 * All About data (sponsors, URLs, constants) comes from ./about-config — edit
 * there to add new sponsor entries without touching this function.
 */
function openAboutPanel(context: vscode.ExtensionContext): void {
  // Read the extension's own package.json — version always matches root
  // because `release:version` keeps them in sync.
  const pkgPath = join(context.extensionPath, "package.json");
  let pkg: Parameters<typeof buildAboutInfo>[0] = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
  } catch {
    // fall through with defaults
  }

  // The extension reads its own package.json whose description field is
  // VS Code Marketplace copy, not the canonical product description.
  // Override with ROOT_DESCRIPTION so all About surfaces show the same text.
  const info = buildAboutInfo({ ...pkg, description: ROOT_DESCRIPTION });
  // Use canonical "ithyno" as display name regardless of extension manifest name.
  const displayName = "ithyno";

  const panel = vscode.window.createWebviewPanel(
    "ithyno.about",
    "About ithyno",
    vscode.ViewColumn.Active,
    { enableScripts: false, localResourceRoots: [] },
  );

  const sponsorLinks = info.sponsors
    .map((s) => `    <a href="${s.url}">Sponsor via ${s.label}</a>`)
    .join("\n");

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About ithyno</title>
  <style>
    body { font-family: var(--vscode-font-family, sans-serif); padding: 24px; color: var(--vscode-foreground); }
    h1 { font-size: 1.4em; margin-bottom: 8px; }
    table { border-collapse: collapse; margin-bottom: 16px; }
    td { padding: 3px 12px 3px 0; font-size: 0.95em; }
    td:first-child { color: var(--vscode-descriptionForeground); }
    .links { display: flex; flex-direction: column; gap: 6px; }
    a { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <h1>${displayName}</h1>
  <table>
    <tr><td>Version</td><td><code>${info.version}</code></td></tr>
    <tr><td>License</td><td><a href="${LICENSE_URL}">${info.license}</a></td></tr>
    ${info.description ? `<tr><td>Description</td><td>${info.description}</td></tr>` : ""}
  </table>
  <div class="links">
    <a href="${info.repositoryUrl}">Open Repository</a>
    <a href="${info.issuesUrl}">Report an Issue</a>
${sponsorLinks}
    <a href="${info.releasesUrl}">Check for Updates</a>
    <a href="${info.licenseUrl}">View License</a>
  </div>
</body>
</html>`;
}

/**
 * import-project-spec-generation: ithyno.importProject command handler.
 *
 * Opens an OS folder picker and — if an ithyno dashboard is open — sends
 * a postMessage to the webview so the ImportProjectFlow component can take
 * over. If no dashboard is open, the user is prompted to open one first
 * (the empty-state Import button provides the same flow once loaded).
 *
 * The webview receives `{ type: "ithyno:import-project", projectRoot }`.
 * The webview's bootstrapped script relays this to window.ithyno.importProject
 * listeners registered by App.tsx.
 */
async function runImportProjectFlow(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Import this project",
    title: "Select project to import into ithyno",
  });
  if (!picked || picked.length === 0) return;
  const projectRoot = picked[0].fsPath;

  if (!session) {
    vscode.window.showInformationMessage(
      `ithyno: Open the ithyno dashboard (ithyno: Show Dashboard) first, ` +
      `then use the "Import" button in the dashboard for ${projectRoot}.`,
    );
    return;
  }

  // Post message to the webview — handled by the web app's IPC relay
  session.panel.reveal(vscode.ViewColumn.Beside);
  await session.panel.webview.postMessage({
    type: "ithyno:import-project",
    projectRoot,
  });
}

export function deactivate(): void {
  if (session) {
    session.server.dispose();
    session.panel.dispose();
    session = null;
  }
}
