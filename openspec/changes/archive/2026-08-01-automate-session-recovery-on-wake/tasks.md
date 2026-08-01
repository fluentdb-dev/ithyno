# Tasks

## 1. Automated Wake-up & Session Recovery

- [x] 1.1 `web/src/App.tsx` — add `visibilitychange` and `focus` event listeners for automatic wake-up session re-authorization.
- [x] 1.2 `web/src/App.tsx` — implement automatic retry & auto-reload for Electron shell upon sleep wake-up.
- [x] 1.3 `web/src/store.ts` — enhance WebSocket reconnection on wake-up events.

## 2. Verification

- [x] 2.1 `npm run typecheck && npm test && npm run build` passes cleanly.
