# Outcome — signal-stage-completion-via-agmsg-message

Fix for a real bug surfaced by today's `verify-dispatch-e2e`
dispatch: the agmsg branch's polling model treats "file/commit
present" as "worker finished", which mis-fires when the worker is
paused at an interactive prompt (Claude Code's commit confirmation)
or when the artifact was left over from the previous stage
(review.md persisting into verify).

Replaces polling with an explicit **message-based completion
signal**. The worker sends `stage:$S status:done` to Manager when
finished; Manager waits for that message via `inbox.sh` at the
same cadence and ceilings as the old poll, then reads the existing
artifacts (review.md verdict, git log) exactly like it always did.
`review.md` remains the durable record.

## ✅ Worked

- **Root cause named clearly.** The verify uncovered three
  intertwined issues (commit-trigger wrong, verify's file already
  there from review, live-shell semantic mismatch). All three
  reduce to one root: the poll is inferring completion from
  side-effects instead of receiving a completion event.
- **Copilot survives.** Copilot can `send` (just can't Monitor).
  End-of-task report is a one-shot send, so copilot workers slot
  into this design without an extra branch.
- **`inbox.sh` grep pattern verified in one shell round-trip.**
  Format is `  [<ts>] <sender>: <body>`; grep `\] $entry_name:
  .*stage:$S status:done` matches. First attempt used
  `check-inbox.sh` (which is a Stop-hook script with different
  args) — corrected before landing.
- **Duplicates suppress via DB state, not client bookkeeping.**
  `inbox.sh` marks messages read; subsequent iterations see them
  as already consumed. No local "processed" set needed.
- **`review.md` contract untouched.** Archive flow, verdict schema,
  history semantics all unchanged. This change is skill-only.

## ⚠️ Surprises

- **`check-inbox.sh` is not what I first thought.** Confused it
  with the actual read-inbox script for a moment. `check-inbox.sh`
  is the Stop-hook plumbing (takes `<type> <project_path>`);
  `inbox.sh` is the message-read tool (takes `<team> <agent_id>`).
  Verified via `--help` and script header before committing the
  right one to the skill.
- **`review.md` location bug (Copilot writing to main tree) not
  fixed here.** Out of scope — that's a worker-skill-level cwd
  handling issue in `/opsx:review`, orthogonal to this change.
  Documented as follow-up.
- **Retry with 1-second delay for review.md race.** Worker's send
  may complete before its `write` flushes to disk. The 1-second
  retry catches that. Not a hypothetical — SQLite WAL commits and
  file-system commits are independent and can be out-of-order.

## 🔁 Differently next time

- **Verify script signatures upstream before drafting the skill.**
  I would have written the wrong `check-inbox.sh` reference into
  the archived skill if I hadn't run a smoke test. Small habit:
  before landing bash into a skill, run each command once with the
  arguments the skill will pass and confirm the output shape.
- **`review.md` location bug should have been called out in the
  P2b/c postscript.** The verify raised it as an issue but it's
  been open since we first ran a Copilot review — it deserves its
  own change.

## 🌱 Follow-ups

- **`review.md` cwd bug fix** (Copilot writes to main tree). Fix
  path options: (a) in the boot-prompt, ask the worker to write to
  the absolute worktree path; (b) after receipt, Manager MOVES a
  main-tree review.md into the correct worktree location; (c)
  patch `/opsx:review` skill to accept an explicit `--output`.
  Best is probably (a) — Manager's boot-prompt already includes
  everything else; adding an explicit path is a small change.
- **live-shell semantic clarification.** With this change, agmsg
  branch is officially "spawn per stage, one message back per
  stage" — not "persistent worker with iteration". The spec's
  `Agent Mode Field` requirement's live-shell definition (the
  original "stdin-piped" text) is now definitively legacy; a
  follow-up should rewrite it.
- **Copilot receive limitation to spec.** Not documented in the
  dispatcher spec that copilot workers cannot iterate via send.
  Add a scenario stating fresh-spawn per iteration for copilot.
- **Live e2e re-run**. Once the `review.md` cwd bug is fixed,
  re-run `verify-dispatch-e2e` (or a fresh throwaway) end-to-end
  with the message-based judgment. Should be smoother because the
  commit-trigger issue is gone.
- **Timeout tuning**. 15 min code / 5 min review-verify are
  hand-picked. If real workloads consistently trip the review
  ceiling because Copilot is slow, revisit the constants at the
  head of the skill.
