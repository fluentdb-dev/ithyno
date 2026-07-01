## ✅ What worked
- **`@homebridge/node-pty-prebuilt-multiarch`** delivered: prebuilt for macOS / Linux out of the box, no Visual Studio Build Tools required at install. The "Windows might need to rebuild" risk turned out academic on the dev box.
- **Lazy load + graceful degradation**: wrapping `import("@homebridge/node-pty-prebuilt-multiarch")` in a try/catch and surfacing availability via `/api/health` meant the dashboard kept booting even on systems without a PTY backend.
- **Dedicated `/pty` WebSocket** kept terminal bytes off the structured `/ws` channel. Two-channel design avoided any framing dance.
- **Echo suppression via hash recording** worked unchanged for the second watcher introduced later (docs/), proving the abstraction was right-sized.

## ⚠️ What surprised us
- The terminal was mounted *inside* ChangeDetail — meaning every page navigation killed the shell. This shipped to the user and immediately bit us. See `persist-terminal-session` for the fix.
- AI streaming writes (Claude Code) take many seconds; chokidar's `awaitWriteFinish` makes the dashboard look frozen during that window. Surfaced as the seed for `add-writing-status`.

## 🔁 What we'd do differently
- Specify session persistence and the singleton mount location in the original proposal. Two essentially separate properties — "terminal exists" and "terminal session is durable" — got conflated.
- Add a CRLF / `\r` vs `\n` line-ending note to the design from the start; we re-derived which character to send during verification.

## 🌱 Follow-ups
- `persist-terminal-session` (already shipped).
- `add-writing-status` (queued) for the AI-streaming UX.
- `add-ui-orchestration` (already shipped) emerged from the realization that a real terminal lets us drive `/opsx:*` without owning an LLM in the dashboard.
