---
tags: [feature/security, area/server, area/web]
---

## Why

The dashboard binds Fastify to `127.0.0.1` and gates every mutating endpoint
with an `isLocal` check on the TCP source address. That defends against
remote attackers, but it does NOT defend against **a malicious web page open
in the user's browser** calling `fetch("http://localhost:4321/api/pty/inject",
{...})` from JavaScript. The fetch's TCP socket really is local, so the check
passes — and the attacker has executed arbitrary commands in the user's
embedded terminal. The same exposure applies to `/api/agents/run`,
`/api/tasks/toggle`, the WebSocket upgrades, and every other mutating
endpoint we've added.

The standard defense for localhost services with a browser UI is a
three-layer gate: **Origin allow-list + per-process session token +
content-type enforcement**. Jupyter, Streamlit, and most local dev tools use
the same pattern. We need it before shipping the VS Code extension or
Electron shell, because both make the dashboard easier to leave running and
both will inherit whatever access control we put in place.

## What Changes

Introduce request authentication with three composable layers:

1. **Session token**: on each server startup, generate a 32-byte hex token.
   Print it once at startup and include it in the launch URL
   (`http://localhost:4321/?token=...`). The CLI's auto-open flag opens that
   URL. VS Code extension and Electron build the URL the same way.
2. **Origin allow-list**: every mutating endpoint and every WebSocket upgrade
   rejects requests whose `Origin` header is not on the allow-list (the
   server's own `http://localhost:<port>` plus `vscode-webview://*` for the
   extension). Same-origin requests carry the Origin automatically; only
   cross-origin browser requests can be blocked here.
3. **Content-type enforcement**: mutating endpoints with a body require
   `Content-Type: application/json`. This forces browser CSRF attempts into
   a preflight request, which the Origin check then rejects.

The web UI reads `?token=` once on first load, stores it in `sessionStorage`,
and sends it on every API call as `X-Session-Token` and on WebSocket
upgrades as a `?token=` query parameter. GET endpoints that return no
sensitive state (like static asset paths) remain unauthenticated to avoid
breaking the iframe load.

## Capabilities

### New Capabilities
- `csrf-protection`: session-token generation, Origin allow-list, and
  content-type enforcement on mutating endpoints and WebSocket upgrades

### Modified Capabilities
- `dashboard`: the web UI reads the launch-URL token, persists it in
  sessionStorage, and includes it on every API and WebSocket request

## Impact

- `server/index.ts`: new auth middleware run before each mutating route;
  WebSocket upgrade handler checks token; allow-list derived from
  configured port + literal `vscode-webview://*`
- `bin/openspec-ui.js`: prints the URL with the token; auto-open uses it
- `web/src/runtime.ts` (new): reads the token at module load, exposes it
- `web/src/api.ts`: every `fetch` includes `X-Session-Token` and
  `Content-Type: application/json`
- `web/src/store.ts`: WebSocket URLs include `?token=`
- New unit tests for the auth middleware
- The pending `add-vscode-extension` change inherits this — its proposal
  already mentions constructing the webview URL; with this change landed,
  it constructs `?token=` automatically
- No new dependencies (`crypto.randomBytes` from Node standard library)
