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

import { ProjectStore, stateFilePath, type WindowState } from './project-store';
import { spawnServer, type SpawnResult } from './server-spawner';
import { buildAppMenu, type AboutConfig } from './menu';
import { buildAboutInfo, SPONSORS, LICENSE_URL, REPO_URL } from './about-config';

/**
 * Read the root package.json and return an AboutConfig object.
 * In packaged mode the file is at `extraResources/app/package.json`.
 * In dev mode it lives one directory above the electron app root.
 *
 * Sponsors list and URL constants come from ./about-config — edit there to
 * add new sponsor entries without touching this file.
 */
function readAboutConfig(): AboutConfig {
  const pkgPath = app.isPackaged
    ? join(process.resourcesPath, 'app', 'package.json')
    : resolve(app.getAppPath(), '..', 'package.json');
  try {
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as Parameters<typeof buildAboutInfo>[0];
    return buildAboutInfo(pkg);
  } catch (err) {
    console.warn('[about] failed to read package.json:', err);
    return {
      name: 'ithyno',
      version: '0.0.0',
      license: 'GPL-3.0-or-later',
      description: '',
      repositoryUrl: REPO_URL,
      issuesUrl: `${REPO_URL}/issues`,
      releasesUrl: `${REPO_URL}/releases/latest`,
      licenseUrl: LICENSE_URL,
      sponsors: SPONSORS,
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

/**
 * Resolve the packaged / dev path to welcome.html. The welcome page is
 * loaded into the SAME BrowserWindow that becomes the main window after
 * the user picks a project (same-window swap) — its preload is the
 * standard main preload (electron/src/preload.ts), so no separate
 * welcome-preload path is needed. (add-electron-welcome-window.)
 */
function resolveWelcomeHtml(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app', 'electron', 'welcome.html');
  }
  // Dev: app.getAppPath() is the electron/ directory (where package.json
  // lives); welcome.html sits at its root.
  return resolve(app.getAppPath(), 'welcome.html');
}

/**
 * Read the app icon (electron/build/icon.png, same file bundled as the
 * dock/taskbar icon) and return it as a base64 data URL. Injecting via
 * data URL avoids any file:// / CSP / packaging-path resolution
 * concerns in welcome.html; the icon is small enough (~few KB) that
 * inlining is cheap.
 *
 * Returns null when the icon file is missing — welcome.html degrades
 * gracefully to no icon.
 */
let _iconDataUrlCache: string | null | undefined = undefined;
function readAppIconDataUrl(): string | null {
  if (_iconDataUrlCache !== undefined) return _iconDataUrlCache;
  // In dev, app.getAppPath() IS the electron/ directory (that's where
  // its package.json lives), so the icon sits at
  // <appPath>/build/icon.png — NO leading `..`. An earlier version had
  // `..` and resolved to <repo-root>/build/icon.png, which doesn't
  // exist; that made readFileSync throw and the welcome page fell back
  // to `display:none` (icon invisible).
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'app', 'electron', 'build', 'icon.png')
    : resolve(app.getAppPath(), 'build', 'icon.png');
  try {
    const buf = readFileSync(iconPath);
    _iconDataUrlCache = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    console.warn('[welcome] failed to read icon at', iconPath, err);
    _iconDataUrlCache = null;
  }
  return _iconDataUrlCache;
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

/**
 * Create (or reuse) the single main BrowserWindow.
 *
 * - `projectRoot` non-null → spawn the server pinned to that root and load
 *   its URL. This is the standard "open a project" path.
 * - `projectRoot` null → skip server spawn and load welcome.html. Same
 *   BrowserWindow instance; when the user picks a folder from welcome, we
 *   call this function again with the picked path and the SAME window's
 *   URL swaps to localhost. That's the "same-window swap" contract — the
 *   welcome page and the main app share one window, one preload, and one
 *   set of window bounds.
 *
 * When `mainWindow` already exists (either a running project or a running
 * welcome view), we reuse it via loadURL / loadFile — no BrowserWindow
 * teardown, no bounds reset, no flicker.
 * (add-electron-welcome-window, same-window swap pivot.)
 */
async function createWindowForProject(projectRoot: string | null): Promise<void> {
  await tearDownServer();

  let spawn: SpawnResult | null = null;
  if (projectRoot !== null) {
    const binPath = resolveBinPath();
    if (!existsSync(binPath)) {
      dialog.showErrorBox(
        'ithyno',
        `Cannot find server entry at:\n${binPath}\n\nThis usually means the app was built without bundling bin/ithyno.js.`,
      );
      app.quit();
      return;
    }

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
  }

  const savedWs = validateWindowState(store.getWindowState());

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (spawn) {
      void mainWindow.loadURL(spawn.url);
    } else {
      void mainWindow.loadFile(resolveWelcomeHtml());
    }
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
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
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

  if (spawn) {
    await win.loadURL(spawn.url);
  } else {
    await win.loadFile(resolveWelcomeHtml());
  }
}

async function switchProject(projectRoot: string): Promise<void> {
  await createWindowForProject(projectRoot);
}

/**
 * File → New Project… handler: native OS directory-picker dialog, then
 * opens the same shared `/onboarding` window used by every other New
 * Project entry point (Settings' New Project form, and "No OpenSpec
 * project found" → "Initialize openspec here") — see
 * `openOnboardingWindow` below. All three converge on the same
 * `InitDialog` + `POST /api/init/stream` flow; this handler's only
 * Electron-specific part is picking the target directory natively
 * instead of via a text field. (add-electron-new-project-flow,
 * superseded by add-new-project-onboarding-window.)
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
  // Same layout resolution as resolveBinPath.
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app', 'electron', 'out', 'onboarding-preload.js');
  }
  return resolve(app.getAppPath(), 'out', 'onboarding-preload.js');
}

/**
 * IPC channels used by welcome.html (loaded into the main BrowserWindow
 * when no project is open). All handlers target `mainWindow` — the same
 * window instance whose URL will swap to localhost:<port> as soon as the
 * user picks a folder (same-window swap; see `createWindowForProject`).
 * (add-electron-welcome-window.)
 */
function registerWelcomeIpc(): void {
  ipcMain.handle('welcome:get-about', () => {
    // Extend the About payload with an inline icon data URL so
    // welcome.html can render the same asset that the About panel /
    // dock uses, without depending on file:// paths that differ
    // between dev and packaged layouts.
    return { ...readAboutConfig(), iconDataUrl: readAppIconDataUrl() };
  });
  ipcMain.handle('welcome:get-recent', () => store.getRecent());
  ipcMain.on('welcome:open-folder', () => {
    const picked = pickProjectDialog(mainWindow ?? undefined);
    if (!picked) return; // cancel — welcome stays visible in the same window
    void createWindowForProject(picked);
  });
  ipcMain.on('welcome:open-recent', (_e, path: unknown) => {
    if (typeof path !== 'string' || !path) return;
    if (!isDirectory(path)) {
      store.removeFromRecent(path);
      const w = mainWindow;
      if (w && !w.isDestroyed()) {
        w.webContents.send('welcome:recent-updated', store.getRecent());
      }
      return;
    }
    void createWindowForProject(path);
  });
  ipcMain.on('welcome:open-external', (_e, url: unknown) => {
    if (typeof url !== 'string' || !url) return;
    const about = readAboutConfig();
    const allowed =
      (about.licenseUrl && url === about.licenseUrl) ||
      (about.repositoryUrl && url.startsWith(about.repositoryUrl));
    if (!allowed) {
      console.warn('[welcome] refused external URL not in allowlist:', url);
      return;
    }
    void shell.openExternal(url);
  });
  ipcMain.on('welcome:quit', () => {
    app.quit();
  });
}

let _aboutConfig: AboutConfig | null = null;

function refreshMenu(aboutConfig?: AboutConfig): void {
  if (aboutConfig) _aboutConfig = aboutConfig;
  const about = _aboutConfig ?? {
    name: 'ithyno',
    version: app.getVersion(),
    license: 'GPL-3.0-or-later',
    description: '',
    repositoryUrl: REPO_URL,
    issuesUrl: `${REPO_URL}/issues`,
    releasesUrl: `${REPO_URL}/releases/latest`,
    licenseUrl: LICENSE_URL,
    sponsors: SPONSORS,
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
    onImportProject: () => {
      // import-project-spec-generation: open OS folder picker, then send the
      // picked path to the renderer via IPC so ImportProjectFlow can start.
      const parent = mainWindow ?? undefined;
      const opts: Electron.OpenDialogSyncOptions = {
        title: 'Select project to import into ithyno',
        properties: ['openDirectory'],
        buttonLabel: 'Import this project',
      };
      const result = parent
        ? dialog.showOpenDialogSync(parent, opts)
        : dialog.showOpenDialogSync(opts);
      const picked = result?.[0];
      if (!picked) return;
      const win = mainWindow;
      if (win && !win.isDestroyed()) {
        win.webContents.send('ithyno:import-project', picked);
      }
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
    (event, color: unknown) => {
      if (typeof color !== 'string') return;
      if (process.platform !== 'darwin') return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      win.setBackgroundColor(color);
    },
  );

  // enable-import-both-patterns: open an imported Pattern-A project as the
  // active project when the renderer calls window.ithyno.openProject(path).
  ipcMain.on('ithyno:open-project', (_event, path: unknown) => {
    if (typeof path !== 'string' || !path) return;
    void switchProject(path);
  });

  registerWelcomeIpc();

  void app.whenReady().then(async () => {
    const aboutConfig = readAboutConfig();
    app.setAboutPanelOptions({
      applicationName: aboutConfig.name,
      applicationVersion: aboutConfig.version,
      copyright: `License: ${aboutConfig.license}`,
    });
    refreshMenu(aboutConfig);

    // First-launch flow (add-electron-welcome-window, same-window swap):
    //   - Valid saved project → open with project (daily-driver: zero
    //     friction, no welcome flicker).
    //   - No / stale saved → open the SAME main window on welcome.html;
    //     Open Folder swaps its URL to localhost:<port> in place.
    const saved = store.getLastProject();
    if (saved && !isDirectory(saved)) {
      store.removeFromRecent(saved);
    }
    await createWindowForProject(saved && isDirectory(saved) ? saved : null);
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
    if (mainWindow || quitting) return;
    void app.whenReady().then(async () => {
      const saved = store.getLastProject();
      if (saved && !isDirectory(saved)) {
        store.removeFromRecent(saved);
      }
      await createWindowForProject(saved && isDirectory(saved) ? saved : null);
    });
  });
}
