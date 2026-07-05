import { contextBridge, ipcRenderer } from 'electron';

export const IPC_SET_TITLE_BAR_COLOR = 'openspec-ui:set-title-bar-color';

contextBridge.exposeInMainWorld('openspecUI', {
  platform: process.platform,
  setTitleBarColor: (color: string, symbolColor: string): void => {
    ipcRenderer.send(IPC_SET_TITLE_BAR_COLOR, color, symbolColor);
  },
});
