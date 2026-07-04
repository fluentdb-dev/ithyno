---
tags: [feature/agent-runner, area/web]
---

## Why

`add-agent-pty-runner` moved agents into a real PTY. Modern coding CLIs
(Claude Code, Aider, Codex) now enter interactive REPL mode as designed.
That's the good news. The bad news is that everything they emit is a
terminal byte stream — SGR color codes, cursor motion (`\x1b[12G`),
`\x1b[?25l` to hide the cursor, `\x1b[K` to erase to end-of-line — and
the Agents page renders those in a plain `<pre>`.

The result is unreadable: escape sequences appear as literal text,
cursor overwrites accumulate in the linear buffer (the "same prompt
appearing four times" phenomenon is Claude drawing its status line
in place, and every draw persists in our append-only ring buffer).

We could strip ANSI at render time, but that only papers over the
harder cases (progress spinners, in-place status lines, colored
diffs). The proper answer is to render the byte stream through an
actual terminal emulator. **We already ship xterm.js** for the
embedded terminal panel — reusing it on the Agents page costs no new
dependency, matches the render fidelity users already trust from the
embedded terminal, and gets colors, cursor motion, and in-place
redraws right.

## What Changes

- **A new `<AgentOutputView jobId />` component** replaces the current
  `<JobOutput jobId />` in `web/src/pages/Agents.tsx`. It mounts an
  xterm.js `Terminal` into a container inside the job row. The
  terminal is **interactive** — user keystrokes (arrow keys, Enter,
  Tab, Ctrl-C, single characters) are captured via `term.onData(...)`
  and forwarded to the agent's PTY. This is required so users can
  navigate arrow-key menus (Claude Code's permission prompts,
  option selectors) that a plain textarea cannot drive.
- **On mount**, the component seeds the terminal from the job's
  historical `output` array (fetched by the existing
  `fetchAgentJob(jobId)` path). It writes each ring-buffer chunk in
  order — `stdout` bytes as-is, `stdin` bytes with a subtle CSS-styled
  wrap so the user can see their own input, `stderr` bytes as-is (rare
  under PTY but still possible from non-PTY producers).
- **As WS events arrive** (`agent-job-output`), the component appends
  chunks to the live terminal via `term.write(chunk)`. The existing
  store already accumulates chunks into `jobOutputs[jobId]`; the
  component subscribes to that slice and writes only the tail delta,
  so no full-replay on every event.
- **Sizing**: the terminal renders inside a fixed-height container
  (~40 rows tall by CSS) with `@xterm/addon-fit` computing cols/rows
  once at mount and on container resize. No per-tab live-terminal
  handshake — we don't need to inform the server; the runner already
  runs its PTY at 200×50 and the front end just reads the bytes that
  land in the ring buffer.
- **The separate input field is removed.** With the terminal
  interactive, the textarea would duplicate what the terminal already
  does (line editing, Enter to submit) while being unable to send
  arrow keys, Tab, or control characters. Users type directly into
  the terminal; long text is handled by the browser's native paste
  (xterm forwards paste as one chunk to the server). The
  `POST /api/agents/jobs/:id/input` endpoint is unchanged — the
  interactive terminal is just a different caller of it, sending
  small `{data, appendNewline: false}` payloads per keystroke or
  paste chunk.
- **The current `<pre>`-based `<JobOutput />` is removed.** No behind-
  the-scenes toggle to fall back to plain-text mode — xterm renders
  plain text fine, and preserving two rendering paths just doubles the
  maintenance surface.

## Capabilities

### New Capabilities
<!-- none — this is a rendering change against existing capabilities -->

### Modified Capabilities
- `dashboard`: agent job output renders through an xterm.js terminal
  instead of a raw `<pre>`; colors, cursor motion, and in-place
  redraws render correctly

## Impact

- **New component** `web/src/components/AgentOutputView.tsx` — mounts
  xterm.js, seeds from ring buffer, streams from store.
- **`web/src/pages/Agents.tsx`** — replace `<JobOutput />` usage with
  the new component; drop both the `JobOutput` function and the
  `JobInputField` component (input flows through the terminal now).
- **`web/src/styles.css`** — a small container class for the terminal
  (fixed height, dark background, matches the embedded terminal's
  look).
- **`web/src/store.ts`** — no changes required. `jobOutputs[jobId]`
  already accumulates in append order.
- **Bundle**: no new dependency. `@xterm/xterm` and `@xterm/addon-fit`
  are already installed for the embedded terminal (`Terminal.tsx`).
- **Docs**: `docs/architecture/parallel-shells.md` grows a sentence
  about the Agents page render path.
- **Tests**: keep out — xterm-inside-jsdom is fragile and low-value.
  The change is heavily visual; verification is a Kanban Start +
  eyeballing the transcript.

## Out of scope

- **Per-agent WS transport for input** — every keystroke goes through
  the existing `POST /api/agents/jobs/:id/input` endpoint (small
  payloads, HTTP/1.1 keep-alive). If typing latency ever becomes a
  problem, we upgrade to a WS in a follow-up.
- **Search / find-in-output** UI inside the terminal. Nice-to-have,
  can layer on later with `@xterm/addon-search`.
- **Terminal resize plumbing back to the PTY**. The server's PTY size
  is fixed (`add-agent-pty-runner`); the browser terminal just
  displays whatever bytes come out.
- **Persisting terminal state across page reloads**. The ring buffer
  is the source of truth; on reload we re-seed from it.
- **Full accessibility (screen reader friendliness) of the terminal**.
  xterm.js has partial support; that's what we ship. Better a11y is a
  separate change.
