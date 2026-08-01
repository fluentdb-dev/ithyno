// SPDX-License-Identifier: GPL-3.0-or-later
import { contextBridge, ipcRenderer } from 'electron';
const IPC_TERMINAL_RESTART = 'ithyno:terminal-restart';
const IPC_IMPORT_PROJECT = 'ithyno:import-project';
const IPC_OPEN_PROJECT = 'ithyno:open-project';
const IPC_WELCOME_RECENT_UPDATED = 'welcome:recent-updated';

export const IPC_SET_TITLE_BAR_COLOR = 'openspec-ui:set-title-bar-color';

contextBridge.exposeInMainWorld('openspecUI', {
  platform: process.platform,
  setTitleBarColor: (color: string, symbolColor: string): void => {
    ipcRenderer.send(IPC_SET_TITLE_BAR_COLOR, color, symbolColor);
  },
});

contextBridge.exposeInMainWorld('ithyno', {
  /** Subscribe to terminal-restart events sent by the Electron menu.
   *  Returns an unsubscribe function. */
  onTerminalRestart: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on(IPC_TERMINAL_RESTART, listener);
    return () => ipcRenderer.off(IPC_TERMINAL_RESTART, listener);
  },
  /** import-project-spec-generation: subscribe to import-project events.
   *  Callback receives the selected project root path.
   *  Returns an unsubscribe function. */
  onImportProject: (cb: (projectRoot: string) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, projectRoot: string) => cb(projectRoot);
    ipcRenderer.on(IPC_IMPORT_PROJECT, listener);
    return () => ipcRenderer.off(IPC_IMPORT_PROJECT, listener);
  },
  /** enable-import-both-patterns: open an imported project as the active
   *  project. Sends IPC_OPEN_PROJECT to the main process which calls
   *  switchProject(path). */
  openProject: (path: string): void => {
    ipcRenderer.send(IPC_OPEN_PROJECT, path);
  },
  /** Subscribe to open-about events sent by the Electron menu.
   *  Returns an unsubscribe function. */
  onOpenAbout: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on('ithyno:open-about', listener);
    return () => ipcRenderer.off('ithyno:open-about', listener);
  },
});

/**
 * Welcome-view API — used only by welcome.html, which is loaded into the
 * SAME BrowserWindow that becomes the main window after Open Folder swaps
 * its URL to localhost:<port>. Keeping this on the main preload (rather
 * than a separate welcome-preload file) is what makes the "same-window
 * swap" possible: preload is fixed at BrowserWindow construction time, so
 * one preload has to serve both pages. The main React app never touches
 * `window.ithynoWelcome`.
 * (add-electron-welcome-window, same-window swap pivot.)
 */
contextBridge.exposeInMainWorld('ithynoWelcome', {
  getAbout: (): Promise<unknown> => ipcRenderer.invoke('welcome:get-about'),
  getRecent: (): Promise<string[]> => ipcRenderer.invoke('welcome:get-recent'),
  openFolder: (): void => {
    ipcRenderer.send('welcome:open-folder');
  },
  openRecent: (path: string): void => {
    ipcRenderer.send('welcome:open-recent', path);
  },
  openExternal: (url: string): void => {
    ipcRenderer.send('welcome:open-external', url);
  },
  quit: (): void => {
    ipcRenderer.send('welcome:quit');
  },
  onRecentUpdated: (cb: (paths: string[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, paths: string[]): void => cb(paths);
    ipcRenderer.on(IPC_WELCOME_RECENT_UPDATED, listener);
    return () => ipcRenderer.removeListener(IPC_WELCOME_RECENT_UPDATED, listener);
  },
});
