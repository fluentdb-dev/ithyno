## Context

The dashboard currently registers both `window.focus` and `visibilitychange` listeners as session-recovery triggers. Every trigger performs `checkAuth()`, reconnects the WebSocket, and calls the full workspace `load()` even when the existing connection is healthy. A later guard attempted to keep routes mounted during that load, but it does not remove the unconditional refresh and cannot protect state when a shell reload or webview recreation occurs.

The VS Code extension adds another boundary: the React dashboard runs in a localhost iframe inside a VS Code webview. The iframe declares clipboard permissions, but there is no Extension Host fallback when native paste is not delivered through the nested webview.

## Goals / Non-Goals

**Goals:**

- Make an ordinary focus or visibility transition a no-op while the dashboard connection is healthy.
- Recover a genuinely disconnected dashboard without discarding route-local UI state.
- Reload a shell only after an explicit authentication rejection, never after an ambiguous network failure.
- Make paste work in focused dashboard text controls inside a packaged VSIX.
- Cover the real recovery and message-routing decisions rather than only testing a loading-flag helper.

**Non-Goals:**

- Persist unfinished dialog forms across an intentional application reload, project switch, or extension restart.
- Change session-token lifetime or server endpoint identity.
- Replace the nested iframe architecture in this change.
- Add a general clipboard history or clipboard synchronization feature.

## Decisions

### 1. Gate recovery on connection state instead of focus alone

Normal `focus` and `visibilitychange` events SHALL not call the full workspace loader while the WebSocket is connected. Recovery runs only when the dashboard is disconnected. The recovery operation remains coalesced so simultaneous browser events cannot create duplicate requests.

This keeps WebSocket-driven state updates authoritative during healthy operation. It is preferred over trying to persist every modal's local state around an unnecessary reload.

### 2. Represent authentication checks as explicit outcomes

The authentication probe will distinguish at least:

- `valid`: the server accepted the token;
- `unauthorized`: the server explicitly returned `401` or `403`;
- `unavailable`: a network exception, timeout, or non-auth server failure occurred.

Only `unauthorized` can initiate shell session reload. `unavailable` leaves the current UI mounted and allows the existing connection/retry behavior to recover later. This avoids treating a suspended or briefly unavailable localhost server as proof that credentials changed.

### 3. Preserve route-local dialog ownership

Dialogs remain owned by their current pages and components. The application shell and active route stay mounted during background recovery, so an open dialog and its controlled form values survive. No global modal store or local-storage persistence is introduced.

### 4. Route VSIX paste through the Extension Host when needed

The iframe and outer webview will use a narrowly scoped request/response message contract for clipboard reads. The Extension Host reads text with `vscode.env.clipboard.readText()` and returns it to the requesting dashboard. The dashboard inserts the response into the focused `input` or `textarea`, respecting the current selection and dispatching the input event required by controlled React fields.

The bridge is enabled only in the VS Code shell. Browser and Electron inputs keep native paste behavior. Requests carry an identifier, and responses are accepted only for a pending request, preventing unrelated messages from modifying fields.

### 5. Test observable decisions and generated webview wiring

Pure recovery-decision and authentication-result helpers will receive unit tests. Webview HTML and Extension Host routing will be tested for the clipboard message contract. A UI-level regression test will verify that a dialog remains mounted and retains typed text when healthy focus recovery is requested.

## Risks / Trade-offs

- **A connection flag can be briefly stale after wake-up.** → WebSocket close/error handlers remain responsible for marking the connection offline; visibility recovery runs when that state is false.
- **A paste shortcut could insert text twice where native paste already works.** → The VS Code-specific bridge owns the handled shortcut and suppresses the native path only after confirming that it is using the bridge; non-VS Code shells are untouched.
- **The focused element can change before an asynchronous clipboard response arrives.** → Associate the request with the original editable element and ignore the response if that element is no longer connected or the request is no longer current.
- **A genuine token change may not reload on a network error.** → An explicit later `401`/`403`, authenticated API failure, or WebSocket auth rejection still invokes session recovery.

## Migration Plan

No data migration is required. Ship the updated web bundle and VS Code extension together. Rollback consists of reverting the recovery gate and clipboard bridge; no persisted schema changes are involved.

## Open Questions

None.
