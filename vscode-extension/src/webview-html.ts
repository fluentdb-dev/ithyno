// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Minimal HTML shell for the ithyno webview.
 *
 * The extension spawns the existing Fastify server on a random localhost
 * port and hands the resulting URL to this template. We embed it in a
 * full-viewport iframe rather than navigating the webview root so the parent
 * document can host the postMessage bridge (webview <-> extension) even
 * though the app itself runs inside the iframe.
 *
 * `acquireVsCodeApi()` is only injected into the top-level webview document,
 * not the iframe. We flag the iframe URL with `vscode=1` so the React app
 * knows to route messages via `window.parent.postMessage` instead.
 */
export function renderWebviewHtml(serverUrl: string): string {
  const url = new URL(serverUrl);
  url.searchParams.set("vscode", "1");
  const iframeSrc = url.toString();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #1e1e1e; }
      iframe { border: 0; width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <iframe id="app" src="${iframeSrc}" allow="clipboard-read; clipboard-write"></iframe>
    <script>
      // Bridge: forward pty.* messages from the iframe (React app) to the
      // extension host, and relay any host-originated messages back into
      // the iframe.
      const vscode = acquireVsCodeApi();
      const app = document.getElementById('app');

      function sendTheme() {
        if (!app || !app.contentWindow) return;
        const isLight = document.body.classList.contains('vscode-light');
        const theme = isLight ? 'light' : 'dark';
        app.contentWindow.postMessage({ type: 'vscode:theme-changed', theme }, '*');
      }

      if (app) {
        app.addEventListener('load', sendTheme);
      }
      const observer = new MutationObserver(sendTheme);
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

      window.addEventListener('message', (event) => {
        const data = event && event.data;
        if (!data || typeof data !== 'object') return;
        if (event.source === app.contentWindow) {
          if (typeof data.type === 'string' && data.type.indexOf('pty.') === 0) {
            vscode.postMessage(data);
          }
          return;
        }
        if (app.contentWindow) {
          app.contentWindow.postMessage(data, '*');
        }
      });
    </script>
  </body>
</html>`;
}

/**
 * HTML shell for the onboarding webview.
 *
 * Loads `<server>/onboarding?target=<encoded>&channel=vscode` in an iframe
 * and forwards `onboarding-*` postMessages between the iframed React app
 * and the extension host. Same iframe-parent bridge pattern as
 * renderWebviewHtml, but the message filter is `onboarding-*` (open, close)
 * instead of `pty.*`.
 *
 * Landed by add-vscode-extension-new-project (2026-07-19).
 */
export function renderOnboardingHtml(
  serverUrl: string,
  target: string,
): string {
  const url = new URL(serverUrl);
  url.pathname = "/onboarding";
  url.searchParams.set("target", target);
  url.searchParams.set("channel", "vscode");
  const iframeSrc = url.toString();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #1e1e1e; }
      iframe { border: 0; width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <iframe id="app" src="${iframeSrc}" allow="clipboard-read; clipboard-write"></iframe>
    <script>
      const vscode = acquireVsCodeApi();
      const app = document.getElementById('app');
      window.addEventListener('message', (event) => {
        const data = event && event.data;
        if (!data || typeof data !== 'object') return;
        if (event.source === app.contentWindow) {
          if (
            data.type === 'onboarding-open' ||
            data.type === 'onboarding-close'
          ) {
            vscode.postMessage(data);
          }
          return;
        }
        if (app.contentWindow) {
          app.contentWindow.postMessage(data, '*');
        }
      });
    </script>
  </body>
</html>`;
}
