# Tasks

## 1. Web UI Session Expired Action Button

- [x] 1.1 `web/src/App.tsx` — render a primary `[Reload Dashboard]` button on the `authExpired` screen.
- [x] 1.2 `web/src/styles.css` — style the `auth-expired` action button and layout.

## 2. Shell Integration

- [x] 2.1 Web/Browser — `onClick` triggers `window.location.reload()`.
- [x] 2.2 Electron — `onClick` triggers `window.location.reload()` (re-evaluates server token query or reloads active project).
- [x] 2.3 VS Code Extension — `onClick` posts `ithyno:reload-session` to extension host to refresh webview.

## 3. Verification

- [x] 3.1 `npm run typecheck && npm test && npm run build` passes cleanly.
