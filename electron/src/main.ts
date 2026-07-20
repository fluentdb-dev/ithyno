// SPDX-License-Identifier: GPL-3.0-or-later
import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  screen,
  shell,
} from 'electron';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const IPC_SET_TITLE_BAR_COLOR = 'openspec-ui:set-title-bar-color';
const DEFAULT_CHROME_COLOR = '#0f1115';
const DEFAULT_CHROME_SYMBOL = '#e6e9ef';
const OVERLAY_HEIGHT = 32;

import { ProjectStore, stateFilePath, type WindowState } from './project-store';
import { spawnServer, type SpawnResult } from './server-spawner';
import { buildAppMenu, type AboutConfig } from './menu';
import { ensureAgmsgInstalled } from './agmsg-installer';

/**
 * Read the root package.json and return an AboutConfig object.
 * In packaged mode the file is at `extraResources/app/package.json`.
 * In dev mode it lives one directory above the electron app root.
 */
function readAboutConfig(): AboutConfig {
  const pkgPath = app.isPackaged
    ? join(process.resourcesPath, 'app', 'package.json')
    : resolve(app.getAppPath(), '..', 'package.json');
  try {
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as {
      name?: string;
      version?: string;
      license?: string;
      description?: string;
      repository?: { url?: string } | string;
      bugs?: { url?: string } | string;
    };
    const repositoryUrl =
      typeof pkg.repository === 'string'
        ? pkg.repository
        : (pkg.repository?.url ?? 'https://github.com/fluentdb-dev/ithyno');
    const issuesUrl =
      typeof pkg.bugs === 'string'
        ? pkg.bugs
        : (pkg.bugs?.url ?? `${repositoryUrl}/issues`);
    return {
      name: pkg.name ?? 'ithyno',
      version: pkg.version ?? '0.0.0',
      license: pkg.license ?? 'GPL-3.0-or-later',
      description: pkg.description ?? '',
      repositoryUrl,
      issuesUrl,
      releasesUrl: `${repositoryUrl}/releases/latest`,
      licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
      sponsors: [{ label: 'Ko-fi', url: 'https://ko-fi.com/hamnbeans' }],
    };
  } catch (err) {
    console.warn('[about] failed to read package.json:', err);
    return {
      name: 'ithyno',
      version: '0.0.0',
      license: 'GPL-3.0-or-later',
      description: '',
      repositoryUrl: 'https://github.com/fluentdb-dev/ithyno',
      issuesUrl: 'https://github.com/fluentdb-dev/ithyno/issues',
      releasesUrl: 'https://github.com/fluentdb-dev/ithyno/releases/latest',
      licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
      sponsors: [{ label: 'Ko-fi', url: 'https://ko-fi.com/hamnbeans' }],
    };
  }
}

const store = new ProjectStore(stateFilePath(app.getPath('userData')));

let mainWindow: BrowserWindow | null = null;
let currentSpawn: SpawnResult | null = null;
let currentProjectRoot: string | null = null;
let quitting = false;

/**
 * Resolve the path to bin/ithyno.js in both dev (electron/out/main.js →
 * ../../bin/ithyno.js) and packaged (extraResources copies bin/ under
 * process.resourcesPath/app/bin) layouts.
 */
function resolveBinPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app', 'bin', 'ithyno.js');
  }
  return resolve(app.getAppPath(), '..', 'bin', 'ithyno.js');
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function pickProjectDialog(parent?: BrowserWindow): string | null {
  const opts: Electron.OpenDialogSyncOptions = {
    title: 'Select an OpenSpec project folder',
    properties: ['openDirectory'],
  };
  const result = parent
    ? dialog.showOpenDialogSync(parent, opts)
    : dialog.showOpenDialogSync(opts);
  if (!result || result.length === 0) return null;
  return result[0];
}

/**
 * Native picker for File → New Project…. Uses `createDirectory: true` so
 * the OS dialog exposes the "New Folder" affordance and the user can
 * create the target on the spot. Returns null on cancel.
 * (add-electron-new-project-flow.)
 */
function pickNewProjectDialog(parent?: BrowserWindow): string | null {
  const opts: Electron.OpenDialogSyncOptions = {
    title: 'Select a folder for the new ithyno project',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Create ithyno project here',
  };
  const result = parent
    ? dialog.showOpenDialogSync(parent, opts)
    : dialog.showOpenDialogSync(opts);
  if (!result || result.length === 0) return null;
  return result[0];
}

function validateWindowState(ws: WindowState): WindowState {
  const displays = screen.getAllDisplays();
  if (typeof ws.x === 'number' && typeof ws.y === 'number') {
    const onScreen = displays.some((d) => {
      const b = d.workArea;
      return (
        ws.x! >= b.x &&
        ws.y! >= b.y &&
        ws.x! + ws.width <= b.x + b.width + 100 &&
        ws.y! + ws.height <= b.y + b.height + 100
      );
    });
    if (!onScreen) {
      return { width: ws.width, height: ws.height };
    }
  }
  return ws;
}

async function ensureProject(): Promise<string | null> {
  const saved = store.getLastProject();
  if (saved && isDirectory(saved)) return saved;
  if (saved && !isDirectory(saved)) {
    store.removeFromRecent(saved);
  }
  return pickProjectDialog() ?? null;
}

async function tearDownServer(): Promise<void> {
  const spawn = currentSpawn;
  currentSpawn = null;
  currentProjectRoot = null;
  if (!spawn) return;
  const child = spawn.child;
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* noop */
      }
      resolve();
    }, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isMinimized() || win.isFullScreen()) return;
  const bounds = win.getBounds();
  store.setWindowState({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
  });
}

async function createWindowForProject(projectRoot: string): Promise<void> {
  await tearDownServer();

  const binPath = resolveBinPath();
  if (!existsSync(binPath)) {
    dialog.showErrorBox(
      'ithyno',
      `Cannot find server entry at:\n${binPath}\n\nThis usually means the app was built without bundling bin/ithyno.js.`,
    );
    app.quit();
    return;
  }

  let spawn: SpawnResult;
  try {
    spawn = await spawnServer({
      binPath,
      projectRoot,
      onLog: (line, stream) => {
        if (stream === 'stderr') process.stderr.write(line);
        else process.stdout.write(line);
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'ithyno',
      message: 'Failed to start the ithyno server',
      detail: message,
      buttons: ['Retry', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) {
      await createWindowForProject(projectRoot);
    } else {
      app.quit();
    }
    return;
  }
  currentSpawn = spawn;
  currentProjectRoot = resolve(projectRoot);
  store.setProject(projectRoot);
  refreshMenu();

  const savedWs = validateWindowState(store.getWindowState());

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(spawn.url);
    mainWindow.focus();
    return;
  }

  const win = new BrowserWindow({
    width: savedWs.width,
    height: savedWs.height,
    x: savedWs.x,
    y: savedWs.y,
    title: 'ithyno',
    show: false,
    backgroundColor: DEFAULT_CHROME_COLOR,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin'
      ? {}
      : {
          titleBarOverlay: {
            color: DEFAULT_CHROME_COLOR,
            symbolColor: DEFAULT_CHROME_SYMBOL,
            height: OVERLAY_HEIGHT,
          },
        }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', () => saveWindowState(win));
  win.on('resize', () => saveWindowState(win));
  win.on('move', () => saveWindowState(win));
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  await win.loadURL(spawn.url);
}

async function switchProject(projectRoot: string): Promise<void> {
  await createWindowForProject(projectRoot);
}

/**
 * File → New Project… handler. Follows the agmsg-installer pattern:
 * native OS dialog + direct `runInit` import + switch to the new
 * project on success. No HTTP round-trip through the local server.
 * (add-electron-new-project-flow.)
 */
async function onNewProject(): Promise<void> {
  try {
    await onNewProjectImpl();
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error('[new-project] failed:', msg);
    dialog.showErrorBox('New Project failed', msg);
  }
}

async function onNewProjectImpl(): Promise<void> {
  const parent = mainWindow ?? undefined;
  const picked = pickNewProjectDialog(parent);
  if (!picked) return; // user cancelled — silent
  if (!currentSpawn) {
    dialog.showErrorBox(
      'New Project failed',
      'ithyno server is not running yet — open a project first, then try again.',
    );
    return;
  }
  openOnboardingWindow(picked, currentSpawn.url);
}

/**
 * Open a small child BrowserWindow that loads the shared /onboarding
 * page from the local server. The page drives runInit + openspec init
 * via POST /api/init/stream and — when the user clicks "Open Project"
 * — sends `onboarding-open` IPC so we can switchProject in main.
 * (add-new-project-onboarding-window.)
 */
function openOnboardingWindow(target: string, serverUrl: string): void {
  // serverUrl has a `?token=<t>` query — the same token main-window's
  // sessionStorage was bootstrapped with. The onboarding BrowserWindow
  // has its own session storage, so we thread the token through the
  // URL query so its own `bootstrapToken` picks it up.
  const parsed = new URL(serverUrl);
  const base = `${parsed.origin}`;
  const token = parsed.searchParams.get('token');
  const params = new URLSearchParams({
    target,
    channel: 'electron',
  });
  if (token) params.set('token', token);
  const url = `${base}/onboarding?${params.toString()}`;

  const win = new BrowserWindow({
    parent: mainWindow ?? undefined,
    width: 640,
    height: 540,
    title: 'ithyno — New Project',
    modal: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolveOnboardingPreload(),
    },
  });
  void win.loadURL(url);

  const openHandler = (_e: Electron.IpcMainEvent, requested: string): void => {
    if (win.isDestroyed()) return;
    win.close();
    void switchProject(requested);
  };
  const closeHandler = (): void => {
    if (!win.isDestroyed()) win.close();
  };
  ipcMain.on('onboarding-open', openHandler);
  ipcMain.on('onboarding-close', closeHandler);
  win.on('closed', () => {
    ipcMain.removeListener('onboarding-open', openHandler);
    ipcMain.removeListener('onboarding-close', closeHandler);
  });
}

function resolveOnboardingPreload(): string {
  // Same layout resolution as resolveBinPath / agmsg-installer.
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app', 'electron', 'out', 'onboarding-preload.js');
  }
  return resolve(app.getAppPath(), 'out', 'onboarding-preload.js');
}

let _aboutConfig: AboutConfig | null = null;

function refreshMenu(aboutConfig?: AboutConfig): void {
  if (aboutConfig) _aboutConfig = aboutConfig;
  const about = _aboutConfig ?? {
    name: 'ithyno',
    version: app.getVersion(),
    license: 'GPL-3.0-or-later',
    description: '',
    repositoryUrl: 'https://github.com/fluentdb-dev/ithyno',
    issuesUrl: 'https://github.com/fluentdb-dev/ithyno/issues',
    releasesUrl: 'https://github.com/fluentdb-dev/ithyno/releases/latest',
    licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
    sponsors: [{ label: 'Ko-fi', url: 'https://ko-fi.com/hamnbeans' }],
  };
  const menu = buildAppMenu({
    about,
    onOpenProject: () => {
      const parent = mainWindow ?? undefined;
      const picked = pickProjectDialog(parent);
      if (picked) void switchProject(picked);
    },
    onNewProject: () => {
      void onNewProject();
    },
    onOpenRecent: (path) => {
      if (!isDirectory(path)) {
        store.removeFromRecent(path);
        refreshMenu();
        dialog.showErrorBox('ithyno', `Project folder no longer exists:\n${path}`);
        return;
      }
      void switchProject(path);
    },
    onQuit: () => {
      app.quit();
    },
    onOpenDocumentation: () => {
      const doc = app.isPackaged
        ? join(process.resourcesPath, 'app', 'docs', 'migration-guide.md')
        : resolve(app.getAppPath(), '..', 'docs', 'migration-guide.md');
      if (existsSync(doc)) {
        void shell.openPath(doc);
      } else {
        void shell.openExternal('https://github.com/anthropics/openspec-ui');
      }
    },
    getRecent: () => store.getRecent(),
    getWindow: () => mainWindow,
  });
  Menu.setApplicationMenu(menu);
}

function extractFolderFromArgv(argv: string[], cwd: string): string | null {
  for (let i = argv.length - 1; i >= 0; i--) {
    const a = argv[i];
    if (!a || a.startsWith('-')) continue;
    if (a.endsWith('.js') || a.endsWith('.exe') || a.endsWith('electron')) continue;
    const abs = resolve(cwd, a);
    if (isDirectory(abs)) return abs;
  }
  return null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const folder = extractFolderFromArgv(argv, workingDirectory ?? process.cwd());
    if (folder && folder !== currentProjectRoot) {
      void switchProject(folder);
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.on(
    IPC_SET_TITLE_BAR_COLOR,
    (event, color: unknown, symbolColor: unknown) => {
      if (typeof color !== 'string') return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      if (process.platform === 'darwin') {
        win.setBackgroundColor(color);
      } else if (typeof symbolColor === 'string') {
        try {
          win.setTitleBarOverlay({
            color,
            symbolColor,
            height: OVERLAY_HEIGHT,
          });
        } catch {
          // setTitleBarOverlay is unavailable on some Linux setups; swallow.
        }
      }
    },
  );

  void app.whenReady().then(async () => {
    const aboutConfig = readAboutConfig();
    app.setAboutPanelOptions({
      applicationName: aboutConfig.name,
      applicationVersion: aboutConfig.version,
      copyright: `License: ${aboutConfig.license}`,
    });
    refreshMenu(aboutConfig);
    await ensureAgmsgInstalled();
    const project = await ensureProject();
    if (!project) {
      app.quit();
      return;
    }
    await createWindowForProject(project);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', async (event) => {
    if (quitting) return;
    if (!currentSpawn) return;
    event.preventDefault();
    quitting = true;
    await tearDownServer();
    app.quit();
  });

  app.on('activate', () => {
    if (!mainWindow && !quitting) {
      void app.whenReady().then(async () => {
        const project = await ensureProject();
        if (project) await createWindowForProject(project);
      });
    }
  });
}
