# Outcome: add-agent-runner

## ✅ Worked

- **Worktree-per-change isolation is the right primitive.** `git worktree
  add -b agent/<id> .worktrees/<id> HEAD` gives each agent a fresh
  filesystem view without cloning, and the agent's edits stay on its own
  branch until we merge. Parallel runs can't step on each other's files
  because they aren't looking at the same files.
- **Job model landed as sketched.** In-memory `AgentRunner` with a
  `jobs: Map<id, Job>` and a `locks: Map<changeId, jobId>` for
  one-agent-per-change enforcement. `newId()` gives a monotonic id, the
  ring buffer caps output, and the WS broadcast (`agent-job-started`,
  `agent-job-output`, `agent-job-finished`) drives the Agents page's
  live tail without any polling.
- **Verify 13.4 (parallel).** Two agents on unrelated changes ran to
  completion in parallel without observable interference during
  development — confirmed by watching `.worktrees/` grow to two
  sibling directories and seeing both tails advance in the Agents page.

## ⚠️ Surprises

- **`stdio: ["ignore", "pipe", "pipe"]` broke Claude Code.** The MVP
  shipped with piped stdio and Claude Code detected "no TTY, cannot
  start interactive session," idled at 0% CPU, and never wrote
  meaningful output. This turned out to be the entire motivation for
  the downstream `add-agent-pty-runner` follow-up — and, transitively,
  for `add-agent-xterm-output` and `add-agent-stdin-relay`. See the
  Follow-ups section: those layers are being reverted in favor of the
  `-p` (non-interactive) flag, which is much simpler and fits the way
  the CLIs actually want to be scripted.
- **Lock is per-changeId, not per-worktree.** The intuitive
  serialization key is "the change I'm working on," not the physical
  worktree directory. This ended up mattering when we added orphan
  adoption (a different change): the lock keys align, so an adopted
  orphan claims the same slot a fresh Run would.
- **Merge / Discard as terminal injection, not server actions.** The
  Merge and Discard buttons on the Kanban card write the `git merge`
  / `git worktree remove` command into the embedded terminal for the
  human to review and press Enter, rather than the server running the
  command itself. That's a design tradeoff — slower, but the user sees
  exactly what will happen and can edit or abort. Matched the
  dashboard-wide "the terminal is the source of truth" pattern.

## 🔁 Differently

- The proposal drafted a per-agent output ring buffer keyed by pty
  output plus an atexit flush to disk. The atexit flush was punted;
  the ring buffer lives in memory and is lost on server restart. For
  the local-dev use case that's fine — you can re-Run.
- Considered an SSE stream in addition to WS for the output tail.
  Rejected: WS already handles the multi-message broadcast pattern we
  need, and adding SSE would double the fan-out plumbing. If we ever
  need offline replay, revisit.

## 🌱 Follow-ups

- **`revert-agent-pty-to-p-flag`** — the entire PTY layer chain
  (`add-agent-pty-runner` → `add-agent-xterm-output` →
  `add-agent-stdin-relay`) is being reverted. Running Claude Code with
  `-p "<initial input>"` sidesteps the TUI/permission-prompt problem
  those layers were solving. The base runner defined in THIS change
  (`child_process.spawn` with piped stdio) stays; the reverting change
  re-enables that path and adds `-p` composition in `agents.yaml`.
- **`add-changedetail-merge-discard` follow-up.** Kanban card exposes
  Merge / Discard / Archive; ChangeDetail exposes only Archive (plus
  Start via `useStartFlow`). Verified §13.5 / §13.6 through the Kanban
  side only; the ChangeDetail parity is the follow-up change's scope.
  Proposal drafted at `openspec/changes/add-changedetail-merge-discard/`.

## 📋 Verify notes

- **§13.1, §13.2, §13.4**: dogfood-observed repeatedly during this
  session (spawned agents, tailed output live, ran two agents in
  parallel).
- **§13.3 (second Run → 409)**: UI already gates a second Start
  (add-parallel-start-launcher's guard) so the 409 branch is a
  defense-in-depth for direct API callers; the UI path is verified.
- **§13.5 (Merge preview)**: `add-task-filter`'s Kanban card → preview
  reads `git merge --no-ff agent/add-task-filter`, matching the
  archive skill's pattern.
- **§13.6 (Discard preview)**: same card → preview reads
  `git worktree remove --force <abs>/.worktrees/add-task-filter && git branch -D agent/add-task-filter`.
  `--force` is intentional (Discard is destructive by design);
  absolute path avoids CWD dependence.
- **§13.7 (SIGTERM on server exit)**: server killed while an agent was
  running → agent process exited within a few seconds, worktree
  directory left on disk for manual recovery, as designed.
- **Persistent job history** — the in-memory ring buffer loses output
  across server restart. A small SQLite append log for finished jobs
  would let us "show me last week's agent runs" without needing the
  server to have stayed up. Nice-to-have; skip until asked.
