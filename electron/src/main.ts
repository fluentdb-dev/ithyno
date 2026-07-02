import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  screen,
  shell,
} from 'electron';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ProjectStore, stateFilePath, type WindowState } from './project-store';
import { spawnServer, type SpawnResult } from './server-spawner';
import { buildAppMenu } from './menu';

const store = new ProjectStore(stateFilePath(app.getPath('userData')));

let mainWindow: BrowserWindow | null = null;
let currentSpawn: SpawnResult | null = null;
let quitting = false;

/**
 * Resolve the path to bin/openspec-ui.js in both dev (electron/out/main.js →
 * ../../bin/openspec-ui.js) and packaged (extraResources copies bin/ under
 * process.resourcesPath/app/bin) layouts.
 */
function resolveBinPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app', 'bin', 'openspec-ui.js');
  }
  return resolve(app.getAppPath(), '..', 'bin', 'openspec-ui.js');
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
      'OpenSpec UI',
      `Cannot find server entry at:\n${binPath}\n\nThis usually means the app was built without bundling bin/openspec-ui.js.`,
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
      title: 'OpenSpec UI',
      message: 'Failed to start the OpenSpec server',
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
    title: 'OpenSpec UI',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

function refreshMenu(): void {
  const menu = buildAppMenu({
    onOpenProject: () => {
      const parent = mainWindow ?? undefined;
      const picked = pickProjectDialog(parent);
      if (picked) void switchProject(picked);
    },
    onOpenRecent: (path) => {
      if (!isDirectory(path)) {
        store.removeFromRecent(path);
        refreshMenu();
        dialog.showErrorBox('OpenSpec UI', `Project folder no longer exists:\n${path}`);
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

function extractFolderFromArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i--) {
    const a = argv[i];
    if (!a || a.startsWith('-')) continue;
    if (a.endsWith('.js') || a.endsWith('.exe') || a.endsWith('electron')) continue;
    if (isDirectory(a)) return a;
  }
  return null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const folder = extractFolderFromArgv(argv);
    if (folder) {
      void switchProject(folder);
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    refreshMenu();
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
