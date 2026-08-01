## ✅ What worked

- The existing `agmsg()` accessor pattern on `AgentRegistry` was a
  perfect template for `tmux()` — same validate-then-cache-then-accessor
  shape, so the change was almost entirely mechanical once the schema
  decision (flat top-level scalar, not nested under `agmsg`) was made.
- Keeping the OR-composition (`tmux() || agmsg !== null`) at the
  `ptyStartup()` call site rather than folding it into the registry
  kept `AgentRegistry` a thin parsed-value store — the "agmsg implies
  tmux" *policy* lives in exactly one place.
- Reusing `tmuxSessionName()`, the `-A` reattach flag, and the
  fallback-banner shape verbatim meant the MODIFIED spec delta only
  had to change the *condition* paragraph and a couple of prose
  references — most of the requirement's scenario coverage
  (session naming, project-switch kill, `ITHYNO_TMUX_SESSION`
  override, re-attach idempotence) needed no logic changes at all,
  just carrying the existing scenarios forward unchanged.

## ⚠️ What surprised us

- The "Embedded PTY Uses tmux When Agmsg Is Configured" requirement
  in the landed spec was longer than expected — it also owns the
  three-tier Manager-startup-resolution scenarios (fallback session-id
  minting, resume, manager-entry override) that have nothing to do
  with tmux. Writing the MODIFIED delta meant copying all of that
  forward too, not just the tmux-specific paragraphs, since a MODIFIED
  delta is a full replacement of the named requirement.

## 🔁 What we'd do differently

- If this requirement grows again, it's worth splitting "tmux
  wrap decision" out from "manager startup command resolution" into
  two separate spec requirements — they're already two different
  concerns bundled under one heading, and every future MODIFIED delta
  against either half has to restate the whole thing.

## 🌱 Follow-ups

- No UI exposure for `tmux: true` — it's a hand-edited `agents.yaml`
  field like every other top-level toggle today. A Settings-page
  toggle could be a follow-up if users ask for it.
- Worker-pane tmux usage (`/agmsg spawn`) is untouched and still
  gated entirely by the `agmsg` block, as before.
