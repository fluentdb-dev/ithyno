// SPDX-License-Identifier: GPL-3.0-or-later
import { contextBridge, ipcRenderer } from 'electron';
const IPC_TERMINAL_RESTART = 'ithyno:terminal-restart';
const IPC_IMPORT_PROJECT = 'ithyno:import-project';

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
});
