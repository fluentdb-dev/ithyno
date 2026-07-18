# Outcome — harden-dispatch-from-round3

## ✅ Worked

- **Single MODIFIED to `Dispatch Slash Command`** cleanly composed
  with the three prior landed changes (signal-stage-completion,
  write-review-md-to-explicit-path, clarify-agmsg-dispatch-semantics).
  No `Agent Mode Field` overlap; the delta lives entirely in one
  requirement.
- **Manager-owns-commit rewrite** is backwards-compatible via the
  no-op branch: a self-committing worker leaves the tree clean AND
  a new commit, Manager's commit step becomes a no-op, no duplicate
  commit. So users who kept `/ithy-opsx:apply` as their code worker
  see no behavior change beyond a warning.
- **`agents.yaml` default flipped to `/opsx:apply`** — the "recommended"
  path is now the safe one, and `/ithy-opsx:apply`'s interactive
  commit prompt no longer traps agmsg workers.
- **Manager registration guard** landed in two places (dispatch start
  + per-spawn) using `join.sh` idempotency — no state machine, no
  reference counting, just "if not there, put back".
- **Failure recovery ladder** normatively forbids bare `reset.sh` in
  skill paths and documents the despawn → leave+kill-pane fallback.
  Operator-improvised cleanup is now against the spec.

## ⚠️ Surprises

- **The prior `code stage advances on report message` scenario in the
  landed spec** was worded to accept both worker-commit and Manager-
  fallback-commit paths. I initially thought I could just refine the
  wording, but on close reading it was ambiguous ("if the tree has
  uncommitted worker output, Manager SHALL commit... and then
  advance"). The new spec keeps that fallback but drops the "if a
  new commit landed" bullet to make Manager's role unconditional —
  a small but real semantic shift. The scenario section reflects
  this by splitting into three explicit cases: dirty-tree (commit),
  clean-tree-new-commit (no-op), clean-tree-no-commit (escalate).
- **`team.sh` output format for the Manager registration guard grep
  is untested** in this change — I used `grep -qE '^\s*manager\s'`
  based on the shape observed during Round 3, but no automated test
  covers it. First real dispatch after this lands is the smoke
  test; if the grep is wrong the guard is a no-op, and the worker's
  send.sh failure will still surface the underlying registration
  issue (just later than intended).

## 🔁 Differently next time

- **Round 3 verify was Case 4 pattern** (multiple bugs surfaced from
  one run, batched into one propose). This worked for related /
  same-requirement bugs. If a future verify uncovers bugs that span
  multiple capabilities or requirements, splitting into 2-3 focused
  proposes is cleaner even at the cost of more archives.
- **Skill body edits + normative spec edits should probably ship
  together like this**, not sequentially. The prior three landed
  changes were spec-only; this one restores the "skill matches spec"
  invariant. Doing spec + skill in one archive is the correct
  granularity — a "delta drift" period between them is confusing.

## 🌱 Follow-ups

- **agmsg upstream (`fujibee/agmsg`)** — the `run/spawn.<team>__<name>`
  first-invocation mkdir gap (B5 in the bug taxonomy) and `reset.sh`
  scope semantics (B3 root cause) are the layer this skill defends
  against. Upstream fix for either would let the skill drop its
  defensive code. Consider filing an issue upstream after real-world
  use confirms the shape.
- **Post-dispatch cleanup wiring** — the failure recovery ladder is
  now spec'd, but the skill body doesn't yet invoke `despawn.sh` at
  end-of-stage. Currently panes linger until the tmux session ends.
  A dedicated follow-up ("cleanup-worker-panes-post-stage") would
  wire that in — deferred because it's independent from the three
  bugs this change fixes and needs its own design decision
  (per-stage cleanup vs. end-of-dispatch cleanup).
- **Verification via a real dispatch run** — this change modifies
  the dispatcher itself; the only end-to-end test is spawning a
  new `verify-dispatch-e2e-N` change and running it through the
  loop. Deferred to a Round 4 verify session (with clean
  disposable branch, per Round 3 lessons learned).
- **Interactive commit prompt in `/ithy-opsx:apply`** — this change
  makes `/opsx:apply` the recommended dispatched worker, but does
  not remove `/ithy-opsx:apply`'s commit step for direct user
  invocation. If the interactive prompt becomes a burden for direct
  users too, a separate change to strip auto-commit (or make it
  non-interactive) is a candidate.
