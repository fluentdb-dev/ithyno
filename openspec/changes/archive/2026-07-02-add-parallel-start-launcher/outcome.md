# Outcome — add-parallel-start-launcher

## ✅ Worked

- The IN-PROGRESS column header now carries a `Start ▾ (N)` popover
  that mirrors the TODO header's `+ New Change` — same slot, same
  visual weight, opposite direction of gesture. Discoverable from
  exactly the column the user is watching progress in.
- The candidate list reuses the `hasNonVerifyWork` + `isRunningOrPending`
  predicates already shared with the card-level Start gate — so
  `Start ▾ (N)` and each card's Start button agree on what "startable"
  means. One helper for the whole surface.
- Dispatch flows through the unified `useStartFlow().startImplementation`,
  so the launcher and the card share the same ExecutionPicker → picker
  reads `proposal.execution` and either dispatches directly or opens
  the picker; identical UX regardless of entry point.
- Popover dismissal (Esc + outside-click) worked on the first try —
  the pattern reuses the same `useEffect` listeners we already use in
  the ExecutionPicker.

## ⚠️ Surprises

- The candidate count reveals an ambiguity we didn't fully resolve at
  proposal time: **"Docs-only" changes count as startable** (docs
  sections are non-verify per `hasNonVerifyWork`), so a change with
  only markdown edits left shows up in the list. Not a bug for this
  change — it's a policy decision that belongs to the predicate —
  but worth noting for future launcher tuning.
- No parallel-count limit is enforced. The proposal explicitly left
  it out; in practice, on this dev machine, 2–3 concurrent Claude
  agents was the comfortable ceiling, higher started causing terminal
  jitter. Worth documenting as an operational note if we ever scale
  it up.

## 🔁 Differently

- The proposal considered "auto-launch next-in-queue" and rejected it
  — kept explicit user picks. That held up: watching the launcher
  pop and click was more useful than a background scheduler would
  have been, because seeing the count drop after a spawn is the
  operator's feedback.
- The popover starts hidden and requires a click. Considered showing
  the count as a permanent badge instead; the popover-on-demand shape
  won because it forces one deliberate gesture per launch.

## 🌱 Follow-ups

- **Verification tasks 6.2–6.6 are unchecked.** They require live
  parallel agent execution to observe — deferred because the same
  session that landed the launcher was also debugging the agent
  runner (pty, stdin, xterm) and the "run three agents in parallel"
  scenario needs a stable underlay to actually verify. Follow-up
  smoke test after the agent-runner side of the session settles.
- **Docs-only changes in the candidate list.** Same follow-up as
  `hide-run-on-verify-only`'s note: if we decide docs sections should
  bump a change out of the startable set, that's a predicate change
  affecting both this launcher and the card-level Start.
- **Concurrency limit as an operational knob**. Not needed today;
  worth a small preference (`agents.yaml` level) if operators start
  hitting resource ceilings.
