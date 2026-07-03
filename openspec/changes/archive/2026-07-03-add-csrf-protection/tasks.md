## 1. Server: token generation
- [x] 1.1 Generate `SESSION_TOKEN = randomBytes(32).toString("hex")` once at server module load
- [x] 1.2 Export the token (for tests) plus a `verifyToken(supplied)` constant-time comparison
- [x] 1.3 Print the launch URL `http://localhost:<port>/?token=<token>` to stdout on listen

## 2. Server: middleware
- [x] 2.1 Origin allow-list builder: exact-match for `http://localhost:<port>` / `http://127.0.0.1:<port>` / `http://[::1]:<port>`, prefix-match for `vscode-webview://`
- [x] 2.2 `requireAuth` Fastify hook: checks token (header or query), Origin (when present), content-type (when body); returns 401/403/415 as appropriate
- [x] 2.3 Apply `requireAuth` to every POST / PATCH / PUT / DELETE route already in the server (toggle, inject, agent run / cancel, future routes)
- [x] 2.4 Leave GET routes unprotected

## 3. Server: WebSocket upgrade gate
- [x] 3.1 In the upgrade handler, parse `?token=` from the request URL
- [x] 3.2 Verify token, Origin (when present); destroy the socket on failure
- [x] 3.3 Apply to both `/ws` and `/pty`

## 4. CLI: print and open launch URL
- [x] 4.1 `bin/openspec-ui.js`: read the launch URL from the server (it prints it already); when `OPENSPEC_OPEN=1`, open the URL with token
- [x] 4.2 Document that operators who pipe the server through tools should preserve stdout so the URL/token is visible

## 5. Web: token bootstrap
- [x] 5.1 New `web/src/runtime.ts` reads `?token=` on module load, writes to `sessionStorage`, calls `history.replaceState` to drop the token from the URL
- [x] 5.2 Export `getSessionToken(): string | null` for the API + store
- [x] 5.3 If no token and no stored token: surface the "Session expired" banner state

## 6. Web: api.ts and store.ts
- [x] 6.1 `api.ts`: all fetch calls include `X-Session-Token` and `Content-Type: application/json`
- [x] 6.2 `api.ts`: on 401/403 with auth reason, throw a typed error the App can catch
- [x] 6.3 `store.ts`: WS URL includes `?token=`
- [x] 6.4 App-level banner component for the session-expired state

## 7. Tests
- [x] 7.1 Unit test for `verifyToken` constant-time comparison
- [x] 7.2 Unit test for the Origin allow-list (literal vs prefix)
- [x] 7.3 Unit test for content-type check
- [x] 7.4 Integration test: protected endpoint without token returns 401; with valid token returns 2xx

## 8. Docs
- [x] 8.1 README: short security note explaining the token + Origin model
- [x] 8.2 `docs/migration-guide.md`: mention that pinning a launch URL is now required for bookmarking

## 9. Verification
- [x] 9.1 Browse `http://localhost:<port>/` without `?token=` and see the session-expired banner
- [x] 9.2 Open the launch URL printed by the server and verify the kanban loads
- [x] 9.3 In another browser tab, run `fetch("http://localhost:<port>/api/pty/inject", { method: "POST", body: '{"data":"x"}' })` and verify it fails with 403 (Origin) or 401 (no token)
- [x] 9.4 Server restart: existing tabs hit 401 on next mutating action and show the banner
- [x] 9.5 VS Code extension (when implemented) constructs the URL with the token and works without modification
