/**
 * Electron-shell runtime detection + bridge.
 *
 * The Electron preload script exposes `window.openspecUI` with a `platform`
 * string and a `setTitleBarColor(color, symbolColor)` method. Its presence is
 * the signal that the app is running inside the Electron shell (as opposed to
 * a plain browser or the VS Code webview).
 */

declare global {
  interface Window {
    openspecUI?: {
      platform: NodeJS.Platform;
      setTitleBarColor(color: string, symbolColor: string): void;
    };
  }
}

export function isElectronShell(): boolean {
  return typeof window !== "undefined" && window.openspecUI != null;
}

export function isElectronMac(): boolean {
  return isElectronShell() && window.openspecUI?.platform === "darwin";
}

export function setTitleBarColor(color: string, symbolColor: string): void {
  window.openspecUI?.setTitleBarColor(color, symbolColor);
}
