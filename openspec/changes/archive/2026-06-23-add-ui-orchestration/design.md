## Context

The embedded terminal already runs Claude Code in the project root, so any
`/opsx:*` slash command typed there works end-to-end. The remaining friction is
that "propose a new change" still requires manual typing inside the terminal.
Closing that gap — without taking on LLM responsibility — only needs a way to
inject text into the live PTY socket from a UI button.

## Goals / Non-Goals

**Goals:**
- One-click `/opsx:propose`, `/opsx:apply`, `/opsx:archive` from the dashboard.
- The injected command appears in the terminal exactly as if the user typed it.
- No LLM in the server; Claude Code in the terminal remains the agent.
- Local-only, identical security posture to the existing /pty socket.

**Non-Goals:**
- A general-purpose remote-execute API.
- Owning the LLM in the dashboard (prior decision; the Agent SDK was rejected).
- Auto-running anything without the user clicking a button.

## Decisions

- **Inject target = active terminal.** The server keeps a small registry of
  open `/pty` sockets and writes to the *most recently active* one (the last
  socket that opened or transmitted). If none is open, the endpoint returns 409
  with a hint instead of writing anywhere.
- **Endpoint shape.** `POST /api/pty/inject { data: string, terminate?: boolean }`.
  Server writes `data` verbatim to the PTY input stream and appends `\n` when
  `terminate` is true (default). No parsing or shell-quoting on the server.
- **Localhost only.** The endpoint rejects non-local clients with 403, mirroring
  the existing `/pty` upgrade rule.
- **UI surfaces.**
  - Overview: "+ New Change" button → modal asking for a short description →
    preview the exact `/opsx:propose "<description>"` line → "Send" injects it.
  - ChangeDetail header: "Apply" and "Archive" buttons → one-tap confirm →
    inject `/opsx:apply <id>` or `/opsx:archive <id>`.
- **Feedback.** The PTY naturally echoes the injected text in the terminal pane.
  The UI also shows a toast "Sent to terminal" on success.
- **Naming derivation.** v1 does NOT derive a kebab-case name in the UI; we let
  `/opsx:propose` (Claude) infer it from the description, matching how the
  built-in slash command already behaves.

## Risks / Trade-offs

- **Silent execution surprise.** A button that runs commands could feel
  surprising. Mitigation: every action shows a preview/confirm with the exact
  injected text before sending; the terminal then shows the result.
- **Multiple terminals.** Several browser tabs could each have an open
  terminal. Mitigation: pick the most recently active socket and label it in
  the confirm dialog so the user knows where it lands.
- **Mid-typing collision.** If the user is in the middle of typing, the
  injected text mixes with theirs. Mitigation: v1 accepts the (rare) overlap;
  users can clear the line with Ctrl-U if it happens.
- **Trust boundary.** The endpoint can run any shell command if exposed.
  Mitigation: localhost-only enforcement and the inject API never bypasses
  the PTY — whatever it writes lands in the user's own terminal, visible.
