---
tags: [feature/agent-runner, area/server]
---

## Why

Every modern coding CLI in our target set (Claude Code, Aider, Codex,
Cline, gemini-cli, …) is a **TUI/REPL that assumes a real terminal**.
The agent runner today uses `child_process.spawn` with piped stdio,
which is precisely the environment those tools refuse to run in:

- Claude Code enters REPL mode and detects "no TTY → cannot start
  interactive session"; it reads stdin and then idles forever with 0%
  CPU, producing no output.
- Aider prints a warning and falls back to non-interactive mode, which
  short-circuits multi-turn implementation flows.
- Anything that draws with `readline`, colors, spinners, or full-screen
  is degraded to plain-line output — often losing important structure.

We already ship `node-pty` (via `@homebridge/node-pty-prebuilt-multiarch`)
for the embedded terminal. Reusing it for the agent runner gives the
child a **real PTY**, so the same CLIs that work when you launch them
in a terminal work when we spawn them from the dashboard — no per-CLI
`-p` / `--headless` / `--yes` gymnastics needed just to make them run.

`add-agent-initial-input` already wrote the first prompt to stdin
correctly. It's the wrong channel — the CLI never entered REPL mode to
read it. PTY is the right channel.

## What Changes

- **Agent spawn switches from `child_process.spawn` to
  `node-pty.spawn`.** The child sees `TERM=xterm-256color`, an
  allocated pty pair, and TTY-detecting code paths take their
  interactive branches.
- **stdin writes go through `pty.write`.** `add-agent-stdin-relay`
  (user responses) and `add-agent-initial-input` (opening prompt) both
  reroute onto the pty. Trailing newline is replaced by `\r` (what a
  terminal actually sends when the user presses Enter).
- **Combined output stream.** `node-pty` yields a single stream, so
  stdout and stderr merge in the pty. All output lines land as
  `stream: "stdout"` in the ring buffer; the existing `"stderr"` path
  remains available for edge cases (see design.md).
- **ANSI escape sequences appear in the output.** The Agents page
  parses them for display so colors and formatting render, and the
  ring-buffer copy remains raw for other consumers (diff extraction,
  future export).
- **Termination via `pty.kill('SIGTERM')`** replaces
  `child.kill('SIGTERM')`. The semantics are identical from the
  runner's point of view; shell wrappers and long-lived processes get
  the same signal they would from the parent's Ctrl-C.
- **Resize.** The pty is spawned with a fixed default size
  (`cols: 200, rows: 50`) that comfortably fits Claude Code's
  layout expectations. No per-client dynamic resize — the agent runner
  is not a live-viewer PTY (that is the embedded terminal's job).
- **Existing dependency reuse.** `@homebridge/node-pty-prebuilt-multiarch`
  is already declared for the embedded terminal. No new native module.

## Capabilities

### New Capabilities
<!-- none — modifies existing capability -->

### Modified Capabilities
- `agent-runner`: children spawn in a PTY so TTY-detecting CLIs enter
  their interactive modes; stdin writes and termination go through the
  pty; output merges stdout+stderr into one ANSI-carrying stream

## Impact

- **`server/agents/runner.ts`**:
  - Import `loadPty` from `server/sync/pty.ts` (the existing lazy
    loader) instead of `spawn` from `node:child_process`.
  - Replace `spawn(...)` with `pty.module.spawn(cmd, args, ptyOpts)`.
  - Replace `child.stdout.on('data')` + `child.stderr.on('data')` with
    a single `term.onData(...)` handler that pushes as
    `stream: "stdout"`.
  - Replace `child.stdin.write(...)` (used by `writeInput` and by the
    `initialInput` write) with `term.write(...)`. Change trailing `\n`
    to `\r` for the same reason a terminal does.
  - Replace `child.kill('SIGTERM')` (in `cancel()` and `shutdown()`)
    with `term.kill('SIGTERM')`.
  - Replace `child.on('exit', ...)` with `term.onExit(({ exitCode, signal }) => ...)`.
- **`server/agents/runner.ts` type** — the internal `processes` map
  becomes `Map<string, IPty>` (whatever type the `loadPty` module
  exposes; the wrapper stays untyped to avoid coupling to the native
  binding's typings).
- **`OutputLine.stream`** — no schema change. Existing `"stdout" |
  "stderr" | "stdin"` union still applies; the runner just emits fewer
  `"stderr"` lines now (they merge into `"stdout"` at the pty). Kept
  in the union so any future non-pty producer can still tag `stderr`.
- **`web/src/pages/Agents.tsx`** — small styling change to preserve
  ANSI escapes: wrap output in a container that runs ANSI-to-HTML at
  render time (or keeps them raw and CSS-color-mapped for the common
  sequences). Existing embedded-terminal tooling (`xterm.js`) is a
  separate rendering path and stays untouched.
- **Docs** — `docs/architecture/parallel-shells.md` gains a line
  explaining "agents run in a PTY so TTY-detecting CLIs behave
  interactively."
- **Tests** — the existing `runner-input.test.ts` uses a fake
  writable; adapt to accept a fake IPty with the same shape
  (`.write`, `.onData`, `.onExit`, `.kill`). The core invariants
  (echo into ring buffer, WS emit, error handling on write) are
  unchanged.

## Out of scope

- **Per-agent dynamic resize.** The pty size is fixed; if we ever add
  a "live agent terminal" view that supports resize, that is its own
  change (probably rides on the same WS protocol as the embedded
  terminal).
- **Rich in-browser ANSI rendering** beyond a small color subset.
  Agents that draw full-screen TUI (curses / textual) render as text +
  colors; if we want faithful drawing, we'd host `xterm.js` on the
  Agents page too — separate change.
- **Preserving stdout/stderr as distinct streams.** PTY merges them by
  design. If a future need arises (e.g. filtering stderr for a
  build-agent), the runner can add a wrapping shell command that
  redirects on the child side.
- **Windows.** `node-pty` already supports ConPTY, so the mechanism
  works; verifying on Windows is out of scope for this change (the
  project's primary targets are macOS/Linux).
