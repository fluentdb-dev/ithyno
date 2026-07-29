// SPDX-License-Identifier: GPL-3.0-or-later
// Preload for the welcome BrowserWindow. Exposes a minimal API on
// window.ithynoWelcome that welcome.html uses to render app identity
// (sourced from readAboutConfig, same as the About panel), list
// recent projects, and signal user actions back to main.
// (add-electron-welcome-window.)
import { contextBridge, ipcRenderer } from 'electron';

const RECENT_UPDATED = 'welcome:recent-updated';

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
    const listener = (_e: unknown, paths: string[]): void => cb(paths);
    ipcRenderer.on(RECENT_UPDATED, listener);
    return () => ipcRenderer.removeListener(RECENT_UPDATED, listener);
  },
});
