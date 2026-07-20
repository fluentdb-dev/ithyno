---
verdict: needs-rework
---

# Review: add-terminal-reconnect

## Findings
- [high] electron/src/menu.ts:96 — `CmdOrCtrl+Shift+K` is registered as a global Electron menu accelerator, so the restart fires even when focus is outside the terminal (for example in Settings inputs or elsewhere in the dashboard). That violates the spec’s “shortcut ignored when focus is elsewhere” scenario for the Electron shell.
- [medium] web/src/components/Terminal.tsx:24 — the reconnect button starts in warn mode on every fresh mount because `connected` is initialized to `false` and the warn class is applied whenever `!connected`. The spec only calls for the warn styling after the `/pty` WebSocket has closed, so healthy initial connects are rendered as disconnected until `ws.onopen` arrives.

## Verdict rationale
The overall approach matches the proposal, but the Electron accelerator currently bypasses the required focus scoping and the reconnect button’s disconnected styling is shown during normal initial connection. Those are observable spec mismatches, so this change should be revised before it passes review.
