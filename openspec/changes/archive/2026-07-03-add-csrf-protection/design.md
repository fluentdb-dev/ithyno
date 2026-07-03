## Context

`isLocal` only inspects the TCP socket's remote address. A browser tab on
the same machine satisfies that check trivially while running JavaScript
from any origin. The result is a textbook CSRF surface: every mutating
endpoint we've added — pty inject, task toggle, agent run / cancel,
worktree management via inject — is reachable from any malicious page the
user happens to have open.

The dashboard's UX is built on "the user is the only operator, on this
machine, in this process." Request authentication needs to make that
posture explicit in code while staying invisible to legitimate flows.

## Goals / Non-Goals

**Goals:**
- A malicious cross-origin page cannot perform any mutating action.
- Same-origin UI calls (browser tab, VS Code webview, Electron window) work
  without per-action user interaction.
- The defense survives a server restart cleanly: a stale browser tab gets
  a clear error and reloads.
- New `add-vscode-extension` and the planned Electron shell adopt the
  defense by URL construction only — no protocol divergence.

**Non-Goals:**
- User accounts, password login, or any multi-user concept. The dashboard
  is single-user.
- Encryption of the localhost traffic. The defense is about access
  control, not confidentiality.
- Defending against malicious code already running in the same machine
  with the same UID as the user. That attacker can read the token from
  process memory; nothing we do at the HTTP layer changes that.
- Defending against DNS rebinding more aggressively than what the Origin
  check already covers — modern browsers ship rebinding mitigations,
  and the token gives us an additional layer if those fail.
- Per-request CSRF tokens (double-submit cookie pattern). A
  per-process session token is sufficient for a single-user local tool.

## Decisions

### Token shape and lifetime

- Generated once per server process: `randomBytes(32).toString("hex")`
  (64-char hex).
- Lives in memory only. No persistence. A restart forces a new token,
  which is good — stale tabs lose access and must reload.
- Printed to stdout on startup as part of the launch URL.

### Token transport

- **First load**: token is in the query string,
  `http://localhost:<port>/?token=<token>`.
- **Web UI**: at module load, `web/src/runtime.ts` reads `?token=`,
  stashes it in `sessionStorage`, and rewrites the URL to drop the token
  via `history.replaceState` so it does not linger in the address bar.
- **Subsequent fetches**: header `X-Session-Token: <token>`.
- **WebSocket**: query parameter `?token=<token>` on the upgrade
  request. WS does not allow custom headers from browser clients, so a
  query is the standard pattern. Sub-protocol negotiation would work too
  but is more code.

### Origin allow-list

Built at startup from the listening port and a small literal list:

```
http://localhost:<port>
http://127.0.0.1:<port>
http://[::1]:<port>
vscode-webview://<id>          (suffix matched on prefix)
null                            (Electron renderer at startup; see below)
```

Origin matching is a prefix check for `vscode-webview://` (the suffix is
the editor's per-session UUID we cannot pre-compute) and exact-string match
for the rest. Requests with no Origin header are treated as same-origin
**only if** they carry a valid token; this admits CLI scripts and `curl`
testing but does not weaken the browser-attack defense (a malicious page
cannot omit Origin from a fetch).

Electron's `BrowserWindow` loading `http://localhost:<port>` gets the
standard localhost Origin; the `null` entry covers
`file://`-style loads which Electron does not use in our planned shell, but
is documented for safety.

### Content-type enforcement

Mutating routes (POST / PATCH / PUT / DELETE) reject anything other than
`Content-Type: application/json` with a 415. This converts every legitimate
browser request into a CORS preflight (a "non-simple" request), which the
Origin check then handles.

### What's protected and what isn't

| route | protected |
|---|---|
| `GET /api/state`, `/api/docs`, `/api/tags*`, `/api/changes/*` | unprotected (no side effects, no secrets) |
| `GET /api/health` | unprotected |
| `POST /api/tasks/toggle` | protected |
| `POST /api/pty/inject` | protected |
| `POST /api/agents/run`, `/api/agents/jobs/:id/cancel` | protected |
| WebSocket `/ws`, `/pty` | protected (token query) |
| Static assets / iframe HTML | unprotected (no token check) |

GET endpoints stay open because (a) they expose information that is also
readable from any local file/process and (b) requiring tokens on GETs
would break the iframe loading pattern of the VS Code webview without
adding meaningful safety. If a future GET starts returning secrets, it
moves to the protected list.

### Error responses

- Missing token on a protected route: `401 { error: "auth required" }`.
- Wrong token: `403 { error: "auth invalid" }`.
- Wrong Origin: `403 { error: "origin not allowed" }`.
- Wrong content-type: `415 { error: "content-type must be application/json" }`.

The web UI translates 401/403 into a single full-page banner: "Session
expired — reload the dashboard to continue." The launch URL with the
fresh token is the recovery path.

### Backward compatibility

This change is breaking for any current caller of mutating endpoints (CLI
scripts, manual `curl`). None ship with the dashboard. The change is
explicitly accepted as a hard cut: ad-hoc callers must read the token from
the server's startup output.

## Risks / Trade-offs

- **Stale tabs after restart.** Every restart invalidates outstanding
  tokens. Mitigation: clear error banner with a reload prompt. Acceptable
  for a tool whose target user controls the server.
- **Token in URL query.** Tokens in the URL can leak via referrer headers
  or browser history. Mitigation: `history.replaceState` drops the token
  from the visible URL immediately on load; same-origin context never
  sends Referer cross-origin; the dashboard never links out to third
  parties. Acceptable.
- **WS query-param tokens leak into server access logs.** We do not log
  request URLs by default, but operators using Fastify's request log
  would. Document this; offer no logging or a redacting logger as a
  future improvement.
- **Origin spoofing from non-browser clients.** A non-browser attacker
  can fabricate any Origin; the token defends against that case. The
  Origin check is specifically against browser-based CSRF where the
  attacker cannot control headers.
- **The token is in memory.** Any process with the same UID can read it.
  This is the unavoidable threat model of a single-user local tool and
  is accepted explicitly under Non-Goals.
