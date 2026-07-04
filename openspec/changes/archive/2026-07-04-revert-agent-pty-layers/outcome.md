# Outcome: revert-agent-pty-layers

## ✅ Worked

- **`-p "<initialInput>"` is a clean replacement for the whole PTY
  chain.** Claude Code runs headless, prints plain lines to stdout,
  exits cleanly. No TTY needed, no permission prompts (implicit in
  `-p`), no readline / cursor motion / spinner artifacts. The
  entire motivation for `add-agent-pty-runner` (Claude Code refuses
  to enter REPL without TTY) evaporates when we tell Claude Code
  not to enter REPL in the first place.
- **Piped stdio + `child.stdout.on("data")`** is enough plumbing.
  The runner's `Job.output` ring buffer + `agent-job-output` WS
  broadcast pattern was already there from `add-agent-runner`;
  reverting to it took one code-shape swap.
- **The `<pre>` + inline SGR-to-span renderer is honest.** Claude
  in `-p` mode emits only text + occasional color codes, no
  cursor motion. A ~30-LOC inline converter handles the SGR subset
  and strips (defensively) any other escape sequence. Simpler and
  smaller than xterm.js, no localStorage / theme coupling, and it
  survives copy-paste of the whole transcript verbatim.
- **Spawn command line echo** ($ claude -p "..." synthetic first
  line) partially solves the -p-mode-buffers-until-end problem —
  the user at least sees WHAT was launched from t=0 even if the
  RESPONSE takes 30-90s to flush at completion.
- **Cancelling… feedback** solves the "Cancel button did nothing?"
  perception. SIGTERM to Claude in -p mode can take minutes to
  honor; the disabled `Cancelling…` label makes the wait explicit.
- **Session dogfooded end-to-end.** Multiple agent runs (Start →
  spawn → Claude produces plain output → completion or external
  discard) confirmed the piped-stdio path works.

## ⚠️ Surprises

- **`add-agent-pty-runner`, `add-agent-xterm-output`, and
  `add-agent-stdin-relay` were never archived.** Their proposals /
  specs / tasks are still in `openspec/changes/` — they were
  proposed + implemented but the archive step never ran (session
  moved on before them). This means their ADDED spec deltas never
  reached `openspec/specs/agent-runner/spec.md`. Consequence: this
  change's original spec delta (MODIFIED / REMOVED against those
  requirements) failed to apply — nothing to modify, nothing to
  remove. Rewrote the delta as pure ADDED to reflect the current
  reality: post-revert baseline as new requirements.
- **finish() disposing the worktree watcher was orthogonal.** When
  I added the piped-stdio spawn + `agent-job-removed` event, I
  didn't touch the watcher lifecycle. It was
  `add-worktree-external-discard-detection` (sibling change) that
  discovered the finish()-disposes-watcher bug during verify — see
  that change's outcome for details.
- **Cancel takes 30-90 seconds.** Not a bug — Claude Code in `-p`
  mode buffers its I/O and doesn't check for SIGTERM until it
  flushes. The `Cancelling…` UI makes this tolerable but not
  invisible. Would be worth a follow-up to also emit
  `[cancelling…]` line into the transcript.

## 🔁 Differently

- Initially added a SIGKILL fallback after SIGTERM timeout
  (5-second grace period). Reverted after user pointed out that
  Cancel WAS eventually working — the SIGKILL fallback would just
  hide the slow-to-honor behavior instead of surfacing it. Left
  Cancel as SIGTERM-only; the `Cancelling…` UI is the user-side
  fix.
- Considered keeping xterm.js for agent output as "we already ship
  it for the embedded terminal, why not." Rejected: xterm.js is
  overspec for `-p` mode's plain-text output. Two competing
  renderers on the same page (embedded terminal xterm.js + agent
  output xterm.js) also drove up memory / re-render cost.
- The `--verbose` / `--output-format=stream-json` flags for Claude
  Code were considered as ways to get progressive output during
  `-p` runs. Not tested — even if they work, the buffered-flush
  problem is only partial. Deferred to a follow-up as "explore
  Claude Code output-format options."

## 🌱 Follow-ups

- **Archive the 3 upstream reverted changes.** `add-agent-pty-
  runner` / `add-agent-xterm-output` / `add-agent-stdin-relay`
  should be archived with `outcome.md` notes pointing at THIS
  change so their in-flight status doesn't mislead future readers.
  Not urgent — they read as active in the Kanban but their code
  is gone; anyone reading their proposal.md will see the design,
  and this change's spec delta captures the final state. Left in-
  flight for a future cleanup session.
- **Runner lifecycle narration.** `[creating worktree …]` /
  `[worktree ready (2.3s)]` / `[spawn] claude …` before the actual
  spawn line would further improve the "something is happening"
  signal. Complementary to spawn-command-line echo.
- **Claude Code `--output-format=stream-json` exploration.** If
  it emits progressive tokens, we could parse and forward as
  incremental `agent-job-output` events, eliminating the
  buffered-flush wait.
- **`add-agent-lifecycle-narration`** as a formal follow-up
  proposal — encompasses the two above.

## 📋 Verify notes

- §9.1 (`typecheck / test / build`) all green through this change
  and every subsequent commit.
- §9.2 (agent runs `-p` mode) verified end-to-end via UI Start →
  spawn → Claude output → completion (or external discard).
- §9.3 (`<pre>` + colored spans, no literal `\x1b[` visible)
  verified by inspection in the Agents transcript.
- §9.4 (agent completes, tasks.md ticks in worktree) partially
  observed — Claude in this session's runs sometimes halted on
  Preflight (change doesn't exist), sometimes ran to completion;
  when it ran, tasks.md ticks landed in the worktree as
  expected.
- §9.5 (`POST /api/agents/jobs/:id/input` returns 404) not tested
  via curl — the endpoint definition is gone from server/index.ts;
  request would route through Fastify's 404 handler.
- §9.6 (embedded terminal still works) verified — the terminal
  pane at ChangeDetail still renders xterm.js and connects via
  `/pty` WS unchanged.
- §9.7 (upstream 3 changes archived) NOT DONE. Left for a future
  cleanup pass; see Follow-ups.
