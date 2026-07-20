// SPDX-License-Identifier: GPL-3.0-or-later
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_TERMINAL_RESTART } from './menu';

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
});
