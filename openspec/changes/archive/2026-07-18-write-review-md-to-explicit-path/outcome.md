# Outcome — write-review-md-to-explicit-path

Fix for the review.md-at-main-tree bug surfaced by
`verify-dispatch-e2e`. Instead of trusting the worker CLI's cwd
inference, the dispatcher now names the absolute target path in the
boot-prompt and reads back from that exact location.

## ✅ Worked

- **Belt-and-suspenders design.** The fix works whether or not the
  worker skill (`/opsx:review`) honors cwd correctly. If it does,
  the artifact contract is redundant but harmless. If it doesn't
  (today's Copilot state), the explicit-path instruction sidesteps
  the bug entirely.
- **Compute path once, use twice.** `TARGET_PATH` and
  `REVIEW_MD_PATH` are computed in the worktree-setup step and
  referenced by both the boot-prompt (worker-facing) and the
  Manager's post-report read. No drift possible between "where
  the worker was told to write" and "where the Manager looks".
- **Code stage stays untouched.** Artifact contract is only
  appended for `review` / `verify` stages; code stage produces
  no review.md so no contract there. `if [ "$S" = "review" ]
  || [ "$S" = "verify" ]` guard makes this explicit.
- **Order matters — artifact contract before report contract.**
  So a well-behaved worker writes review.md and only then sends
  the completion signal. This prevents the message-arrives-before-
  file race we already had a 1-second retry for.

## ⚠️ Surprises

- **The spec's MODIFIED delta had to include the FULL requirement
  text.** MODIFIED replacements are wholesale in openspec — every
  scenario I kept had to be re-written verbatim in the delta, plus
  the 3 new ones for the artifact-contract cases. ~200 lines of
  scenario text carried forward. Reminder: when a MODIFIED delta
  only tweaks one paragraph, the rest is still your responsibility
  to preserve.
- **`<TARGET_PATH>` is exposed to the worker in the boot-prompt.**
  Absolute filesystem paths in prompts are mildly info-leaky, but
  the same path is already in the `--project` spawn flag, so this
  isn't new leakage.

## 🔁 Differently next time

- **Draft the FULL MODIFIED spec text as the FIRST step**, not as
  an afterthought. openspec's MODIFIED contract is "here's the new
  requirement text in its entirety" — treat it like a rewrite, not
  a patch.

## 🌱 Follow-ups

- **Fix `/opsx:review` skill's cwd handling directly.** The
  artifact contract makes the dispatcher robust, but the underlying
  skill bug is still there. When a user runs `/opsx:review`
  standalone (outside dispatch), it'll still mis-locate the file.
  Track separately.
- **Live e2e re-run** on a fresh throwaway change to confirm
  review.md lands at the worktree path this time. Deferred here;
  can happen alongside the next dispatch verify.
- **Escalation message includes `$REVIEW_MD_PATH`.** Nice touch —
  future user debugging sees exactly which path was expected. But
  make sure the path doesn't leak sensitive information in
  logs / archives.
- **Code stage doesn't currently have an equivalent "write output
  here" contract.** In principle a code worker might want to know
  which worktree branch to commit to (which is `agent/<change-id>`,
  well-known). If workers ever need more explicit guidance, this
  pattern generalizes.
