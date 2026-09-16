---
tags: [feature/terminal, screen/change-detail, area/web]
---

## Why

The embedded terminal now keeps the PTY alive across transient socket drops and reattaches automatically, but a true session-loss state still needs a clear intervention. A silent hang is especially confusing when the browser tab stayed open and the shell never reappears. The UI should distinguish recoverable reconnects from a dead PTY / dead server session without regressing the persistent reattach flow.

## What Changes

- **Recoverable disconnects stay quiet.** A transient `/pty` close while a reconnect is already in flight does not render the lost-session overlay. The terminal keeps showing the reconnect status in-place and proceeds with automatic reattachment.
- **Session-lost overlay only after failure.** When a reconnect does not succeed within a bounded timeout, the PTY has exited, or the server-side session is no longer recoverable, the terminal renders a clear overlay with the message "Terminal session ended — reload to reconnect." and a "Reload terminal" button.
- **Explicit reload creates a fresh PTY.** The reload gesture bumps the terminal restart counter so the underlying `/pty` connection reopens with a new session identity and a fresh shell.
- **No overlay on normal cleanup.** Component unmounts and deliberate shutdowns remain silent and do not surface the lost-session surface.

## Capabilities

### Modified Capabilities

- `dashboard`: the embedded terminal distinguishes transient reconnection from an irrecoverable PTY/server session and offers an explicit manual reload as the fail-safe path.

## Impact

- `web/src/components/Terminal.tsx`: track reconnect state separately from a definitive session-lost condition
- `web/src/styles.css`: overlay + failure states for the terminal container
- `openspec/changes/add-pty-session-lost-overlay/specs/dashboard/spec.md`: align the requirement with automatic reattachment semantics

## Out of scope

- **Persisting PTY state across a full server process restart.** This remains a separate design problem from session-lost UX.
- **Silent auto-reconnect on a fully dead PTY.** The dashboard explicitly escalates to the overlay only after the reconnect window expires.
