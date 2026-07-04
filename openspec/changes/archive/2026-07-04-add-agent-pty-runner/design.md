## Context

We chose piped stdio in `add-agent-runner` because it gave us clean
stdout/stderr streams and made the runner testable without native
modules. That decision costs us more than it saves once the agents in
scope are all TTY-detecting:

- Claude Code refuses to enter interactive REPL under piped stdin.
- Aider drops to non-interactive mode with a warning.
- Codex, Cline, and the general population of coding CLIs behave
  similarly.

`add-agent-initial-input` proved that the runner can hand the CLI a
prompt correctly. The prompt reaches stdin; the CLI just doesn't do
anything with it because it thinks there's no user attached.

PTY solves this at the layer where the CLIs are actually making their
decision: **does the process have a controlling terminal?** With
`node-pty`, the answer is yes.

We already ship `@homebridge/node-pty-prebuilt-multiarch` for the
embedded xterm.js terminal. Adding a second use is free.

## Goals / Non-Goals

**Goals:**
- Spawn agents so TTY-detecting CLIs enter their interactive modes.
- Preserve the existing job lifecycle: start → run → output stream →
  exit → merge/discard.
- Keep `add-agent-stdin-relay` and `add-agent-initial-input` working
  unchanged from the callers' point of view (writeInput continues to
  push a `[stdin]` line into the transcript; initial prompt still
  arrives at spawn time).
- Fixed-size pty; no per-client resize plumbing.

**Non-Goals:**
- Live per-agent terminal in the browser. That's the embedded
  terminal's job (a separate WS protocol).
- Rich full-screen TUI rendering (textual, blessed). We render text +
  common ANSI colors; anything fancier is future work.
- Retaining stdout/stderr separation. Pty merges them; that's a
  first-class consequence of the choice.
- Windows validation this cycle.

## Decisions

### Reuse `loadPty()` from `server/sync/pty.ts`

Rather than importing `@homebridge/node-pty-prebuilt-multiarch`
directly, use the existing lazy loader that already handles the
"native module failed to build" fallback. Two consequences:

- One place to catch pty-availability failures; one place to log.
- If the pty module is unavailable (rare — e.g. locked-down CI), the
  agent runner reports a clear error via the existing runner error
  path (`{ ok: false, status: 500, reason: "pty unavailable" }`) and
  the Kanban Start action surfaces it.

### PTY size: 200 x 50, fixed

Rationale:
- 200 columns fits Claude Code's default help / progress lines without
  wrapping (Claude wraps at column boundaries; 80 would be cramped and
  make output look worse in the Agents page).
- 50 rows is enough that CLIs that assume "at least a screenful"
  don't panic; 24 (the classic default) is fine but 50 gives us
  headroom for spinner/progress redraws.
- Fixed because there is no live viewer. The Agents page reads the
  ring buffer; no back-pressure from a scroll region.

### Output stream: everything as `"stdout"`

The IPty emits one merged stream. We keep the `OutputLine.stream`
union as-is (still allows `"stderr"` and `"stdin"`) for two reasons:

1. `"stdin"` lines still make sense — we push them explicitly in
   `writeInput` and `initialInput`. Nothing changes there.
2. If we ever wrap a child in `bash -c 'cmd 2> /tmp/errfile; cat …'`
   or introduce a non-pty runner for a specific tool, the schema
   stays capable.

For the pty path itself, chunks become `stream: "stdout"`. The
`"stderr"` handler on the child_process API goes away; the runner
loses no capability that pty actually gives us.

### `writeInput`: `\n` becomes `\r`

A terminal sends a carriage return when the user presses Enter, not a
newline. Terminals and their line disciplines translate `\r` to
`\n` in cooked mode, so `\r` is the correct byte to inject.
`writeInput`'s `appendNewline` toggle stays; when true, we append
`\r` instead of `\n`.

### `initialInput`: same `\r` treatment

Consistent with the `writeInput` change. Users who explicitly embed a
final `\n` in their `initialInput` still work — we already only append
when the string doesn't end with a newline; extend the check to
recognize `\r` too.

### Kill semantics

`pty.kill('SIGTERM')` sends the signal to the pty's foreground process
group. That matches `child.kill('SIGTERM')` for practical purposes
(non-shell-wrapper agents). Explicit test in the runner-test suite
that a running job transitions to `cancelled` when `cancel()` is
called.

`shutdown()` iterates and kills identically.

### Exit code + signal

`term.onExit({ exitCode, signal })` maps to the existing
`finish(status, code)`. Exit code semantics unchanged; the `signal`
field lets us tell `cancelled` (SIGTERM) apart from `crashed` (non-zero
exit without a signal), same as the child_process version does today.

### ANSI in the ring buffer

Store the raw bytes. Rendering strips or interprets them at display
time. This keeps the buffer authoritative and lets us change the
display layer later without a data migration.

## Alternatives considered

- **Keep `child_process.spawn`, tell users to always use YOLO flags.**
  Rejected: worked around one symptom (permission prompts) but does
  not fix the TTY detection that breaks REPL entry entirely.
- **Fake a TTY via `unbuffer` / `script` / `stdbuf`.** Rejected: works
  on Linux, brittle on macOS, unavailable on Windows, and requires an
  external binary in the user's PATH.
- **Spawn each agent in a separate WS-attached PTY, reusing the
  embedded-terminal plumbing verbatim.** Rejected for v1: doubles the
  WS surface, needs a live-viewer UI decision, adds cross-tab race
  edges. The Agents page already gives us "read the transcript later"
  UX; the pty here is for the CLI's benefit, not the user's.
- **Use `pty.js` / `node-pty-prebuilt`.** We already use
  `@homebridge/node-pty-prebuilt-multiarch`; no reason to introduce
  a second native binding.

## Risks

- **Native module install pain.** Not a new risk — the embedded
  terminal already surfaces it, and the same `loadPty` fallback covers
  the agent runner path. If pty is unavailable, we fail Start cleanly
  with a message.
- **Output volume.** Pty merges progress redraws and cursor motion
  into the ring buffer. Ring size cap (`RING_LIMIT` in runner.ts) still
  applies; noisy agents may see their earliest output evicted sooner.
  Acceptable; the interesting output for Merge review is the final
  diff, not the spinner history.
- **Test refactor.** `runner-input.test.ts` uses a fake writable; the
  fake needs to grow `onData` / `onExit` / `kill` no-ops. Small,
  contained, doesn't leak into other tests.
- **CLI-specific quirks.** A tool that draws differently under pty
  vs. pipe may need agents.yaml tweaks (fewer args, different flags).
  Documented in the release note for this change.
