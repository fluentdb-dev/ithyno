## Context

`add-agent-pty-runner` gives the agent a real PTY, so the byte stream
that lands in the runner's ring buffer includes SGR, cursor motion,
mode-set / mode-reset sequences, and full-screen cursor addressing.
A `<pre>` displays those bytes literally. The result is unreadable.

Two ways to make it readable:

1. **Strip ANSI in the browser** — regex out `\x1b[...` codes at
   render time.
2. **Emulate the terminal in the browser** — run xterm.js over the
   byte stream so cursor motion, in-place redraws, and colors resolve
   the same way they would in a real terminal.

We pick (2). We already ship xterm.js for the embedded terminal panel;
we know it renders these agents correctly (that's exactly what the
embedded terminal does when the user types `claude` in it manually).
Reusing it here is the small change with the correct answer.

## Goals / Non-Goals

**Goals:**
- Agent output renders as it would in a real terminal (colors, cursor,
  spinners, in-place status lines).
- Historical output loads on view-open; live output streams in without
  a full replay.
- User input is interactive — arrow keys, Enter, Tab, Ctrl-C, all the
  usual terminal semantics work. This is required for Claude Code's
  permission prompts (up/down + Enter to pick an option) and equivalent
  UIs in Aider / Codex.
- Zero new dependencies.

**Non-Goals:**
- Search / find UI (`@xterm/addon-search` is available if we want it
  later).
- Resize plumbing back to the PTY. The PTY size is fixed at 200×50 in
  `add-agent-pty-runner`; the browser terminal only displays.
- Per-agent WebSocket for input. HTTP POST per keystroke is fine at
  local-host latency.
- Persisting terminal state across page reloads (re-seed from the
  ring buffer instead).
- Tests. xterm-inside-jsdom is fragile and low-value.

## Decisions

### Interactive xterm

xterm.js is initialized in interactive mode. Keystroke bytes are
captured via `term.onData(data => ...)` and forwarded to the server via
the existing `POST /api/agents/jobs/:id/input` with
`appendNewline: false` (xterm sends the correct terminal bytes
directly — `\r` for Enter, `\x1b[A` for up-arrow, etc., so we do not
want the server to append anything).

Trade-off vs. a WebSocket keystroke transport:

- **HTTP POST per keystroke**: simple, reuses the existing auth +
  CSRF + local-only gate, and adds no new WS. At localhost latency
  this is fine (sub-millisecond); a paste is one HTTP call regardless
  of length because xterm delivers pasted text as one `onData`
  event.
- **WS**: lower per-byte overhead but requires a new WS handshake,
  auth relay, and cross-tab race semantics. Skipped for v1; we can
  upgrade later if measurements say we need to.

The separate input field from `add-agent-stdin-relay` is removed for
the Agents page. Its role was to let users answer prompts before we
had a real terminal; with the terminal in place, that role becomes
redundant (line editing + Enter is what xterm gives us) and confusing
(two input paths that behave differently, e.g. one can send arrow
keys and the other can't).

### Seed from ring buffer

On mount, fetch the job via `fetchAgentJob(jobId)` (already
implemented). Write each ring-buffer chunk to the terminal in order
before subscribing to live updates. Then subscribe to
`jobOutputs[jobId]` in the store and write only the delta as new
chunks arrive.

The delta bookkeeping is a single counter: `lastWrittenLen`. When
`jobOutputs[jobId].length > lastWrittenLen`, write the new entries and
bump the counter. Handles reconnects (WS resubscribe re-uses the same
counter) and page-away/come-back (component unmount cleans up; next
mount re-seeds from ring buffer).

### Fit-to-container

Use `@xterm/addon-fit` (already installed) to size the terminal to the
container on mount and on container resize (via `ResizeObserver`).
Container is CSS-height'd to ~40 rows. Users can tune by inspecting the
CSS; no in-UI resize handle.

### stdin echoes render the same as stdout

`add-agent-stdin-relay` pushes user input into the ring buffer as
`stream: "stdin"` entries. Under xterm, we just write them as-is — the
echo appears inline with agent output, exactly as it would if the
user had typed into a real terminal. No special styling; the intent
(consistency with what a terminal shows) matters more than visually
distinguishing them.

There is one subtle point: xterm's local echo is normally disabled
when the child process handles echo itself (which most REPLs do). We
leave xterm's default alone (no local echo, no line-mode processing).
Every keystroke goes to the server, the PTY handles line discipline,
the child's echo comes back through the normal output stream. This is
exactly how a real terminal-connected shell works.

### No terminal-level scrollback beyond the ring buffer

xterm's default scrollback is 1000 lines; we bump to 10_000 to match
the server's `RING_LIMIT`. If the ring evicts old entries, they're
gone; the terminal doesn't try to hold them either.

### Component boundary

New component `web/src/components/AgentOutputView.tsx`. All xterm
lifecycle (create Terminal, attach fit addon, mount into ref'd div,
write seed data, subscribe to store, dispose on unmount) lives inside.
`Agents.tsx` just mounts `<AgentOutputView jobId />` where it used to
mount `<JobOutput jobId />`.

### Handle out-of-order chunks?

No — the store already appends in arrival order, and the server emits
in write order. If a WS message is dropped, the resubscribe pattern
in `add-agent-stdin-relay` doesn't try to recover missed bytes; a page
reload re-seeds from the ring buffer, which is authoritative.

## Alternatives considered

- **ANSI-strip at render** — works for pure log output, breaks on
  cursor motion. Would look nearly as bad as the current state for
  Claude Code's rich REPL.
- **`ansi-to-html`-style converter** — decent for colors, doesn't
  handle cursor motion or in-place updates. Would also add a dep for
  a partial solution when we already have the full solution installed.
- **Read-only xterm + input textarea** — considered and rejected: a
  textarea can't send arrow keys or Tab, which Claude Code's option
  selectors and Aider's confirm dialogs require. The interactive
  terminal is the only single-input path that covers everything.
- **Adding "arrow key buttons" to the input UI** — reintroduces the
  read-only-plus-buttons approach; ugly and incomplete
  (Ctrl-key combos, Home, End, arrow chords all need mapping).
- **Server-side terminal emulation, ship rendered text to the
  browser** — moves the CPU cost to the server for no functional gain;
  xterm.js in the browser handles it fine.

## Risks

- **xterm.js SSR / no-DOM contexts** — the component mounts in a
  browser only; no server-render concern.
- **`fit` addon requires the container to have measurable size at
  mount time.** If the job row is closed (accordion collapsed), the
  container is 0×0; we defer the fit call to the next
  `requestAnimationFrame` after the row expands. If the row is
  reopened, the component unmounts and remounts naturally.
- **High-volume output** — spinners at 60fps can produce many chunks
  per second. `term.write` is fast enough (measured by the embedded
  terminal usage); if it becomes a problem we buffer per-frame in a
  follow-up.
- **Bundle size** — no change; xterm is already loaded for the
  embedded terminal.
