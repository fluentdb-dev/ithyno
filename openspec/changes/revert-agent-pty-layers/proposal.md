---
tags: [feature/agents, area/server, area/web]
---

## Why

`add-agent-runner` shipped with `child_process.spawn` + piped stdio and
immediately hit the problem that Claude Code (and Aider, Codex, Cline,
gemini-cli, …) refuse to enter their interactive REPL without a real
TTY. Three layered follow-ups tried to fix that from the *inside* of
the interactive mode:

1. **`add-agent-pty-runner`** — replace piped stdio with `node-pty`
   so Claude sees a TTY and starts its REPL.
2. **`add-agent-xterm-output`** — pipe the PTY's byte stream into an
   `xterm.js` `<AgentOutputView jobId />` on the Agents page so the
   ANSI escapes / cursor motion / spinners actually render right.
3. **`add-agent-stdin-relay`** — add `POST /api/agents/jobs/:id/input`
   + a Job Input field so the user can answer Claude's permission
   prompts from the dashboard.

Each layer was necessary given the previous one. Each also brought
weight: a native `node-pty` dependency (with per-platform prebuilds
that break VSIX / Electron packaging), an xterm.js instance for
job output that duplicates the embedded terminal's setup, and a
whole endpoint + UI for something as basic as "answer y/N."

**Then Claude Code's `-p "<initial input>"` flag turned out to do the
whole job:** it runs Claude in a non-interactive mode where it prints
plain lines to stdout, completes the task, and exits. No TTY required,
no permission prompts (they're pre-approved by the `-p` contract), no
in-place redraws, no readline. All three layers become dead weight.

The `-p` shape also aligns better with the *agent* mental model — we
want a headless subprocess doing a bounded task, not an interactive
REPL a human is co-piloting. `add-agent-runner`'s original piped-stdio
runner is exactly right for that; the PTY chain was solving a problem
we no longer need to solve.

## What Changes

### Server: revert to piped stdio + `-p`

- `server/agents/runner.ts`: remove the `loadPty()` branch and PTY-spawn
  path. Go back to `child_process.spawn(cmd, args, { stdio: ["ignore",
  "pipe", "pipe"] })`. Streams both `stdout` and `stderr` into the job's
  ring buffer via `child.stdout.on("data")` / `child.stderr.on("data")`.
- Remove `AgentRunner.writeInput()` and the `POST
  /api/agents/jobs/:id/input` endpoint (stdin-relay). The `-p` contract
  means the agent never prompts, so no relay is needed.
- `server/agents/registry.ts` (or wherever the agent def is parsed):
  keep `initialInput` as a config field. At spawn time, when
  `initialInput` is set, prepend `-p "$initialInput"` to the resolved
  args (or equivalent per-agent template). This is the migration path
  for existing `agents.yaml` entries without editing them.
- Keep `loadPty()` in `server/sync/pty.ts` unchanged — the *embedded
  terminal* still uses PTY (the user's xterm.js at ChangeDetail is a
  human-facing shell, not an agent). Only the *agent runner's* use of
  PTY is being reverted.

### Client: replace xterm.js AgentOutputView with `<pre>` + ansi-to-html

- Delete `web/src/components/AgentOutputView.tsx` (xterm.js instance
  for job output) and its container.
- Restore a lightweight scrolling `<pre>` element. Because `-p` mode
  doesn't emit cursor motion, an append-only text log renders
  correctly. SGR color codes are preserved by running the text through
  a small `ansi-to-html` helper (existing library or ~30 LOC inline)
  so colored diffs / prompts still look right.
- Delete the Job Input field (stdin-relay) — no server endpoint to
  target.

### Related UX polish (scope-adjacent)

Two small transcript / feedback improvements ride along with this
change — they are trivial in isolation but only make sense once the
PTY layer is gone, so bundling them here keeps the delta coherent:

- **Spawn line echo.** Immediately after `spawnChild`, the runner
  writes one synthetic stdout line `$ <command> <shell-quoted args>`
  into the job's transcript. `-p` mode agents buffer their output
  and flush at the end; without this, the user sees a blank
  transcript for the full run duration and has no proof anything
  was actually launched.
- **Cancelling… button state.** After the user clicks Cancel, the
  button in the Agents page's job row is disabled and its label
  swaps to `Cancelling…` until the WS `agent-job-finished` event
  flips `job.status` off `running` (at which point the button
  unmounts entirely, per its existing guard). `-p` mode agents can
  take a few seconds to react to SIGTERM; without the visible
  transition, the user assumes Cancel did nothing and clicks
  repeatedly.

### `agents.yaml` example

- Update `agents.yaml.example` so the bundled Claude agent uses:
  ```yaml
  - name: claude
    command: claude
    args: ["-p", "$initialInput"]
  ```
  (or documents the pattern), replacing the previous initialInput-into-
  PTY variant.

### Downstream change archives

- `add-agent-pty-runner`, `add-agent-xterm-output`, and
  `add-agent-stdin-relay` are still in `openspec/changes/` (not yet
  archived). Their code is being reverted by this change. Archive
  each with an outcome pointing at THIS change and noting that they
  landed and were reverted; their spec deltas (which added PTY /
  xterm / stdin behavior to the `agent-runner` capability) get
  neutralised by this change's spec delta (see below).

## Capabilities

### Modified Capabilities

- `agent-runner`: MODIFIED — remove PTY-spawn, xterm-render, and
  input-relay requirements added by the three reverted changes;
  restore the piped-stdio runner as the single spawn path; add the
  `initialInput → -p` translation.

## Impact

- `server/agents/runner.ts`: PTY branch removed, `writeInput` removed
- `server/index.ts`: `/api/agents/jobs/:id/input` route removed
- `server/agents/registry.ts` (or equivalent): `-p` composition when
  `initialInput` present
- `web/src/components/AgentOutputView.tsx`: deleted
- `web/src/pages/Agents.tsx` (or wherever job output renders): back to
  `<pre>` + ansi-to-html
- Job Input field: deleted
- `agents.yaml.example`: updated pattern
- `openspec/specs/agent-runner/spec.md`: delta covered by this
  change's spec file

## Out of scope

- **Removing `node-pty` as a dependency.** The embedded terminal
  (user-facing xterm.js at ChangeDetail) still uses PTY, so the
  package stays. VSIX still ships without it (already handled by
  `add-vscode-extension`); Electron / CLI keep it.
- **`server/sync/pty.ts` changes.** Untouched — it powers the
  embedded terminal, which is a separate consumer of PTY from the
  agent runner. The revert is agent-only.
- **Bringing back the pre-PTY output display verbatim.** Instead of
  restoring the exact prior `<pre>` rendering, we add `ansi-to-html`
  so colored output stays readable — a small quality-of-life upgrade
  over the pre-`add-agent-xterm-output` state.
- **Interactive-agent support.** If a future agent CLI genuinely
  needs interactive REPL, that's a separate design conversation and
  a separate change; we do not want to re-add PTY on speculation.
