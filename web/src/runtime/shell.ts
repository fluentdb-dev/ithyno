/**
 * Runtime shell detection.
 *
 * The dashboard's React UI runs unchanged across three shells: the local
 * browser (served by the Fastify CLI), the Electron BrowserWindow, and the
 * VS Code extension webview. A handful of features are shell-conditional —
 * this module is the single source of truth for that check.
 */

declare global {
  interface Window {
    acquireVsCodeApi?: () => unknown;
  }
}

/** VS Code webview: `acquireVsCodeApi` is injected into the global scope. */
export function isVsCodeShell(): boolean {
  return typeof window !== "undefined" && typeof window.acquireVsCodeApi === "function";
}
