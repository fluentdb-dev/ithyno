# Outcome: add-agent-stdin-relay (reverted)

## ✅ Worked

- **`POST /api/agents/jobs/:id/input`** shipped as the smallest
  useful endpoint: `{ data: string, appendNewline?: boolean }`,
  writes verbatim to the PTY, echoes the written bytes into the
  job's ring buffer as `stream: "stdin"` so the transcript stayed
  self-contained for post-hoc review.
- **`AgentRunner.writeInput()`** guarded on job status
  (`running` only; 409 for orphaned / finished) and PTY handle
  presence (500 if missing). Straightforward defensive code.
- **`JobInputField`** on the Agents page + the Claude Code
  keyboard mapping (Enter → `\r`, Up/Down → escape sequences) let
  users answer permission prompts from the dashboard without
  switching to a real terminal. The `Reply with commit/edit/hold`
  interaction became clickable.
- **Auth-gated the endpoint** with the same token / origin checks
  every mutating call uses; no bypass.

## ⚠️ Surprises

- **The "user thinks they're typing at a shell" problem** — the
  agent output view via `add-agent-xterm-output` looked
  interactive because xterm.js was live-rendering. This endpoint
  solved the "how does input get there" mechanic but left the
  UX ambiguity about *whose* prompt the user was answering
  (agent's Claude, or their own).
- **Multi-line input via `data:` string** required the client to
  join lines with `\n` and send `appendNewline: false` — a hidden
  contract that wasn't obvious from the endpoint shape. Would
  have needed a separate `data: string[]` or a Markdown-ish
  content-type to be robust.
- **`--dangerously-skip-permissions`** was the recommended escape
  hatch for users who didn't want any prompts at all, which
  telegraphed that the whole stdin-relay was papering over a
  design mismatch: agents that ask questions are hard to
  automate; agents that don't (via `-p`) are easy.

**Reverted by [`revert-agent-pty-layers`](../archive/2026-07-04-revert-agent-pty-layers/).**
`-p` mode agents don't prompt, so there's no relay needed. The
`POST /api/agents/jobs/:id/input` endpoint, `writeInput()` method,
JobInputField, and `stream: "stdin"` transcript variant are all
removed. If a future agent CLI genuinely needs interactive input,
that's a separate design conversation from a clean slate.
