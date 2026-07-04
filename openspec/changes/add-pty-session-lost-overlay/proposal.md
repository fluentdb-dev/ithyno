---
tags: [feature/terminal, screen/change-detail, area/web]
---

## Why

The embedded terminal's WebSocket to `/pty` silently drops when the
server restarts (every `server/*.ts` edit under `dev`, every reload,
every `add-agent-runner` iteration). Xterm.js keeps rendering the last
frame it saw, users type into what looks like a live prompt, and no
keystroke ever reaches a shell. The confusion is immediate — several
sessions of dogfooding hit this. Silent failure is the worst mode.

The dashboard already has an `AuthExpiredError` banner for stale
tokens; the PTY WS just needs an analogous "connection lost" surface.

## What Changes

- **Terminal WS close detection.** The client already opens `/pty` via
  a dedicated WebSocket. Add an `onclose` / `onerror` handler that
  flips a per-terminal `disconnected` state.
- **Overlay in the xterm container.** When `disconnected` is true,
  render an absolutely-positioned overlay on top of the xterm view:
  a dimmed backdrop, "Terminal session ended — reload to reconnect."
  message, and a `Reload terminal` button. The button re-fires the
  original WS connect logic (same URL, same token).
- **Reload behavior.** Clicking `Reload terminal` disposes the current
  xterm instance, opens a new PTY WS, and mounts a fresh xterm. This
  is deliberately more aggressive than trying to reconnect the same
  xterm — a fresh shell is the honest state after the server restart.
- **No auto-reconnect.** Rejected as noisier than the disconnect
  itself — a background reconnect that races the user's next
  keystroke can produce phantom input. The one-click reload is the
  explicit gesture.

## Capabilities

### Modified Capabilities

- `dashboard`: the embedded terminal surfaces WS closure explicitly
  and offers a manual reconnect gesture, matching the
  auth-expired-banner pattern already used for HTTP requests.

## Impact

- `web/src/components/Terminal.tsx` (or wherever the PTY WS is
  opened): capture close/error, flip local state
- New overlay markup + CSS on the terminal container
- Small handler to dispose + re-init on reload click

## Out of scope

- **Server-side PTY reattach** to preserve scrollback across
  restart. The current `/pty` endpoint spawns a fresh shell on each
  connect; buffering + resume is a much larger design.
- **Auto-reconnect polling.** Would race user input; skipped.
- **Distinguishing "server restart" from "PTY child exited"**. Both
  end at the same overlay because the user's next action is the
  same either way.
