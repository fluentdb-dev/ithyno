# Outcome — harden-dispatch-round5

## ✅ Worked

- **Awk-based AGMSG_TEAM extraction** is a small, self-contained
  replacement — same shape at both sites (step 5 guard + agmsg
  branch spawn block), no cross-cutting fallout.
- **Subprocess/Task-tool artifact contract addition** re-uses the
  agmsg branch's boilerplate verbatim. The three branches now
  agree on `<TARGET_PATH>/openspec/changes/<change-id>/review.md`
  as the read/write target — one absolute path, no cwd-inference
  surprises.
- **Manager review.md read via `$REVIEW_MD_PATH`** fixed the
  underlying mismatch that made worktree mode "work by luck" on
  Copilot (which happens to ignore cwd). A well-behaved reviewer
  now succeeds too.
- Delta reproduces the full landed requirement (from
  harden-dispatch-from-round3) and threads the 3 changes in
  without dropping any scenarios or invariants.

## ⚠️ Surprises

- **Round 4 didn't catch B12** because I hardcoded `AGMSG_TEAM=
  openspec-ui` in my manual bash rather than running through the
  skill's actual sed. That's a testing gap: manual verify passes
  can miss extraction bugs that only bite when the skill runs
  end-to-end from an unmodified body. Room to codify a real
  skill-body dry-run smoke test in the future.
- **Copilot's cwd-ignore behavior was "helpful" by accident** in
  earlier rounds — because the disposable branch also existed
  in the main tree during smoke tests, Copilot writing to main
  tree matched where Manager read from. On a real change that's
  landed and merged, that coincidence disappears — Round 5 with
  a compliant reviewer would have failed. Good that we caught
  the architecture flaw before it caused a real broken run.

## 🔁 Differently next time

- **Verify the skill's actual extraction, not a re-implementation.**
  When Round 6 runs (or any future dispatch verify), extract the
  sed/awk snippet from `dispatch.md` verbatim and run it, not a
  hand-typed equivalent.
- **Cover Task tool branch + subprocess branch in the same verify
  session.** Round 5 did that — that's why B13 surfaced. Making
  this the standard verify pattern (agmsg + non-agmsg in one
  session) would catch this class of regression sooner.

## 🌱 Follow-ups

- **BSD/GNU test matrix for the skill.** No automated coverage
  today. A small shell test asserting the awk snippet works on
  BSD would prevent regressions.
- **Skill body cleanup automation** — the failure recovery ladder
  is now spec'd across two changes (harden-dispatch-from-round3
  + this) but the skill body still leaves `despawn.sh` calls to
  the operator. Auto-cleanup at end-of-stage is a candidate
  next change.
- **Round 6 verify (agmsg + non-agmsg mixed)** — a full smoke
  test with the updated skill covering all three branches
  (agmsg, Task tool, subprocess) in one session would prove
  the changes end-to-end.
- **The Verify stage still has no agent role in `agents.yaml`**.
  When the user actually wants dispatch to reach the verify
  stage without escalation, adding a `verify` role to the copilot
  entry (or a dedicated `ithy-opsx:verify` worker) closes that
  gap.
