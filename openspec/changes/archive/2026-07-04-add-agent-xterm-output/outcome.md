# Outcome: add-agent-xterm-output (reverted)

## ✅ Worked

- **`<AgentOutputView jobId />` mounted an `xterm.js` instance** on
  the Agents page, wrote each `agent-job-output` WS chunk into it
  via `term.write()`, and got Claude Code / Aider / Codex's
  colored output, spinners, and in-place status lines rendering
  correctly. The "same prompt appearing four times" phenomenon
  (Claude drawing its status line in place, our append-only ring
  buffer accumulating every draw) went away.
- **The store-subscribe pattern** (`useStore.subscribe(...)` with
  a closure over `lastWrittenLen`) turned out to be simpler than
  reading `jobOutputs[jobId]` via a React selector. React 19
  StrictMode's mount-cleanup-mount cycle didn't confuse it because
  each mount seeded from the current snapshot and subscribed
  scoped to itself.
- **Xterm.js `FitAddon` handled panel resizes** without extra
  code. Reused the same font family / theme / scrollback config
  the embedded ChangeDetail terminal was already using — one
  place to tune both.

## ⚠️ Surprises

- **Interactive input via `term.onData(...)`** worked (keystrokes
  went straight to the server → PTY), but it created a new
  problem: the user could type into what looked like an
  interactive session but was really an agent running under a
  fresh Claude Code REPL. Prompt suggestions ("Reply with
  commit/edit/hold") looked like they were addressed to the user
  when they weren't. Solved (badly) by `add-agent-stdin-relay`,
  which formalized the "user answering the agent's prompt" flow.
- **The xterm.js dependency footprint is large** (~500KB minified).
  For an agent output view we only really needed color rendering
  + scrolling — cursor motion / mouse tracking / bell handling
  were all overkill.
- **Two competing xterm.js instances on the same page** (embedded
  terminal + agent output) increased memory + re-render cost.
  Fine on desktop hardware but visible in DevTools.

**Reverted by [`revert-agent-pty-layers`](../archive/2026-07-04-revert-agent-pty-layers/).**
With Claude Code running under `-p` mode piped stdio, agent
output is plain lines (no cursor motion, no spinners). A
scrolling `<pre>` with inline SGR-to-span conversion covers the
remaining need (color) at ~30 LOC instead of a full terminal
emulator. See the reverting change's proposal for the
`ansi-to-html` approach.
