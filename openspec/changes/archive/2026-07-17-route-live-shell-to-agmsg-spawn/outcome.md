# Outcome — route-live-shell-to-agmsg-spawn

P2b/c (unified). Added a first-priority "agmsg spawn" branch to the
dispatcher's helper protocol: when a worker is `mode: live-shell`
and the workspace has an `agmsg:` block, the Manager routes it via
`/agmsg spawn <type> <name> --boot-prompt "<prompt>"` instead of the
subprocess `-p` / Task tool paths. Skill-only change — no code
touched.

## ✅ Worked

- **agmsg's own API collapsed the split.** The original plan had
  P2b (dispatcher routing) and P2c (worker bootstrap) as separate
  changes. Reading the agmsg README revealed `spawn --boot-prompt`
  does BOTH — it creates the tmux pane AND injects the boot task.
  Merging the two proposals into one matches agmsg's surface and
  keeps the change small (~120 lines of skill text).
- **PENDING annotation position.** Placed the blockquote AFTER the
  first SHALL paragraph of the `Dispatch Slash Command` requirement
  (per the "learned earlier" fix). Validator accepted; the current
  spec now warns future readers that the dispatch protocol is
  in-flight.
- **Command-name inference table.** Hardcoded 7 mappings (`claude
  → claude-code`, `codex → codex`, etc.) in the skill body — zero
  agents.yaml schema change needed. Any unmapped command escalates
  cleanly with `agmsg-type unknown for command: <cmd>`. Explicit
  `agmsgType` override is deferred to when a real user needs it.
- **Fall-through preserved on agmsg-not-installed.** Presence check
  on `~/.agents/skills/agmsg/scripts/send.sh` before entering the
  branch; when absent, the skill logs a notice and drops through
  to the existing Task tool / subprocess branches. Users who have
  `agmsg:` configured but haven't installed the plugin locally
  don't get a hard failure — they get today's behavior + a hint.
- **Poll-based judgment.** The 3-stage success contract already
  consumed `review.md` (the file, not exit code) for review/verify;
  extending that to code (poll `git log agent/<change-id>`) was a
  small conceptual step. 15-min / 5-min ceilings are configurable
  constants at the top of the polling shape.

## ⚠️ Surprises

- **agmsg is a Claude plugin, not a shell library.** I initially
  imagined the dispatcher would call `~/.agents/skills/agmsg/scripts/
  spawn.sh` directly. The README made clear that `/agmsg` is a
  Claude slash command (or `$agmsg` for non-Claude agents), and the
  scripts are the internal implementation. The dispatcher — which
  runs inside Claude as the Manager — uses `/agmsg spawn ...`
  directly. That's cleaner but means "no agmsg installed" means
  "the plugin isn't loaded in this Claude session".
- **Spawn blocks until listening, not until done.** `agmsg spawn`
  returns as soon as the peer registers, not when the boot task
  completes. The old 3-stage contract's "subprocess exit code = task
  done" limb doesn't apply. Polling is the honest replacement —
  git log for code, review.md for review/verify.
- **Manual verify is gated on user's Claude session.** The three
  manual verify scenarios (5.3/5.4/5.5) need agmsg installed in a
  user-side Claude session (`/plugin marketplace add fujibee/agmsg`)
  because this harness's Claude cannot install plugins for the
  target session. Left as deferred with clear notes in tasks.md.

## 🔁 Differently next time

- **Read the target tool's README before splitting proposals.** The
  P2b/P2c split was based on my own model of how agmsg would work;
  the README's `spawn --boot-prompt` collapsed that model. Cost:
  one scoping decision + one AskUserQuestion round.
- **When manual verify depends on user-side install, say so in the
  propose.** Would have set expectations that `verify` is
  intentionally split from `impl` for this change.

## 🌱 Follow-ups

- **Explicit `agmsgType` field** on agents.yaml agent entries when
  the command-name inference proves insufficient. Would be a small
  server + registry change (validator + expose in `AgentPublic`).
- **Stale-pane cleanup**: every `agmsg spawn` creates a new tmux
  pane. Over long dispatch loops (5 iterations × 3 stages = up to
  15 panes) the tmux session accumulates dead panes. `agmsg cleanup
  <name>` or `tmux kill-pane -t "$name"` at task-done time would
  keep the tmux session tidy.
- **Polling ceiling tuning.** 15 min code / 5 min review-verify are
  hand-picked defaults. Once real workloads land, expose as skill-
  header constants or per-project config.
- **Restart recovery for the agmsg branch.** When the Manager PTY
  dies mid-dispatch and re-attaches (P2's `-A` idempotence), the
  spawned worker pane may still be running the boot task. The
  restart-recovery guardrail assumes phase check + resume; agmsg's
  spawned worker doesn't know we restarted. Might need an inbox
  check + re-send. Deferred until first real reproduction.
- **User-side install verify.** Once user installs agmsg locally,
  re-run 5.3/5.4/5.5 and update this outcome with a "verified
  live" postscript.
