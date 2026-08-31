// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Runtime shell detection.
 *
 * The dashboard's React UI runs unchanged across three shells: the local
 * browser (served by the Fastify CLI), the Electron BrowserWindow, and the
 * VS Code extension webview. A handful of features are shell-conditional —
 * this module is the single source of truth for that check.
 *
 * VS Code hosts the React app inside an <iframe> nested in the top-level
 * webview document. `acquireVsCodeApi()` is only injected into that top-level
 * document, so the iframe cannot call it directly. The extension flags the
 * iframe URL with `?vscode=1`; we honor either signal as "VS Code shell".
 */

declare global {
  interface Window {
    acquireVsCodeApi?: () => unknown;
  }
}

function urlSaysVsCode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const hasParam = new URL(window.location.href).searchParams.get("vscode") === "1";
    if (hasParam) {
      try {
        sessionStorage.setItem("ithyno_is_vscode", "1");
      } catch {
        /* ignore */
      }
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    return sessionStorage.getItem("ithyno_is_vscode") === "1";
  } catch {
    return false;
  }
}

const isVsCode =
  typeof window !== "undefined" &&
  (typeof window.acquireVsCodeApi === "function" || urlSaysVsCode());

/** VS Code webview (either top-level document or its nested iframe). */
export function isVsCodeShell(): boolean {
  return isVsCode;
}

export function vscodeHostAppName(): string | undefined {
  if (!isVsCode || typeof window === "undefined") return undefined;
  try {
    return new URL(window.location.href).searchParams.get("hostAppName") || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Post a message to the VS Code extension host. When called from the nested
 * iframe (the normal case), we go via `window.parent` — the outer webview
 * document owns the `vscode.postMessage` handle and relays it.
 */
export function postToVsCode(message: unknown): void {
  if (typeof window === "undefined") return;
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, "*");
  } else if (typeof window.acquireVsCodeApi === "function") {
    const api = window.acquireVsCodeApi() as { postMessage: (m: unknown) => void };
    api.postMessage(message);
  }
}
